/* global fetch, AbortSignal */
import assert from 'node:assert/strict';
import process from 'node:process';
import { Buffer } from 'node:buffer';
import { spawn,spawnSync,execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { readFileSync,writeFileSync,mkdirSync,existsSync,unlinkSync,readdirSync } from 'node:fs';
import { fileURLToPath,URL,URLSearchParams } from 'node:url';
import { randomBytes,createHash } from 'node:crypto';
import { setTimeout as wait } from 'node:timers/promises';
import { migrateAdminDB,adminSQL,adminRows } from './admin-db.mjs';

const mode=process.argv[2];assert(['dev','built'].includes(mode));
const root=fileURLToPath(new URL('../',import.meta.url));const output=new URL('../.cloudflare/evidence/',import.meta.url);mkdirSync(output,{recursive:true});
const keyFile=new URL('../.env.reader-admin-test.local',import.meta.url);
assert(!existsSync(keyFile),'Refuse to overwrite an existing local secret file');
const key=randomBytes(32).toString('hex');let ownedKey=false;let server;let logs='';
let requestsInCurrentRateBucket=0;
const port=mode==='dev'?49557:49558;const origin=`http://127.0.0.1:${port}`;
const result={mode,startedAt:new Date().toISOString(),checks:[]};
const check=(label,value)=>{assert(value,label);result.checks.push(label);};
const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
const privateMarkers=['ADMIN_PRIVATE_','DRAFT_ONLY_BOOK_','WITHDRAWN_ONLY_BOOK_','DRAFT_EDITOR_NOTE_SENTINEL','DRAFT_SHARED_EDITOR_NOTE_SENTINEL','DRAFT_BODY_SENTINEL','DRAFT_SHARED_BODY_SENTINEL','WITHDRAWN_BODY_SENTINEL','WITHDRAWN_EDITOR_NOTE_SENTINEL','DRAFT_QUOTE_SENTINEL','DRAFT_SHARED_QUOTE_SENTINEL','WITHDRAWN_QUOTE_SENTINEL'];
const paths=['/api/v1/admin/issues','/api/v1/admin/issues/draft-hidden','/api/v1/admin/books/draft-book'];
// Native D1 subprocesses may outlast local HTTP keepalive. Use fresh test
// connections rather than retrying a failed request or relaxing its timeout.
async function request(path,options={}) {
  const response=await fetch(new URL(path,origin),{...options,headers:{'Accept-Encoding':'identity',Connection:'close',...options.headers},redirect:'manual',signal:AbortSignal.timeout(20000)});
  const text=await response.text();assert(!text.includes(key),'Configured key must never appear in a response');
  if(path.startsWith('/api/v1/admin/')) {
    assert(/no-store/.test(response.headers.get('cache-control')??''),'Every management response is no-store');
    assert((response.headers.get('vary')??'').toLowerCase().includes('authorization'),'Management responses vary by Authorization');
  }
  return {status:response.status,headers:response.headers,text,json:text && (response.headers.get('content-type')??'').includes('application/json')?JSON.parse(text):null};
}
const authorized=async(path,options={})=>{
  // This suite covers management read behavior, not quota accounting. Keep its
  // long pagination matrix below the production bucket cap; verify:limits tests
  // threshold behavior independently on the same native D1 implementation.
  if(requestsInCurrentRateBucket>=80){adminSQL('DELETE FROM admin_rate_limit_buckets');requestsInCurrentRateBucket=0;}
  requestsInCurrentRateBucket++;
  return request(path,{...options,headers:{Authorization:`Bearer ${key}`,...options.headers}});
};
async function start() {
  const env={...process.env};delete env.CONTENT_API_KEY;delete env.VITE_CONTENT_API_KEY;
  server=spawn(process.execPath,['node_modules/vite/bin/vite.js',mode==='dev'?'dev':'preview','--mode','reader-admin-test','--host','127.0.0.1','--port',String(port)],{cwd:root,env,detached:true,stdio:['ignore','pipe','pipe']});
  let phaseLogs='';for(const stream of [server.stdout,server.stderr])stream.on('data',chunk=>{logs+=chunk;phaseLogs+=chunk;});
  const deadline=Date.now()+60000;while(!phaseLogs.includes(origin)){if(server.exitCode!==null)throw new Error('Owned admin test server exited');if(Date.now()>deadline)throw new Error('Owned admin test startup timed out');await wait(100);}
}
async function stop() {
  if(server && server.exitCode===null){const exited=once(server,'exit');process.kill(-server.pid,'SIGTERM');if(!(await Promise.race([exited.then(()=>true),wait(5000,undefined,{ref:false}).then(()=>false)]))){try{process.kill(-server.pid,'SIGKILL');}catch{/* already exited */}}}server=undefined;
}
const assertError=(r,status,code)=>{assert.equal(r.status,status);assert(r.json,'Expected structured JSON error');assert.deepEqual(Object.keys(r.json).sort(),['error','requestId']);assert.equal(r.json.error.code,code);assert.equal(r.headers.get('x-request-id'),r.json.requestId);assert(!privateMarkers.some(marker=>r.text.includes(marker)));};
async function walk(status,limit=2){const actual=[];let next=null;let count=0;do{const query=new URLSearchParams({limit:String(limit)});if(status!==null)query.set('status',status);if(next)query.set('cursor',next);const r=await authorized('/api/v1/admin/issues?'+query);assert.equal(r.status,200);assert(r.json.items.length<=limit);actual.push(...r.json.items.map(row=>row.id));next=r.json.nextCursor;assert(++count<50);}while(next!==null);return actual;}
try {
  migrateAdminDB();adminSQL('DELETE FROM admin_rate_limit_buckets;DELETE FROM quotes;DELETE FROM issues;DELETE FROM books;'+readFileSync(new URL('../fixtures/seed.sql',import.meta.url),'utf8')+readFileSync(new URL('../fixtures/admin.sql',import.meta.url),'utf8'));
  await start();
  for(const path of paths){const r=await authorized(path);assertError(r,503,'ADMIN_UNAVAILABLE');check(`Missing Worker secret fails closed at ${path}`,true);}
  check('Public reads remain available without a management secret',(await request('/api/v1/issues/published-latest')).status===200);
  await stop();writeFileSync(keyFile,`CONTENT_API_KEY=${key}\n`,{flag:'wx',mode:0o600});ownedKey=true;
  if(mode==='built'){
    const env={...process.env};delete env.CONTENT_API_KEY;
    const built=spawnSync('npm',['run','build','--','--mode','reader-admin-test'],{cwd:root,env,encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:16*1024*1024});
    const buildLog=(built.stdout??'')+(built.stderr??'');assert(!buildLog.includes(key),'Build output must not echo secret');logs+=buildLog;assert.equal(built.status,0,'Owned configured-secret build must pass');
  }
  await start();
  for(const path of paths){
    const failures=[];
    for(const headers of [{},{Authorization:'Bearer wrong'},{Authorization:'Basic wrong'},{Authorization:'Bearer'},{Authorization:'Bearer wrong, Bearer other'},{Authorization:'Bearer '+ 'x'.repeat(4097)},{'X-Reader-Visibility':'published','X-Admin-Status':'admin','X-Middleware-Subrequest':'proxy:proxy:proxy'}]){const r=await request(path,{headers});assertError(r,401,'UNAUTHORIZED');failures.push(JSON.stringify(r.json.error));}
    check(`Anonymous/malformed/wrong/forged headers all get the same401 at ${path}`,new Set(failures).size===1);
    const positive=await authorized(path);check(`Configured Worker Bearer authorizes ${path}`,positive.status===200);
  }
  check('Bearer authentication scheme is case-insensitive',(await authorized(paths[0],{headers:{Authorization:`bearer ${key}`}})).status===200);
  const native=execFileSync('ps',['-axo','pid=,ppid=,pgid=,command='],{encoding:'utf8'}).split('\n').map(line=>/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/.exec(line)).filter(m=>m&&Number(m[3])===server.pid&&m[4].includes('/workerd')&&/\bserve\b/.test(m[4])).map(m=>({pid:Number(m[1]),group:Number(m[3]),command:m[4]}));
  check('Requests execute in an owned native workerd process',native.length>0);result.runtimeProcesses=native;
  for(const param of ['key','api_key','CONTENT_API_KEY','access_token']){const r=await request('/api/v1/admin/issues?'+param+'='+key);assertError(r,401,'UNAUTHORIZED');check(`Query ${param} never authenticates`,true);}
  const first=await authorized(paths[0]);check('Default20 bounded items/nextCursor envelope',first.json.items.length===20&&Object.keys(first.json).sort().join(',')==='items,nextCursor');
  const all=await authorized(paths[0]+'?limit=100');const expected=adminRows('SELECT id,status,publication_date FROM issues ORDER BY publication_date DESC,id DESC');
  check('Unfiltered list includes all40 rows and all three states',all.status===200&&all.json.items.length===40&&new Set(all.json.items.map(row=>row.status)).size===3&&all.json.nextCursor===null);
  check('Exact D1 dateDESC/idDESC order and trailingNULL dates',JSON.stringify(all.json.items.map(row=>row.id))===JSON.stringify(expected.map(row=>row.id))&&all.json.items.slice(-10).every(row=>row.publicationDate===null));
  const payload=JSON.parse(Buffer.from(first.json.nextCursor,'base64url').toString());check('Cursor has explicit management scope and all-state binding',payload.scope==='admin-issues'&&payload.status===null&&payload.id===first.json.items.at(-1).id);
  for(const status of [null,'draft','published','withdrawn']){const actual=await walk(status);const filtered=expected.filter(row=>status===null||row.status===status).map(row=>row.id);check(`Keyset traversal has no gaps/duplicates through ${status??'all'} including NULL boundary`,JSON.stringify(actual)===JSON.stringify(filtered)&&new Set(actual).size===actual.length);}
  const afterNull=await authorized(paths[0]+'?cursor='+encode({v:1,scope:'admin-issues',status:null,publicationDate:null,id:'A'}));check('After final NULL key yields empty terminal page',afterNull.status===200&&afterNull.json.items.length===0&&afterNull.json.nextCursor===null);
  for(const value of ['', '0','-1','1.0','1.5','001','1e2','NaN','Infinity','101','1000',' 20']){const r=await authorized(paths[0]+'?limit='+encodeURIComponent(value));assertError(r,400,'INVALID_LIMIT');check(`Invalid bounded limit ${JSON.stringify(value)}`,true);}
  for(const query of ['status=','status=all','status=DRAFT','status=draft,published','status=draft&status=published','limit=1&limit=2','cursor=a&cursor=b','sort=id','key='+key]){const r=await authorized(paths[0]+'?'+query);assert.equal(r.status,400);check(`Unknown/duplicate/invalid query rejected: ${query.split('=')[0]}`,true);}
  const shape={v:1,scope:'admin-issues',status:null,publicationDate:'2026-11-01',id:'published-latest'};
  const bad=['','%', 'x'.repeat(1025),'not-base64!',encode('not-object'),encode(null),encode([]),encode({...shape,v:2}),encode({...shape,scope:'public'}),encode({...shape,extra:1}),encode({...shape,publicationDate:'2026-02-30'}),encode({...shape,id:"x' OR 1=1 --"}),encode({...shape,id:''}),encode({v:1,publicationDate:'2026-11-01',id:'published-latest'}),encode({...shape,status:'draft',publicationDate:null})];
  for(const [index,cursor] of bad.entries()){const r=await authorized(paths[0]+'?cursor='+encodeURIComponent(cursor));assertError(r,400,'INVALID_CURSOR');check(`Malformed/scope/filter-mismatched cursor${index+1} rejected`,true);}
  const draftPage=await authorized(paths[0]+'?status=draft&limit=1');const draftCursor=draftPage.json.nextCursor;
  for(const filter of ['', '&status=published','&status=withdrawn']){const r=await authorized(paths[0]+'?cursor='+draftCursor+filter);assertError(r,400,'INVALID_CURSOR');check(`Draft cursor cannot be reused with ${filter||'omitted'} filter`,true);}
  const impossible=await authorized(paths[0]+'?status=draft&cursor='+encode({...shape,status:'draft'}));assertError(impossible,400,'INVALID_CURSOR');check('Impossible draft date cursor rejected',true);
  const publicCross=await request('/api/v1/issues?cursor='+first.json.nextCursor);assertError(publicCross,400,'INVALID_CURSOR');check('Management cursor cannot cross into public list',true);
  for(const [id,status] of [['draft-hidden','draft'],['draft-shared','draft'],['withdrawn-hidden','withdrawn'],['published-latest','published']]){const r=await authorized('/api/v1/admin/issues/'+id);check(`Authorized ${status} detail has data/currentBook/orderedQuotes and strong tag`,r.status===200&&Object.keys(r.json).join(',')==='data'&&r.json.data.status===status&&r.json.data.book.id===r.json.data.bookId&&/^"i:[A-Za-z0-9_-]+"$/.test(r.headers.get('etag')));}
  const incomplete=await authorized('/api/v1/admin/issues/admin-draft-00');check('Incomplete draft retains NULL identity/metadata and empty display strings',incomplete.json.data.publicationDate===null&&incomplete.json.data.issueNumber===null&&incomplete.json.data.editorNote===null&&incomplete.json.data.book.title===''&&incomplete.json.data.book.year===null);
  check('Private quote text/source/newlines and position order retained',incomplete.json.data.quotes.map(q=>q.position).join(',')==='0,1'&&incomplete.json.data.quotes[0].text==='ADMIN_PRIVATE_QUOTE_FIRST\n原样'&&incomplete.json.data.quotes[0].sourceLabel==='第1页');
  const book=await authorized('/api/v1/admin/books/shared-book');check('Book strong tag uses b:id:version format',book.status===200&&book.headers.get('etag')===`"b:shared-book:${book.json.data.version}"`);
  check('Unreferenced private Book is readable only through management',(await authorized('/api/v1/admin/books/admin-orphan-book')).json.data.title==='ADMIN_PRIVATE_ORPHAN_BOOK');
  for(const path of ['/api/v1/admin/issues/missing','/api/v1/admin/books/missing','/api/v1/admin/issues/bad.id','/api/v1/admin/books/bad.id']){const r=await authorized(path);assert.equal(r.status,404);check(`Missing/invalid ID is404 ${path}`,true);}
  for(const path of [paths[1]+'?status=draft',paths[2]+'?key='+key]){const r=await authorized(path);assertError(r,400,'INVALID_QUERY');check('Detail does not accept query arguments',true);}
  const issueA=await authorized('/api/v1/admin/issues/published-latest');const issueB=await authorized('/api/v1/admin/issues/draft-shared');const untouched=await authorized('/api/v1/admin/issues/draft-hidden');
  const [,identity,issueVersion,bookVersion]=/^"i:([A-Za-z0-9_-]+)-([0-9]{16})-([0-9]{16})"$/.exec(issueA.headers.get('etag'))??[];
  const [issueId,bookId]=JSON.parse(Buffer.from(identity,'base64url').toString());
  check('Issue tag safely encodes Issue and current shared Book identity/version',issueId==='published-latest'&&bookId==='shared-book'&&Number(issueVersion)===issueA.json.data.version&&Number(bookVersion)===book.json.data.version);
  adminSQL("UPDATE books SET title='SHARED_BOOK_CHANGED',version=version+1 WHERE id='shared-book'");
  const changedA=await authorized('/api/v1/admin/issues/published-latest');const changedB=await authorized('/api/v1/admin/issues/draft-shared');
  check('Shared Book mutation changes both Issue tags without changing Issue version',changedA.headers.get('etag')!==issueA.headers.get('etag')&&changedB.headers.get('etag')!==issueB.headers.get('etag')&&changedA.json.data.version===issueA.json.data.version&&changedA.json.data.book.title==='SHARED_BOOK_CHANGED');
  check('Unrelated Issue tag stays stable',(await authorized('/api/v1/admin/issues/draft-hidden')).headers.get('etag')===untouched.headers.get('etag'));
  check('Book version mutation changes its own strong tag',(await authorized('/api/v1/admin/books/shared-book')).headers.get('etag')!==book.headers.get('etag'));
  adminSQL("UPDATE quotes SET text='QUOTE_VERSION_CHANGED' WHERE id='latest-q1';UPDATE issues SET version=version+1 WHERE id='published-latest'");
  const quoteChanged=await authorized('/api/v1/admin/issues/published-latest');check('Quote-set mutation with its owning Issue version changes Issue tag',quoteChanged.headers.get('etag')!==changedA.headers.get('etag')&&quoteChanged.json.data.quotes[0].text==='QUOTE_VERSION_CHANGED');
  const dataFingerprint=()=>createHash('sha256').update(JSON.stringify(['books','issues','quotes'].map(table=>adminRows(`SELECT * FROM ${table} ORDER BY id`)))).digest('hex');
  const beforeMethods=dataFingerprint();
  for(const path of paths)for(const method of ['POST','PUT','PATCH','DELETE','OPTIONS']){const r=await authorized(path,{method});const guardedWrite=(method==='POST'&&(path==='/api/v1/admin/books'||path==='/api/v1/admin/issues'))||(method==='PATCH'&&(path.startsWith('/api/v1/admin/books/')||path.startsWith('/api/v1/admin/issues/')));assert.equal(r.status,guardedWrite?400:405,`${method} ${path}: ${r.text}`);assertError(r,guardedWrite?400:405,guardedWrite?'INVALID_IDEMPOTENCY_KEY':'METHOD_NOT_ALLOWED');check(`${method} is rejected without write prerequisites at ${path}`,true);}
  check('Rejected HTTP methods leave every D1 business row unchanged',dataFingerprint()===beforeMethods);result.rejectedMethodsD1SHA256=beforeMethods;
  const head=await authorized(paths[1],{method:'HEAD'});check('Authorized HEAD is bodyless and retains strong ETag',head.status===200&&head.text===''&&Boolean(head.headers.get('etag')));
  const badPost=await request(paths[0],{method:'POST'});assertError(badPost,401,'UNAUTHORIZED');check('Unsupported method still authenticates before405',true);
  for(const [id,status] of [['draft-hidden',404],['draft-shared',404],['admin-draft-00',404],['withdrawn-hidden',410],['admin-withdrawn-shared',410]])for(const path of ['/api/v1/issues/'+id,'/issues/'+id]){
    const r=await authorized(path);check(`Management credentials do not change public visibility ${path}`,r.status===status&&!privateMarkers.some(marker=>r.text.includes(marker)));
  }
  const concurrent=await Promise.all([authorized('/api/v1/admin/issues/draft-hidden'),authorized('/api/v1/issues/draft-hidden')]);check('Concurrent management/public reads do not share a private projection',concurrent[0].status===200&&concurrent[1].status===404&&!concurrent[1].text.includes('DRAFT_BODY_SENTINEL'));
  const publicList=await authorized('/api/v1/issues?limit=100');check('Authorized caller still gets published-only public list',publicList.json.items.every(row=>row.status==='published')&&!privateMarkers.some(marker=>publicList.text.includes(marker)));
  const publicFilter=await authorized('/api/v1/issues?status=draft');assertError(publicFilter,400,'INVALID_QUERY');check('Management status filtering does not leak into public API',true);
  for(const id of ['draft-hidden','withdrawn-hidden']){const r=await authorized('/issues/'+id+'?_rsc',{headers:{RSC:'1',Accept:'text/x-component','X-Reader-Visibility':'published'}});check(`Public RSC remains private-safe after admin reads: ${id}`,[404,410].includes(r.status)&&!privateMarkers.some(marker=>r.text.includes(marker)));}
  const unknown=await authorized('/api/v1/admin/probe');check('Old write probe remains absent',unknown.status===404);
  adminSQL("UPDATE books SET version=9007199254740993 WHERE id='admin-incomplete-book'");
  const unsafe=await authorized('/api/v1/admin/books/admin-incomplete-book');assertError(unsafe,503,'READ_UNAVAILABLE');check('Unsafe numeric version fails closed rather than emitting colliding strong tag',!unsafe.headers.has('etag'));
  const outputRoot=new URL('../.cloudflare/output/v0/',import.meta.url);let inspected=0;
  function scan(directory){if(!existsSync(directory))return;for(const entry of readdirSync(directory,{withFileTypes:true})){const path=new URL(entry.name+(entry.isDirectory()?'/':''),directory);if(entry.isDirectory())scan(path);else{assert(!readFileSync(path).includes(key),'Secret appeared in generated build/server/client output');inspected++;}}}
  if(mode==='built'){scan(outputRoot);check('Build with configured secret contains no value in any server/client/config output',inspected>0);result.buildFilesInspected=inspected;}
  check('Captured dev/build/Worker logs never echo configured secret',!logs.includes(key));
  result.status='passed';result.fixtureCount=40;result.listSHA256=createHash('sha256').update(JSON.stringify(all.json)).digest('hex');
}catch(error){result.status='failed';result.error=String(error.stack??error).split(key).join('[REDACTED]');if(error.cause)result.cause=String(error.cause.stack??error.cause).split(key).join('[REDACTED]');process.exitCode=1;}
finally{await stop();if(ownedKey)unlinkSync(keyFile);result.finishedAt=new Date().toISOString();writeFileSync(new URL(`admin-${mode}-result.json`,output),JSON.stringify(result,null,2));writeFileSync(new URL(`admin-${mode}-server.log`,output),logs.split(key).join('[REDACTED]'));process.stdout.write(JSON.stringify(result,null,2)+'\n');}
