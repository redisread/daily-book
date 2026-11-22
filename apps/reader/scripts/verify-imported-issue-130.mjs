/* global fetch, AbortSignal */
import assert from 'node:assert/strict';
import process from 'node:process';
import {spawn,spawnSync} from 'node:child_process';
import {once} from 'node:events';
import {randomBytes,createHash} from 'node:crypto';
import {existsSync,mkdirSync,writeFileSync,unlinkSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath,URL} from 'node:url';
import {setTimeout as wait} from 'node:timers/promises';
import {stripAnsi} from './readiness.mjs';
import {managementRows} from './management-db.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const args=process.argv.slice(2);assert(args.length===2&&args[0]==='--input'&&!args[1].startsWith('--'),'Usage: verify-imported-issue-130.mjs --input <approved-inventory.json>');
const input=resolve(args[1]);
assert.equal(createHash('sha256').update(readFileSync(input)).digest('hex'),'4918f76db3da19ba122ed01073b942551ed8e64d926a5c5ee8fb2d370879b5ad','Inventory bytes differ from the approved immutable package');
const stateDir=new URL('../.cloudflare/management-state',import.meta.url);
const evidenceDir=new URL('../.cloudflare/evidence/management/',import.meta.url);
const evidenceFile=new URL(`issue-130-${Date.now()}.json`,evidenceDir);
const keyFile=new URL('../.env.reader-admin-write-test.local',import.meta.url);
const port=50076;const origin=`http://127.0.0.1:${port}`;
// The pinned importer itself refuses unknown/nonempty targets and verifies an
// existing complete receipt as an exact no-op; never reset/recreate this state.
assert(!existsSync(evidenceFile),'Refuse to overwrite existing task72 evidence');
assert(!existsSync(keyFile),'Refuse to overwrite an existing local Worker key file');
const key=randomBytes(32).toString('hex');let server;let logs='';
const result={startedAt:new Date().toISOString(),checks:[]};
const check=(name,value)=>{assert(value,name);result.checks.push(name);};
const newKey=()=>randomBytes(16).toString('hex');
const redacted=value=>String(value).split(key).join('[REDACTED]');
function runImporter(){
  const env=Object.fromEntries(Object.entries(process.env).filter(([name])=>name!=='CONTENT_API_KEY'&&!name.startsWith('CLOUDFLARE_')));
  const run=spawnSync('node_modules/.bin/tsx',['scripts/import-history-management.ts','--input',input,'--apply-local'],{cwd:fileURLToPath(new URL('../../../',import.meta.url)),env,encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:12*1024*1024});
  const output=(run.stdout??'')+(run.stderr??'');
  if(run.status!==0)throw new Error(`Pinned management import failed (${run.status}): ${output.slice(-1200)}`);
  const parsed=JSON.parse(run.stdout);assert(['applied-local','noop-verified'].includes(parsed.status));assert.equal(parsed.fieldChecks,6345);return parsed;
}
async function build(){
  const env=Object.fromEntries(Object.entries(process.env).filter(([name])=>name!=='CONTENT_API_KEY'&&name!=='VITE_CONTENT_API_KEY'&&!name.startsWith('CLOUDFLARE_')));
  const run=spawnSync('npm',['run','build','--','--mode','reader-admin-write-test'],{cwd:root,env,encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:20*1024*1024});
  const output=(run.stdout??'')+(run.stderr??'');assert(!output.includes(key),'Build output contains local key');logs+=output;assert.equal(run.status,0,'Local management Worker test build');
}
function start(){
  const env=Object.fromEntries(Object.entries(process.env).filter(([name])=>name!=='CONTENT_API_KEY'&&name!=='VITE_CONTENT_API_KEY'&&!name.startsWith('CLOUDFLARE_')));
  const mode=server?.mode??'dev';const command=mode==='built'?'preview':'dev';
  const child=spawn(process.execPath,['node_modules/vite/bin/vite.js',command,'--mode','reader-admin-write-test','--host','127.0.0.1','--port',String(port)],{cwd:root,env,detached:true,stdio:['ignore','pipe','pipe']});
  let phase='';for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{const text=String(chunk);logs+=text;phase+=text;});
  const ready=(async()=>{const deadline=Date.now()+60000;while(!stripAnsi(phase).includes(origin)){if(child.exitCode!==null)throw Error('Owned issue130 Worker exited');if(Date.now()>deadline)throw Error('Issue130 Worker startup timed out');await wait(100);}})();
  server={child,mode};return ready;
}
async function stop(){if(!server?.child||server.child.exitCode!==null){server=undefined;return;}const child=server.child;const exited=once(child,'exit');process.kill(-child.pid,'SIGTERM');if(!(await Promise.race([exited.then(()=>true),wait(5000,undefined,{ref:false}).then(()=>false)]))){try{process.kill(-child.pid,'SIGKILL');}catch{/* already stopped */}}server=undefined;}
async function request(path,options={}){
  const response=await fetch(new URL(path,origin),{...options,headers:{'Accept-Encoding':'identity',Connection:'close',...options.headers},redirect:'manual',signal:AbortSignal.timeout(20000)});
  const text=await response.text();assert(!text.includes(key),'Local key appeared in response');
  if(path.startsWith('/api/v1/admin/')){assert.equal(response.headers.get('cache-control'),'no-store');assert((response.headers.get('vary')??'').toLowerCase().includes('authorization'));}
  return{status:response.status,headers:response.headers,text,json:text&&(response.headers.get('content-type')??'').includes('application/json')?JSON.parse(text):null};
}
const admin=(path,options={})=>request(path,{...options,headers:{Authorization:`Bearer ${key}`,...options.headers}});
function ids(){const value=randomBytes(6).toString('hex');return{bookId:`task72-${value}`,issueId:`task72-issue-${value}`};}
try{
  const imported=runImporter();check('New 0001–0003 importer adapter applied the approved 128/129/627 inventory on its fixed local D1',imported.databaseId==='00000000-0000-4000-8000-000000000072'&&imported.counts.books===128&&imported.counts.issues===129&&imported.counts.quotes===627&&imported.counts.nextIssueNumber===130);
  const id=ids();writeFileSync(keyFile,`CONTENT_API_KEY=${key}\n`,{flag:'wx',mode:0o600});
  await start();
  const bookBody={id:id.bookId,title:'本地导入后新刊验证',author:'Task72',category:'验证',description:'仅用于隔离本地D1的新刊130回归。'};
  const book=await admin('/api/v1/admin/books',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':newKey()},body:JSON.stringify(bookBody)});
  assert.equal(book.status,201,book.text);check('A new Book can be written on top of the imported management schema',book.json.data.id===id.bookId&&book.json.data.version===1);
  const editorNote='这次验证用一段满足发布长度要求的编辑说明，确认历史数据导入后仍可正常创建并发布下一期。';
  check('New Issue editor note satisfies the published contract length',Array.from(editorNote).length>=40&&Array.from(editorNote).length<=100);
  const issueBody={id:id.issueId,bookId:id.bookId,body:'',quotes:[{id:`${id.issueId}-quote`,text:'导入后的第一次发布仍使用原子期号分配。',sourceLabel:'Task72 native'}]};
  const issueKey=newKey();const issue=await admin('/api/v1/admin/issues',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':issueKey},body:JSON.stringify(issueBody)});
  assert.equal(issue.status,201,issue.text);const issuePath=`/api/v1/admin/issues/${id.issueId}`;
  const publicPath=`/issues/${id.issueId}`;
  const draft=await request(publicPath);
  check('Draft Issue is hidden from the anonymous detail page',draft.status===404&&!draft.text.includes(bookBody.title));
  const edited=await admin(issuePath,{method:'PATCH',headers:{'Content-Type':'application/json',
    'Idempotency-Key':newKey(),'If-Match':issue.headers.get('etag')},body:JSON.stringify({editorNote})});
  assert.equal(edited.status,200,edited.text);
  check('Editor saves the draft note and receives a new strong version before publishing',
    edited.json.data.editorNote===editorNote&&edited.json.data.version===2&&/^"[^"]+"$/.test(edited.headers.get('etag')??'')
    &&edited.headers.get('etag')!==issue.headers.get('etag'));
  const publishKey=newKey();const publishBody='{}';const publishOptions={method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':publishKey,'If-Match':edited.headers.get('etag')},body:publishBody};
  const published=await admin(`${issuePath}/publish`,publishOptions);assert.equal(published.status,200,published.text);
  const beijingDate=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  check('The first publication after imported Issues 1–129 receives issue number130',published.json.data.issueNumber===130&&published.json.data.status==='published'&&published.json.data.publicationDate===beijingDate);
  const before={receipts:managementRows(`SELECT count(*) n FROM admin_write_receipts WHERE resource_id IN ('${id.bookId}','${id.issueId}')`)[0].n,
    audit:managementRows(`SELECT count(*) n FROM admin_audit_events WHERE resource_id IN ('${id.bookId}','${id.issueId}')`)[0].n,
    sameDay:managementRows(`SELECT count(*) n FROM issues WHERE publication_date='${beijingDate}'`)[0].n};
  check('Book creation, Issue creation, edit and publish each committed one audit/receipt; one publication exists today',before.receipts===4&&before.audit===4&&before.sameDay===1);
  await stop();await build();server={mode:'built'};await start();
  const replay=await admin(`${issuePath}/publish`,publishOptions);
  check('Built Worker replays the original publish receipt with its captured response and stale original tag',replay.status===200&&replay.text===published.text);
  const after={receipts:managementRows(`SELECT count(*) n FROM admin_write_receipts WHERE resource_id IN ('${id.bookId}','${id.issueId}')`)[0].n,
    audit:managementRows(`SELECT count(*) n FROM admin_audit_events WHERE resource_id IN ('${id.bookId}','${id.issueId}')`)[0].n,
    issueRows:managementRows(`SELECT count(*) n FROM issues WHERE issue_number=130 AND id='${id.issueId}'`)[0].n};
  check('Cross-runtime replay created no duplicate Issue, audit event, or receipt',after.receipts===4&&after.audit===4&&after.issueRows===1);
  const publicIssue=await request('/api/v1'+publicPath);
  check('Published Issue 130 includes the edited note on the public JSON route',
    publicIssue.status===200&&publicIssue.json.data.id===id.issueId&&publicIssue.json.data.editorNote===editorNote);
  const home=await request('/');
  const detail=await request(publicPath);
  check('Built homepage and issue detail render the new edition and edited note',
    [home,detail].every(page=>page.status===200&&page.text.includes(`data-issue-id="${id.issueId}"`)&&page.text.includes(editorNote)));
  const archive=await request('/archive');
  const search=await request('/search?'+new URLSearchParams({q:bookBody.title}));
  const rss=await request('/rss.xml');
  check('Built archive, search and RSS expose the newly published Issue 130',
    archive.status===200&&archive.text.includes(`data-archive-issue-id="${id.issueId}"`)
    &&search.status===200&&search.text.includes(`data-search-issue-id="${id.issueId}"`)
    &&rss.status===200&&rss.text.includes(`<item><title>${bookBody.title}</title><link>https://daily-book.jiahongw.com${publicPath}</link>`));
  const legacy=await request(`/book/${beijingDate}`);
  check('New publication also resolves through the date alias',
    legacy.status===307&&legacy.headers.get('location')===publicPath&&legacy.headers.get('cache-control')==='no-store');
  result.publicResponseStatuses={draft:draft.status,detail:detail.status,api:publicIssue.status,home:home.status,
    archive:archive.status,search:search.status,rss:rss.status,dateAlias:legacy.status};
  result.status='passed';result.import={fingerprint:imported.inputFingerprint,schema:imported.schemaFingerprint,fieldChecks:imported.fieldChecks};result.issue130={id:id.issueId,bookId:id.bookId,publicationDate:beijingDate,etag:published.headers.get('etag'),responseSHA256:createHash('sha256').update(published.text).digest('hex'),counters:{before,after}};
}catch(error){result.status='failed';result.error=redacted(error instanceof Error?error.stack??error:String(error));if(error instanceof Error&&'cause' in error&&error.cause instanceof Error)result.cause=redacted(error.cause.message);process.exitCode=1;}
finally{
  await stop();if(existsSync(keyFile))unlinkSync(keyFile);mkdirSync(evidenceDir,{recursive:true});result.finishedAt=new Date().toISOString();result.logsSHA256=createHash('sha256').update(redacted(logs)).digest('hex');writeFileSync(evidenceFile,JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});process.stdout.write(JSON.stringify(result,null,2)+'\n');
}
