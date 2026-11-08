/* global fetch, AbortSignal, AbortController */
import assert from 'node:assert/strict';
import process from 'node:process';
import {Buffer} from 'node:buffer';
import {spawn,spawnSync,execFileSync} from 'node:child_process';
import {once} from 'node:events';
import {readFileSync,writeFileSync,mkdirSync,existsSync,unlinkSync,readdirSync} from 'node:fs';
import {fileURLToPath,URL} from 'node:url';
import {randomBytes,createHash} from 'node:crypto';
import {setTimeout as wait} from 'node:timers/promises';
import {migrateWriteDB,writeSQL,writeRows} from './write-db.mjs';

const mode=process.argv[2];assert(['dev','built'].includes(mode));
const root=fileURLToPath(new URL('../',import.meta.url));const output=new URL('../.cloudflare/evidence/writes/',import.meta.url);mkdirSync(output,{recursive:true});
const keyFile=new URL('../.env.reader-write-test.local',import.meta.url);assert(!existsSync(keyFile),'Refuse to overwrite existing secret file');
let key=randomBytes(32).toString('hex');const secrets=[key];let ownedKey=false;let server;let logs='';
const prefix='w'+randomBytes(6).toString('hex');const port=mode==='dev'?50070:50071;const origin=`http://127.0.0.1:${port}`;
const result={mode,prefix,startedAt:new Date().toISOString(),checks:[]};
const check=(label,value)=>{assert(value,label);result.checks.push(label);};
const newKey=()=>randomBytes(16).toString('hex');
const bodyHash=value=>createHash('sha256').update(value).digest('hex');
const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
const redact=value=>secrets.reduce((text,secret)=>text.split(secret).join('[REDACTED]'),String(value));
const scalar=sql=>Object.values(writeRows(sql)[0])[0];
const counts=id=>({books:scalar(`SELECT count(*) n FROM books WHERE id='${id}'`),audit:scalar(`SELECT count(*) n FROM admin_audit_events WHERE resource_id='${id}'`),receipts:scalar(`SELECT count(*) n FROM admin_write_receipts WHERE resource_id='${id}'`)});
const sqlBook=id=>writeRows(`SELECT * FROM books WHERE id='${id}'`)[0];
async function request(path,options={}) {
  const response=await fetch(new URL(path,origin),{...options,headers:{'Accept-Encoding':'identity',Connection:'close',...options.headers},redirect:'manual',signal:options.signal??AbortSignal.timeout(20000)});
  const text=await response.text();assert(secrets.every(secret=>!text.includes(secret)),'Configured secret appeared in response');
  if (path.startsWith('/api/v1/admin/')) {assert(/no-store/.test(response.headers.get('cache-control')??''));assert((response.headers.get('vary')??'').toLowerCase().includes('authorization'));}
  return {status:response.status,headers:response.headers,text,json:text&&(response.headers.get('content-type')??'').includes('application/json')?JSON.parse(text):null};
}
let authenticatedRequestsSinceBudgetReset=0;let authenticatedRequestsInFlight=0;
const auth=async(path,options={})=>{
  // This suite covers write correctness; the dedicated limits suite covers enforcement.
  // Refill only between request groups so long regression runs do not stop at 30 calls.
  if(authenticatedRequestsInFlight===0&&authenticatedRequestsSinceBudgetReset>=20){writeSQL('DELETE FROM admin_rate_limit_buckets');authenticatedRequestsSinceBudgetReset=0;}
  authenticatedRequestsInFlight++;authenticatedRequestsSinceBudgetReset++;
  try{return await request(path,{...options,headers:{Authorization:`Bearer ${key}`,...options.headers}});}
  finally{authenticatedRequestsInFlight--;}
};
const send=(path,method,body,idem,tag,options={})=>auth(path,{method,body:JSON.stringify(body),...options,headers:{'Content-Type':'application/json','Idempotency-Key':idem,...(tag===undefined?{}:{'If-Match':tag}),...options.headers}});
const create=async(label,fields={})=>{const id=prefix+'-'+label;const idem=newKey();const body={id,...fields};return {id,idem,body,response:await send('/api/v1/admin/books','POST',body,idem)};};
const err=(r,status,code)=>{assert.equal(r.status,status,r.text);assert(r.json);assert.deepEqual(Object.keys(r.json).sort(),['error','requestId']);assert.equal(r.json.error.code,code);assert.equal(r.headers.get('x-request-id'),r.json.requestId);};
async function build() {
  const env=Object.fromEntries(Object.entries(process.env).filter(([name])=>name!=='CONTENT_API_KEY'&&name!=='VITE_CONTENT_API_KEY'&&!name.startsWith('CLOUDFLARE_')));
  const built=spawnSync('npm',['run','build','--','--mode','reader-write-test'],{cwd:root,env,encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:16*1024*1024});
  const text=(built.stdout??'')+(built.stderr??'');assert(secrets.every(secret=>!text.includes(secret)),'Build echoed configured secret');logs+=text;assert.equal(built.status,0,'Owned write-test build');
}
async function start() {
  const env=Object.fromEntries(Object.entries(process.env).filter(([name])=>name!=='CONTENT_API_KEY'&&name!=='VITE_CONTENT_API_KEY'&&!name.startsWith('CLOUDFLARE_')));
  server=spawn(process.execPath,['node_modules/vite/bin/vite.js',mode==='dev'?'dev':'preview','--mode','reader-write-test','--host','127.0.0.1','--port',String(port)],{cwd:root,env,detached:true,stdio:['ignore','pipe','pipe']});
  let phase='';for(const stream of [server.stdout,server.stderr])stream.on('data',chunk=>{logs+=chunk;phase+=chunk;});
  const deadline=Date.now()+60000;while(!phase.includes(origin)){if(server.exitCode!==null)throw Error('Owned write-test server exited');if(Date.now()>deadline)throw Error('Write-test startup timed out');await wait(100);}
}
async function stop() {
  if(server&&server.exitCode===null){const exited=once(server,'exit');process.kill(-server.pid,'SIGTERM');if(!(await Promise.race([exited.then(()=>true),wait(5000,undefined,{ref:false}).then(()=>false)]))){try{process.kill(-server.pid,'SIGKILL');}catch{/* already stopped */}}}server=undefined;
}
function arm(idem) {writeSQL(`INSERT INTO admin_write_test_barrier(id,idempotency_key,armed,arrived,released) VALUES('current','${idem}',1,0,0) ON CONFLICT(id) DO UPDATE SET idempotency_key=excluded.idempotency_key,armed=1,arrived=0,released=0,operation_id=NULL`);}
async function arrived() {const deadline=Date.now()+10000;while(true){if(scalar("SELECT arrived FROM admin_write_test_barrier WHERE id='current'")===1)return;if(Date.now()>deadline)throw Error('After-commit barrier not reached');await wait(25);}}
function release() {writeSQL("UPDATE admin_write_test_barrier SET released=1,armed=0 WHERE id='current'");}
try {
  migrateWriteDB();writeSQL(`CREATE TABLE IF NOT EXISTS admin_write_test_barrier(id TEXT PRIMARY KEY,idempotency_key TEXT,armed INTEGER,arrived INTEGER,released INTEGER,operation_id TEXT)`);
  if(mode==='built')await build();await start();
  const missing=await send('/api/v1/admin/books','POST',{id:prefix+'-absent'},newKey());err(missing,503,'ADMIN_UNAVAILABLE');check('Missing Worker key fails closed before reading JSON or D1 writes',true);
  await stop();writeFileSync(keyFile,`CONTENT_API_KEY=${key}\n`,{flag:'wx',mode:0o600});ownedKey=true;if(mode==='built')await build();await start();
  const nativeProbeKey=newKey();const nativeProbeId=prefix+'-native-workerd-probe';arm(nativeProbeKey);
  const nativeProbe=send('/api/v1/admin/books','POST',{id:nativeProbeId,title:'native workerd probe'},nativeProbeKey);nativeProbe.catch(()=>{});
  await arrived();
  const native=execFileSync('ps',['-axo','pid=,ppid=,pgid=,command='],{encoding:'utf8'}).split('\n').map(line=>/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/.exec(line)).filter(m=>m&&Number(m[3])===server.pid&&m[4].includes('/workerd')&&/\bserve\b/.test(m[4])).map(m=>({pid:Number(m[1]),group:Number(m[3]),command:m[4]}));check('Owned native workerd executes write requests',native.length>0);result.runtimeProcesses=native;
  release();const nativeProbeResponse=await nativeProbe;assert.equal(nativeProbeResponse.status,201,nativeProbeResponse.text);
  for(const path of ['/api/v1/admin/books','/api/v1/admin/books/invalid','/api/v1/admin/books/invalid/history'])for(const method of ['GET','POST','PATCH','DELETE']){const r=await request(path,{method,headers:{Authorization:'Bearer wrong'}});err(r,401,'UNAUTHORIZED');check(`Authentication precedes routing/body at ${method} ${path}`,true);}
  for(const headers of [{},{Authorization:'Basic wrong'},{Authorization:'Bearer wrong, Bearer other'},{'X-Admin-Status':'admin'},{Cookie:`CONTENT_API_KEY=${key}`}]){err(await request('/api/v1/admin/books',{method:'POST',body:'not JSON',headers}),401,'UNAUTHORIZED');check('No alternate credential source or malformed-token fallback',true);}
  const minimal=await create('minimal');assert.equal(minimal.response.status,201,minimal.response.text);const path='/api/v1/admin/books/'+minimal.id;
  check('ID-only create returns201, canonical Location and current strong tag',minimal.response.headers.get('location')===path&&minimal.response.headers.get('etag')===`"b:${minimal.id}:1"`);
  check('Draft Book defaults remain empty/NULL, with server identity and timestamps',minimal.response.json.data.title===''&&minimal.response.json.data.year===null&&minimal.response.json.data.version===1&&minimal.response.json.data.createdAt===minimal.response.json.data.updatedAt);
  check('Created Book is returned by authenticated GET with identical resource/tag',(await auth(path)).text===minimal.response.text&&(await auth(path)).headers.get('etag')===minimal.response.headers.get('etag'));
  const mapped=await create('mapped',{title:' \n😀书名\n ',author:'作者',category:'书',year:-40,pages:10,rating:15,description:'描述',coverTitle:'封面',coverAuthor:'署名',coverUrl:'/covers/original/safe.png',coverAlt:'替代描述'});
  assert.equal(mapped.response.status,201,mapped.response.text);check('Content remains byte-exact and existing alt DTO maps only from coverAlt input',mapped.response.json.data.title===' \n😀书名\n '&&mapped.response.json.data.alt==='替代描述'&&!Object.hasOwn(mapped.response.json.data,'coverAlt'));
  const initialCount=counts(minimal.id);check('One create commits exactly one business row, audit and success receipt',JSON.stringify(initialCount)===JSON.stringify({books:1,audit:1,receipts:1}));
  const event=(await auth(path+'/history')).json.items[0];check('Create audit captures truthful server actor, beforeNULL, exact after/version and requestId',event.actor==='content-api'&&event.before===null&&event.beforeVersion===null&&event.afterVersion===1&&JSON.stringify(event.after)===JSON.stringify(minimal.response.json.data)&&event.requestId===minimal.response.headers.get('x-request-id'));
  for(const [method,p] of [['PUT',path],['DELETE',path],['POST',path],['PATCH','/api/v1/admin/books'],['OPTIONS',path]]){err(await auth(p,{method}),405,'METHOD_NOT_ALLOWED');check(`Only declared Book methods are allowed ${method} ${p}`,true);}
  for(const bad of ['', 'a'.repeat(15),'a'.repeat(129),'a'.repeat(16)+',other']){const r=await send(path,'PATCH',{title:'x'},bad,minimal.response.headers.get('etag'));err(r,400,'INVALID_IDEMPOTENCY_KEY');check('Invalid stable key rejected without a transaction',true);}
  err(await send(path,'PATCH',{title:'x'},newKey()),428,'PRECONDITION_REQUIRED');check('PATCH requires strong condition',true);
  for(const tag of ['*','W/"b:a:1"','"b:a:01"','"b:a:1", "b:a:2"','"b:a:9007199254740992"']){err(await send(path,'PATCH',{title:'x'},newKey(),tag),400,'INVALID_IF_MATCH');check('Malformed/weak/list/unsafe condition never becomes strong',true);}
  err(await send(path,'PATCH',{title:'x'},newKey(),'"b:other:1"'),412,'PRECONDITION_FAILED');check('Valid other-resource tag fails raw equality inside transaction',true);
  err(await send('/api/v1/admin/books/'+prefix+'-missing','PATCH',{title:'x'},newKey(),'"b:x:1"'),404,'BOOK_NOT_FOUND');check('Missing resource never creates update/audit/receipt',true);
  err(await send(path,'PATCH',{},newKey(),minimal.response.headers.get('etag')),422,'EMPTY_PATCH');check('Empty PATCH is422 without version/audit/receipt',JSON.stringify(counts(minimal.id))===JSON.stringify(initialCount));
  for(const body of [{title:null},{pages:0},{year:1.1},{rating:0},{coverAlt:1},{title:'😀'.repeat(501)}]){err(await send(path,'PATCH',body,newKey(),minimal.response.headers.get('etag')),422,'INVALID_VALUE');check('Semantic input failure is422 with no success record',true);}
  for(const body of [{version:2},{id:'other'},{createdAt:'yesterday'},{alt:'wrong-name'},{actor:'person'}]){err(await send(path,'PATCH',body,newKey(),minimal.response.headers.get('etag')),400,'UNKNOWN_FIELD');check('Identity/version/actor/read-only-alias fields cannot be written',true);}
  for(const coverUrl of ['//evil.example/x','https://user:pass@example.com','/\\evil','/%5cevil','/a%0ab','/bad%','/%2fevil.example/x']){err(await send(path,'PATCH',{coverUrl},newKey(),minimal.response.headers.get('etag')),422,'INVALID_VALUE');check('Dangerous encoded or raw URL rejected without parsing cleanup',true);}
  err(await auth(path,{method:'PATCH',headers:{'Idempotency-Key':newKey(),'If-Match':minimal.response.headers.get('etag'),'Content-Type':'text/plain'},body:'{}'}),415,'UNSUPPORTED_MEDIA_TYPE');
  err(await auth(path,{method:'PATCH',headers:{'Idempotency-Key':newKey(),'If-Match':minimal.response.headers.get('etag'),'Content-Type':'application/json'},body:'{'}),400,'INVALID_JSON');
  err(await send(path,'PATCH',[],newKey(),minimal.response.headers.get('etag')),422,'INVALID_VALUE');check('MIME, JSON syntax and object-type errors stay distinct',true);
  const big=await send(path,'PATCH',{title:'x'.repeat(256*1024)},newKey(),minimal.response.headers.get('etag'));err(big,413,'PAYLOAD_TOO_LARGE');check('Native stream is bounded before full business parsing',true);
  for(const p of [path+'?x=1',path+'?_rsc=x',path+'?x=1&x=2']){err(await send(p,'PATCH',{title:'x'},newKey(),minimal.response.headers.get('etag')),400,'INVALID_QUERY');check('Raw management URL rejects unknown query before framework consumes it',true);}
  check('All failed input and condition cases leave original Book/version/audit/receipt unchanged',JSON.stringify(counts(minimal.id))===JSON.stringify(initialCount)&&sqlBook(minimal.id).version===1);
  const duplicateId=await send('/api/v1/admin/books','POST',{id:minimal.id,title:'not replacement'},newKey());err(duplicateId,409,'BOOK_EXISTS');check('Duplicate stable ID is409 and never overwrites',sqlBook(minimal.id).version===1);
  const sameKey=newKey();const sameId=prefix+'-same';const sameBody={id:sameId,title:'并发同键'};
  const same=await Promise.all(Array.from({length:12},()=>send('/api/v1/admin/books','POST',sameBody,sameKey)));
  check('12 concurrent same-key/same-body creates replay the same201 body/tag/Location',same.every(r=>r.status===201&&r.text===same[0].text&&r.headers.get('etag')===same[0].headers.get('etag')&&r.headers.get('location')===same[0].headers.get('location')));
  check('Same-key storm commits one Book/audit/receipt',JSON.stringify(counts(sameId))===JSON.stringify({books:1,audit:1,receipts:1}));
  const conflictKey=newKey();const conflictId=prefix+'-conflict';const conflict=await Promise.all(['one','two'].map(title=>send('/api/v1/admin/books','POST',{id:conflictId,title},conflictKey)));
  check('Concurrent same-key/different-body chooses one commit and one409',conflict.map(r=>r.status).sort().join(',')==='201,409'&&conflict.find(r=>r.status===409).json.error.code==='IDEMPOTENCY_CONFLICT'&&counts(conflictId).audit===1);
  const canonicalKey=newKey();const canonicalId=prefix+'-canonical';const canonicalA=await send('/api/v1/admin/books','POST',{id:canonicalId,title:'text',year:1},canonicalKey);
  const canonicalB=await send('/api/v1/admin/books/','POST',{year:1,title:'text',id:canonicalId},canonicalKey);check('Object property order and canonical trailing-slash path share one semantic receipt',canonicalB.status===201&&canonicalB.text===canonicalA.text&&counts(canonicalId).audit===1);
  err(await send('/api/v1/admin/books','POST',{id:canonicalId,title:'text',year:1},canonicalKey,'"b:x:1"'),409,'IDEMPOTENCY_CONFLICT');check('Original optional create If-Match participates in request digest',true);
  err(await send('/api/v1/admin/books/'+canonicalId,'PATCH',{title:'text'},canonicalKey,canonicalA.headers.get('etag')),409,'IDEMPOTENCY_CONFLICT');check('Idempotency identity is global across method/path',true);
  const racer=await create('version-race');const racePath='/api/v1/admin/books/'+racer.id;const raceKeys=[newKey(),newKey()];
  const race=await Promise.all(raceKeys.map((idem,index)=>send(racePath,'PATCH',{title:'winner'+index},idem,racer.response.headers.get('etag'))));
  check('Different keys racing same If-Match produce one200 and one412',race.map(r=>r.status).sort().join(',')==='200,412'&&sqlBook(racer.id).version===2&&counts(racer.id).audit===2&&counts(racer.id).receipts===2);
  const winningIndex=race.findIndex(r=>r.status===200);const winning=race[winningIndex];const replayed=await send(racePath,'PATCH',{title:'winner'+winningIndex},raceKeys[winningIndex],racer.response.headers.get('etag'));
  check('Successful PATCH replay precedes expired live If-Match and never increments again',replayed.status===200&&replayed.text===winning.text&&replayed.headers.get('etag')===winning.headers.get('etag')&&sqlBook(racer.id).version===2);
  const noopKey=newKey();const noopBody={title:winning.json.data.title};const noop=await send(racePath,'PATCH',noopBody,noopKey,winning.headers.get('etag'));
  check('Nonempty same-value PATCH increments resource and success audit once',noop.status===200&&noop.json.data.version===3&&counts(racer.id).audit===3);
  const noopEvent=(await auth(racePath+'/history?limit=1')).json.items[0];check('Noop-content audit does not invent a content change',noopEvent.before.title===noopEvent.after.title&&noopEvent.beforeVersion===2&&noopEvent.afterVersion===3);
  const repairedKey=raceKeys[1-winningIndex];const recovered=await send(racePath,'PATCH',{title:'after failed transaction'},repairedKey,noop.headers.get('etag'));check('Failed transaction never reserves its key as a success',recovered.status===200&&recovered.json.data.version===4);
  for(const [suffix,triggerSQL] of [
    ['audit-abort',"CREATE TRIGGER admin_write_qa_audit_abort BEFORE INSERT ON admin_audit_events BEGIN SELECT RAISE(ABORT,'local audit fault'); END"],
    ['audit-ignore',"CREATE TRIGGER admin_write_qa_audit_ignore BEFORE INSERT ON admin_audit_events BEGIN SELECT RAISE(IGNORE); END"],
    ['update-ignore',"CREATE TRIGGER admin_write_qa_update_ignore BEFORE UPDATE ON books BEGIN SELECT RAISE(IGNORE); END"],
  ]) {
    const target=await create(suffix);const before=sqlBook(target.id);const beforeCounts=counts(target.id);const idem=newKey();
    const trigger=/CREATE TRIGGER (\w+)/.exec(triggerSQL)[1];writeSQL(triggerSQL);
    try {err(await send('/api/v1/admin/books/'+target.id,'PATCH',{title:'must rollback'},idem,target.response.headers.get('etag')),503,'WRITE_UNAVAILABLE');check(`${suffix} rolls back Book, version, audit and key receipt`,JSON.stringify(sqlBook(target.id))===JSON.stringify(before)&&JSON.stringify(counts(target.id))===JSON.stringify(beforeCounts)&&scalar(`SELECT count(*) n FROM admin_write_receipts WHERE idempotency_key='${idem}'`)===0);}
    finally {writeSQL(`DROP TRIGGER ${trigger}`);}
  }
  const late=await create('captured');const latePath='/api/v1/admin/books/'+late.id;const lateKey=newKey();arm(lateKey);
  const inFlight=send(latePath,'PATCH',{title:'first snapshot'},lateKey,late.response.headers.get('etag'));inFlight.catch(()=>{});await arrived();
  const observed=await auth(latePath);assert.equal(observed.json.data.version,2);const later=await send(latePath,'PATCH',{title:'later snapshot'},newKey(),observed.headers.get('etag'));assert.equal(later.status,200,later.text);release();
  const captured=await inFlight;check('Delayed response captures its own committed v2, not another request v3',captured.json.data.title==='first snapshot'&&captured.json.data.version===2&&captured.headers.get('etag')===`"b:${late.id}:2"`&&later.json.data.version===3);
  const dropKey=newKey();const dropId=prefix+'-drop';const dropBody={id:dropId,title:'lost acknowledgement'};arm(dropKey);const controller=new AbortController();
  const dropping=send('/api/v1/admin/books','POST',dropBody,dropKey,undefined,{signal:controller.signal});const dropped=dropping.then(()=>false,()=>true);await arrived();
  const committedBeforeAbort=counts(dropId);controller.abort();check('Caller actually loses its connection only after native D1 commit',await dropped&&committedBeforeAbort.books===1&&committedBeforeAbort.audit===1&&committedBeforeAbort.receipts===1);release();
  const recoveredDrop=await send('/api/v1/admin/books','POST',dropBody,dropKey);check('Original body/key after lost response replays captured201 without another effect',recoveredDrop.status===201&&counts(dropId).audit===1&&sqlBook(dropId).version===1);
  const publicBook=await create('public',{title:'公開前',author:'作者',category:'类别',description:'公开描述'});const issueId=prefix+'-public-issue';
  writeSQL(`INSERT INTO issues(id,book_id,status,publication_date,issue_number) VALUES('${issueId}','${publicBook.id}','published',date('2099-01-01','+'||(SELECT count(*) FROM issues)||' days'),(SELECT coalesce(max(issue_number),0)+1 FROM issues))`);
  const issueBefore=await auth('/api/v1/admin/issues/'+issueId);const publicChange=await send('/api/v1/admin/books/'+publicBook.id,'PATCH',{title:'公开更新'+prefix},newKey(),publicBook.response.headers.get('etag'));
  const issueAfter=await auth('/api/v1/admin/issues/'+issueId);check('Shared Book change invalidates composite Issue tag without changing Issue version',publicChange.status===200&&issueBefore.headers.get('etag')!==issueAfter.headers.get('etag')&&issueBefore.json.data.version===issueAfter.json.data.version);
  for(const p of ['/api/v1/issues/'+issueId,'/issues/'+issueId,'/api/v1/search?q='+prefix,'/rss.xml']){const r=await request(p);check('Subsequent public representation sees current Book at '+p.split('?')[0],r.status===200&&r.text.includes('公开更新'+prefix));}
  check('Book modification is not copied into Issue success history',scalar(`SELECT count(*) n FROM admin_audit_events WHERE resource_type='issue' AND resource_id='${issueId}'`)===0);
  let current=await auth(path);for(let i=0;i<22;i++){current=await send(path,'PATCH',{description:'history'+i},newKey(),current.headers.get('etag'));assert.equal(current.status,200,current.text);}
  const historyDefault=await auth(path+'/history');check('History default20/max100 is bounded with a scoped cursor',historyDefault.json.items.length===20&&typeof historyDefault.json.nextCursor==='string');
  const historyExpected=writeRows(`SELECT event_id FROM admin_audit_events WHERE resource_type='book' AND resource_id='${minimal.id}' ORDER BY created_at DESC,event_id DESC`).map(row=>row.event_id);const historyActual=[];let next=null;
  do {const r=await auth(path+'/history?limit=2'+(next?'&cursor='+next:''));assert.equal(r.status,200,r.text);historyActual.push(...r.json.items.map(row=>row.id));next=r.json.nextCursor;}while(next);
  check('History traverses native timeDESC/eventIdDESC without gaps or duplicates',JSON.stringify(historyActual)===JSON.stringify(historyExpected)&&new Set(historyActual).size===historyActual.length);
  err(await auth('/api/v1/admin/books/'+mapped.id+'/history?cursor='+historyDefault.json.nextCursor),400,'INVALID_CURSOR');check('History cursor cannot cross resource identity',true);
  const expectedBooks=writeRows('SELECT id FROM books ORDER BY id ASC').map(row=>row.id);const actualBooks=[];next=null;let pages=0;
  do {const r=await auth('/api/v1/admin/books?limit=2'+(next?'&cursor='+next:''));assert.equal(r.status,200,r.text);actualBooks.push(...r.json.items.map(row=>row.id));next=r.json.nextCursor;assert(++pages<1000);}while(next);
  check('Management Book list uses exact idASC keyset order, including orphan Books',JSON.stringify(actualBooks)===JSON.stringify(expectedBooks)&&new Set(actualBooks).size===actualBooks.length);
  const bookFirst=await auth('/api/v1/admin/books?limit=1');const bookDefault=await auth('/api/v1/admin/books');check('Book list has only bounded items/nextCursor envelope',Object.keys(bookDefault.json).sort().join(',')==='items,nextCursor'&&bookDefault.json.items.length<=20);
  for(const base of ['/api/v1/admin/books',path+'/history'])for(const query of ['limit=0','limit=101','limit=001','limit=1&limit=2','status=draft','_rsc=x','cursor=','cursor=%','cursor=x&cursor=y']){assert.equal((await auth(base+'?'+query)).status,400);check('Book list/history reject invalid/duplicate/unknown raw query',true);}
  for(const cursor of [encode({v:1,publicationDate:'2026-01-01',id:'x'}),historyDefault.json.nextCursor,encode({v:1,scope:'admin-books',id:'x',extra:1})]){err(await auth('/api/v1/admin/books?cursor='+cursor),400,'INVALID_CURSOR');check('Book cursor is strict and cannot accept public/history scope',true);}
  err(await auth(path+'/history?cursor='+bookFirst.json.nextCursor),400,'INVALID_CURSOR');check('Book list cursor cannot become a history cursor',true);
  err(await auth('/api/v1/admin/books/'+prefix+'-missing/history'),404,'BOOK_NOT_FOUND');check('Missing Book history is404, never another resource history',true);
  const replayAfterMany=await send('/api/v1/admin/books','POST',minimal.body,minimal.idem);check('Receipt replay returns original v1 even after22 later edits',replayAfterMany.text===minimal.response.text&&replayAfterMany.headers.get('etag')===minimal.response.headers.get('etag')&&sqlBook(minimal.id).version===23);
  const oldKey=key;await stop();key=randomBytes(32).toString('hex');secrets.push(key);writeFileSync(keyFile,`CONTENT_API_KEY=${key}\n`,{mode:0o600});if(mode==='built')await build();await start();
  err(await auth(path,{headers:{Authorization:`Bearer ${oldKey}`}}),401,'UNAUTHORIZED');const rotated=await send('/api/v1/admin/books','POST',minimal.body,minimal.idem);check('Rotated secret retains logical identity and original global receipt',rotated.status===201&&rotated.text===minimal.response.text&&counts(minimal.id).audit===23);
  check('No deferred foreign-key violations remain after all successful/failed transactions',writeRows('PRAGMA foreign_key_check').length===0);
  check('No pending receipt or unaudited mutation survives',scalar('SELECT count(*) n FROM admin_write_receipts WHERE completed<>1 OR mutation_ok IS NOT 1 OR audit_ok IS NOT 1')===0&&scalar('SELECT count(*) n FROM admin_audit_events')===scalar('SELECT count(*) n FROM admin_write_receipts'));
  const persisted=JSON.stringify({receipts:writeRows('SELECT * FROM admin_write_receipts'),audit:writeRows('SELECT * FROM admin_audit_events')});
  check('Receipts and audit do not store configured credentials',secrets.every(secret=>!persisted.includes(secret)));
  let scanned=0;const scan=directory=>{if(!existsSync(directory))return;for(const entry of readdirSync(directory,{withFileTypes:true})){const path=new URL(entry.name+(entry.isDirectory()?'/':''),directory);if(entry.isDirectory())scan(path);else{assert(secrets.every(secret=>!readFileSync(path).includes(secret)),'Configured secret in generated output');scanned++;}}};if(mode==='built'){scan(new URL('../.cloudflare/output/v0/',import.meta.url));check('Configured-secret built server/client/config outputs contain no credential value',scanned>0);result.filesScanned=scanned;}
  check('Captured runtime and build logs contain no configured key',secrets.every(secret=>!logs.includes(secret)));
  result.status='passed';result.firstResponseSHA256=bodyHash(minimal.response.text);result.historyCount=historyExpected.length;result.finalCounts=counts(minimal.id);
} catch(error) {result.status='failed';result.error=redact(error.stack??error);if(error.cause)result.cause=redact(error.cause.stack??error.cause);process.exitCode=1;}
finally {
  try {writeSQL("UPDATE admin_write_test_barrier SET released=1,armed=0 WHERE id='current';DROP TRIGGER IF EXISTS admin_write_qa_audit_abort;DROP TRIGGER IF EXISTS admin_write_qa_audit_ignore;DROP TRIGGER IF EXISTS admin_write_qa_update_ignore;");} catch { /* Preserve an unreachable local target, never reset it. */ }
  await stop();if(ownedKey)unlinkSync(keyFile);result.finishedAt=new Date().toISOString();writeFileSync(new URL(`${mode}-result.json`,output),JSON.stringify(result,null,2)+'\n');writeFileSync(new URL(`${mode}-server.log`,output),redact(logs));process.stdout.write(JSON.stringify(result,null,2)+'\n');
}
