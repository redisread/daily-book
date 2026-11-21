/* global fetch, AbortSignal */
import assert from 'node:assert/strict';
import process from 'node:process';
import {spawn,spawnSync} from 'node:child_process';
import {once} from 'node:events';
import {existsSync,writeFileSync,unlinkSync,mkdirSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {fileURLToPath,URL} from 'node:url';
import {setTimeout as wait} from 'node:timers/promises';
import {stripAnsi} from './readiness.mjs';
import {issueRows,issueSQL,migrateIssueDB} from './issue-db.mjs';

const mode=process.argv[2];assert(['dev','built'].includes(mode));
const root=fileURLToPath(new URL('../',import.meta.url));const evidence=new URL('../.cloudflare/evidence/issues/',import.meta.url);mkdirSync(evidence,{recursive:true});
const keyFile=new URL('../.env.reader-issue-test.local',import.meta.url);assert(!existsSync(keyFile),'Refuse to overwrite an existing test secret file');
const key=randomBytes(32).toString('hex');const secrets=[key];let ownsKey=false;let server;let logs='';
const prefix='i71test-'+randomBytes(5).toString('hex');const bookPrefix='b71test-'+randomBytes(5).toString('hex');
const port=mode==='dev'?50072:50073;const origin=`http://127.0.0.1:${port}`;const result={mode,startedAt:new Date().toISOString(),checks:[]};
const check=(name,value)=>{assert(value,name);result.checks.push(name);};const keygen=()=>randomBytes(16).toString('hex');
const quoteSQL=value=>`'${String(value).replaceAll("'","''")}'`;
const scalar=sql=>Object.values(issueRows(sql)[0])[0];
const counts=id=>({issue:scalar(`SELECT count(*) n FROM issues WHERE id=${quoteSQL(id)}`),quotes:scalar(`SELECT count(*) n FROM quotes WHERE issue_id=${quoteSQL(id)}`),audit:scalar(`SELECT count(*) n FROM admin_audit_events WHERE resource_type='issue' AND resource_id=${quoteSQL(id)}`),receipts:scalar(`SELECT count(*) n FROM admin_write_receipts WHERE resource_type='issue' AND resource_id=${quoteSQL(id)}`)});
function redact(value){return secrets.reduce((text,secret)=>text.split(secret).join('[REDACTED]'),String(value));}
async function request(path,options={}){
  const response=await fetch(new URL(path,origin),{...options,headers:{'Accept-Encoding':'identity',Connection:'close',...options.headers},redirect:'manual',signal:options.signal??AbortSignal.timeout(20000)});
  const text=await response.text();assert(secrets.every(secret=>!text.includes(secret)),'Configured secret appeared in response');
  if(path.startsWith('/api/v1/admin/')){assert(/no-store/.test(response.headers.get('cache-control')??''));assert((response.headers.get('vary')??'').toLowerCase().includes('authorization'));}
  let json=null;if((response.headers.get('content-type')??'').includes('application/json')&&text)json=JSON.parse(text);
  return{status:response.status,headers:response.headers,text,json};
}
let authenticatedRequestsSinceBudgetReset=0;let authenticatedRequestsInFlight=0;
const auth=async(path,options={})=>{
  // This suite verifies Issue lifecycle behavior; the dedicated limits suite owns the cap assertions.
  // Refill only between request groups so a full lifecycle run can exceed 30 calls safely.
  if(authenticatedRequestsInFlight===0&&authenticatedRequestsSinceBudgetReset>=20){issueSQL('DELETE FROM admin_rate_limit_buckets');authenticatedRequestsSinceBudgetReset=0;}
  authenticatedRequestsInFlight++;authenticatedRequestsSinceBudgetReset++;
  try{return await request(path,{...options,headers:{Authorization:`Bearer ${key}`,...options.headers}});}
  finally{authenticatedRequestsInFlight--;}
};
const send=(path,method,body,idem,tag,options={})=>auth(path,{method,body:JSON.stringify(body),...options,headers:{'Content-Type':'application/json','Idempotency-Key':idem,...(tag===undefined?{}:{'If-Match':tag}),...options.headers}});
function error(response,status,code){assert.equal(response.status,status,response.text);assert(response.json);assert.deepEqual(Object.keys(response.json).sort(),['error','requestId']);assert.equal(response.json.error.code,code);assert.equal(response.headers.get('x-request-id'),response.json.requestId);}
function newBookId(label){return`${bookPrefix}-${label}`;}
function newIssueId(label){return`${prefix}-${label}`;}
async function createBook(label,fields={}){
  const id=newBookId(label);const body={id,...fields};const response=await send('/api/v1/admin/books','POST',body,keygen());assert.equal(response.status,201,response.text);return{id,response};
}
async function createIssue(label,bookId,fields={}){
  const id=newIssueId(label);const body={id,bookId,...fields};const idem=keygen();const response=await send('/api/v1/admin/issues','POST',body,idem);return{id,bookId,body,idem,response};
}
async function build(){
  const env=Object.fromEntries(Object.entries(process.env).filter(([name])=>name!=='CONTENT_API_KEY'&&name!=='VITE_CONTENT_API_KEY'&&!name.startsWith('CLOUDFLARE_')));
  const built=spawnSync('npm',['run','build','--','--mode','reader-issue-test'],{cwd:root,env,encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:16*1024*1024});
  const text=(built.stdout??'')+(built.stderr??'');assert(secrets.every(secret=>!text.includes(secret)),'Build echoed configured secret');logs+=text;assert.equal(built.status,0,'Owned issue-test build');
}
async function start(){
  const env=Object.fromEntries(Object.entries(process.env).filter(([name])=>name!=='CONTENT_API_KEY'&&name!=='VITE_CONTENT_API_KEY'&&!name.startsWith('CLOUDFLARE_')));
  server=spawn(process.execPath,['node_modules/vite/bin/vite.js',mode==='dev'?'dev':'preview','--mode','reader-issue-test','--host','127.0.0.1','--port',String(port)],{cwd:root,env,detached:true,stdio:['ignore','pipe','pipe']});
  let phase='';for(const stream of [server.stdout,server.stderr])stream.on('data',chunk=>{logs+=chunk;phase+=chunk;});
  const deadline=Date.now()+60000;while(!stripAnsi(phase).includes(origin)){if(server.exitCode!==null)throw Error('Owned Issue-test server exited');if(Date.now()>deadline)throw Error('Issue-test startup timed out');await wait(100);}
  const readyDeadline=Date.now()+15000;while(Date.now()<readyDeadline){try{const response=await request('/api/v1/admin/issues?limit=1',{headers:{Authorization:'Bearer invalid'}});if(response.status===401)return;}catch{/* Native runtime may still be starting its local D1 binding. */}await wait(100);}
  throw Error('Issue-test HTTP readiness check timed out');
}
async function stop(){if(server&&server.exitCode===null){const exited=once(server,'exit');process.kill(-server.pid,'SIGTERM');if(!(await Promise.race([exited.then(()=>true),wait(5000,undefined,{ref:false}).then(()=>false)]))){try{process.kill(-server.pid,'SIGKILL');}catch{/* already stopped */}}}server=undefined;}
try{
  migrateIssueDB();
  // Remove only test-owned rows from prior runs; unrelated local rows are preserved.
  issueSQL("DELETE FROM admin_audit_events WHERE resource_type='issue' AND resource_id LIKE 'i71test-%';DELETE FROM admin_write_receipts WHERE resource_type='issue' AND resource_id LIKE 'i71test-%';DELETE FROM quotes WHERE issue_id LIKE 'i71test-%';DELETE FROM issues WHERE id LIKE 'i71test-%';DELETE FROM admin_audit_events WHERE resource_type='book' AND resource_id LIKE 'b71test-%';DELETE FROM admin_write_receipts WHERE resource_type='book' AND resource_id LIKE 'b71test-%';DELETE FROM books WHERE id LIKE 'b71test-%';");
  check('Dedicated local test database has no same-day published Issue before race',scalar("SELECT count(*) n FROM issues WHERE publication_date=date('now','+8 hours')")===0);
  if(mode==='built')await build();
  writeFileSync(keyFile,`CONTENT_API_KEY=${key}\n`,{flag:'wx',mode:0o600});ownsKey=true;await start();

  const denied=await request('/api/v1/admin/issues',{method:'POST',body:'not-json',headers:{'Content-Type':'application/json',Authorization:'Bearer wrong'}});error(denied,401,'UNAUTHORIZED');check('Authentication precedes Issue write parsing',true);
  const bookA=await createBook('race-a',{title:'竞态书A',author:'作者A',category:'分类',description:'公开描述A'});
  const bookB=await createBook('race-b',{title:'竞态书B',author:'作者B',category:'分类',description:'公开描述B'});
  const note='书'.repeat(40);const qA={id:newIssueId('quote-a'),text:'第一段摘录',sourceLabel:'第1章'};const qB={id:newIssueId('quote-b'),text:'第二段摘录',sourceLabel:'第2章'};
  const issueA=await createIssue('race-a',bookA.id,{editorNote:note,body:'race body A',quotes:[qA]});assert.equal(issueA.response.status,201,issueA.response.text);
  const issueB=await createIssue('race-b',bookB.id,{editorNote:note,body:'race body B',quotes:[qB]});assert.equal(issueB.response.status,201,issueB.response.text);
  for(const issue of [issueA,issueB]){
    const data=issue.response.json.data;check('Issue POST creates a draft with NULL publication identity and ordered quotes',data.status==='draft'&&data.publicationDate===null&&data.issueNumber===null&&data.version===1&&data.quotes[0].position===0);
    check('Issue strong ETag is composed from both identity versions',/^"i:[A-Za-z0-9_-]+-[0-9]{16}-[0-9]{16}"$/.test(issue.response.headers.get('etag')??''));
    check('Issue create Location uses canonical detail path',issue.response.headers.get('location')===`/api/v1/admin/issues/${issue.id}`);
  }
  const sameReplay=await send('/api/v1/admin/issues', 'POST',issueA.body,issueA.idem);check('Same-key create replays the exact response',sameReplay.status===201&&sameReplay.text===issueA.response.text&&sameReplay.headers.get('etag')===issueA.response.headers.get('etag'));
  error(await send('/api/v1/admin/issues','POST',{...issueA.body,body:'different'},issueA.idem),409,'IDEMPOTENCY_CONFLICT');check('Same key with a different Issue body conflicts',counts(issueA.id).audit===1&&counts(issueA.id).receipts===1);
  error(await send('/api/v1/admin/issues','POST',{id:newIssueId('bad-book'),bookId:newBookId('missing')},keygen()),404,'BOOK_NOT_FOUND');
  error(await send('/api/v1/admin/issues','POST',{id:newIssueId('bad-status'),bookId:bookA.id,status:'published'},keygen()),400,'UNKNOWN_FIELD');check('Create cannot supply status or publication identity',true);

  const pathA=`/api/v1/admin/issues/${issueA.id}`;const initial=await auth(pathA);assert.equal(initial.status,200,initial.text);
  error(await send(pathA,'PATCH',{body:'needs tag'},keygen()),428,'PRECONDITION_REQUIRED');
  for(const bad of ['*','W/'+initial.headers.get('etag'),`${initial.headers.get('etag')}, ${initial.headers.get('etag')}`])error(await send(pathA,'PATCH',{body:'x'},keygen(),bad),400,'INVALID_IF_MATCH');
  error(await send(pathA,'PATCH',{bookId:bookB.id},keygen(),initial.headers.get('etag')),400,'UNKNOWN_FIELD');
  const emptyPatchCounts=counts(issueA.id);error(await send(pathA,'PATCH',{},keygen(),initial.headers.get('etag')),422,'EMPTY_PATCH');
  const afterEmptyPatch=await auth(pathA);check('Empty Issue PATCH returns422 without changing resource, quotes, version, audit or receipt',afterEmptyPatch.text===initial.text&&JSON.stringify(counts(issueA.id))===JSON.stringify(emptyPatchCounts));
  const patchKey=keygen();const patchBody={body:'updated body',quotes:[qA,{id:newIssueId('quote-new'),text:'新的摘录',sourceLabel:'第3章'}]};
  const patched=await send(pathA,'PATCH',patchBody,patchKey,initial.headers.get('etag'));assert.equal(patched.status,200,patched.text);
  check('Issue PATCH replaces quote set, assigns contiguous positions and increments version once',patched.json.data.version===2&&patched.json.data.body==='updated body'&&patched.json.data.editorNote===note&&patched.json.data.quotes.map(q=>q.position).join(',')==='0,1');
  check('Issue ETag returned from atomic receipt exactly matches authenticated GET', (await auth(pathA)).headers.get('etag')===patched.headers.get('etag'));
  const changedBook=await send(`/api/v1/admin/books/${bookA.id}`,'PATCH',{title:'共享Book版本变化'},keygen(),(await auth(`/api/v1/admin/books/${bookA.id}`)).headers.get('etag'));
  assert.equal(changedBook.status,200,changedBook.text);error(await send(pathA,'PATCH',{body:'stale Book tag'},keygen(),patched.headers.get('etag')),412,'PRECONDITION_FAILED');
  const afterStale=await auth(pathA);check('Concurrent Book version change invalidates Issue If-Match without changing Issue',afterStale.json.data.version===2&&afterStale.json.data.body==='updated body');

  const sameBook=await createBook('same-value');const sameIssue=await createIssue('same-value',sameBook.id);assert.equal(sameIssue.response.status,201,sameIssue.response.text);
  const samePath=`/api/v1/admin/issues/${sameIssue.id}`;const sameBefore=await auth(samePath);const sameBeforeCounts=counts(sameIssue.id);const sameKey=keygen();
  const samePatch=await send(samePath,'PATCH',{body:''},sameKey,sameBefore.headers.get('etag'));assert.equal(samePatch.status,200,samePatch.text);
  const sameAfterCounts=counts(sameIssue.id);check('Same-value Issue PATCH increments version, audit and receipt exactly once',samePatch.json.data.version===2&&samePatch.json.data.body===''&&sameAfterCounts.issue===sameBeforeCounts.issue&&sameAfterCounts.quotes===sameBeforeCounts.quotes&&sameAfterCounts.audit===sameBeforeCounts.audit+1&&sameAfterCounts.receipts===sameBeforeCounts.receipts+1);
  const sameValueReplay=await send(samePath,'PATCH',{body:''},sameKey,sameBefore.headers.get('etag'));check('Same-value Issue PATCH replay preserves its captured response without another version or audit',sameValueReplay.status===200&&sameValueReplay.text===samePatch.text&&JSON.stringify(counts(sameIssue.id))===JSON.stringify(sameAfterCounts));

  const missingInfoBook=await createBook('incomplete');const incomplete=await createIssue('incomplete',missingInfoBook.id,{editorNote:'short',quotes:[]});assert.equal(incomplete.response.status,201,incomplete.response.text);
  const prePublishCounts=counts(incomplete.id);error(await send(`/api/v1/admin/issues/${incomplete.id}/publish`,'POST',{},keygen(),incomplete.response.headers.get('etag')),422,'INVALID_VALUE');
  check('Incomplete first publication is rejected without version, identity, audit or receipt',JSON.stringify(counts(incomplete.id))===JSON.stringify(prePublishCounts)&&issueRows(`SELECT status,publication_date,issue_number,version FROM issues WHERE id=${quoteSQL(incomplete.id)}`)[0].status==='draft');

  const expectedMax=scalar('SELECT coalesce(max(issue_number),0) n FROM issues');
  const today=issueRows("SELECT date('now','+8 hours') today")[0].today;
  const raceTags=[(await auth(pathA)).headers.get('etag'),(await auth(`/api/v1/admin/issues/${issueB.id}`)).headers.get('etag')];
  const publishRace=await Promise.all([
    send(`/api/v1/admin/issues/${issueA.id}/publish`,'POST',{},keygen(),raceTags[0]),
    send(`/api/v1/admin/issues/${issueB.id}/publish`,'POST',{},keygen(),raceTags[1]),
  ]);
  const winnerIndex=publishRace.findIndex(response=>response.status===200);const loserIndex=1-winnerIndex;assert.notEqual(winnerIndex,-1,JSON.stringify(publishRace.map(r=>({status:r.status,text:r.text}))));
  error(publishRace[loserIndex],409,'PUBLICATION_DATE_TAKEN');const winner=[issueA,issueB][winnerIndex];const loser=[issueA,issueB][loserIndex];const published=publishRace[winnerIndex];
  check('Concurrent first publications reserve one Beijing day and one max+1 issue number',published.json.data.status==='published'&&published.json.data.publicationDate===today&&published.json.data.issueNumber===expectedMax+1&&issueRows(`SELECT status,publication_date,issue_number FROM issues WHERE id=${quoteSQL(loser.id)}`)[0].status==='draft');
  check('Issue response ETag is the same strong tag returned by the authenticated detail read',(await auth(`/api/v1/admin/issues/${winner.id}`)).headers.get('etag')===published.headers.get('etag'));
  const badDayCounts=counts(loser.id);error(await send(`/api/v1/admin/issues/${loser.id}/publish`,'POST',{},keygen(),(await auth(`/api/v1/admin/issues/${loser.id}`)).headers.get('etag')),409,'PUBLICATION_DATE_TAKEN');
  check('Same-day loser retains no publication identity or failed success receipt',JSON.stringify(counts(loser.id))===JSON.stringify(badDayCounts)&&issueRows(`SELECT publication_date,issue_number FROM issues WHERE id=${quoteSQL(loser.id)}`)[0].publication_date===null);

  const winnerPath=`/api/v1/admin/issues/${winner.id}`;const publishedIdentity={date:published.json.data.publicationDate,number:published.json.data.issueNumber};
  const staleWinnerTag=published.headers.get('etag');const bookBefore=await auth(`/api/v1/admin/books/${winner.bookId}`);const bookEdit=await send(`/api/v1/admin/books/${winner.bookId}`,'PATCH',{title:'发布后共享书名修改'},keygen(),bookBefore.headers.get('etag'));assert.equal(bookEdit.status,200,bookEdit.text);
  error(await send(`${winnerPath}/withdraw`,'POST',{},keygen(),staleWinnerTag),412,'PRECONDITION_FAILED');
  const currentWinner=await auth(winnerPath);const withdrawKey=keygen();const withdrawn=await send(`${winnerPath}/withdraw`,'POST',{},withdrawKey,currentWinner.headers.get('etag'));assert.equal(withdrawn.status,200,withdrawn.text);
  check('Withdraw preserves publication date/number and increments Issue version once',withdrawn.json.data.status==='withdrawn'&&withdrawn.json.data.publicationDate===publishedIdentity.date&&withdrawn.json.data.issueNumber===publishedIdentity.number&&withdrawn.json.data.version===published.json.data.version+1);
  error(await send(`${winnerPath}/publish`,'POST',{},keygen(),withdrawn.headers.get('etag')),409,'INVALID_STATE');
  const publicWithdrawn=await request(`/api/v1/issues/${winner.id}`);check('Withdrawal immediately hides the public Issue with a real410',publicWithdrawn.status===410&&!publicWithdrawn.text.includes(note));
  const actionReplay=await send(`${winnerPath}/withdraw`,'POST',{},withdrawKey,currentWinner.headers.get('etag'));check('Action replay returns its original committed response after later state changes',actionReplay.status===200&&actionReplay.text===withdrawn.text&&actionReplay.headers.get('etag')===withdrawn.headers.get('etag'));

  const legacyBook=await createBook('legacy-restore');const legacyId=newIssueId('legacy-withdrawn');
  issueSQL(`INSERT INTO issues(id,book_id,status,publication_date,issue_number,editor_note,body) VALUES(${quoteSQL(legacyId)},${quoteSQL(legacyBook.id)},'withdrawn','1999-12-31',(SELECT coalesce(max(issue_number),0)+1 FROM issues),NULL,'')`);
  const legacyBefore=await auth(`/api/v1/admin/issues/${legacyId}`);const legacyIdentity={date:legacyBefore.json.data.publicationDate,number:legacyBefore.json.data.issueNumber};
  const restored=await send(`/api/v1/admin/issues/${legacyId}/restore`,'POST',{},keygen(),legacyBefore.headers.get('etag'));assert.equal(restored.status,200,restored.text);
  check('Restore accepts historical missing note/quotes and preserves its reserved identity',restored.json.data.status==='published'&&restored.json.data.editorNote===null&&restored.json.data.quotes.length===0&&restored.json.data.publicationDate===legacyIdentity.date&&restored.json.data.issueNumber===legacyIdentity.number);
  error(await send(`/api/v1/admin/issues/${legacyId}/restore`,'POST',{},keygen(),restored.headers.get('etag')),409,'INVALID_STATE');

  let historyTag=(await auth(winnerPath)).headers.get('etag');
  for(let index=0;index<22;index++){
    const response=await send(winnerPath,'PATCH',{body:`Issue history ${index}`},keygen(),historyTag);assert.equal(response.status,200,response.text);historyTag=response.headers.get('etag');
  }
  const history=await auth(`${winnerPath}/history`);check('Issue history defaults to20 items and returns a cursor',history.status===200&&history.json.items.length===20&&typeof history.json.nextCursor==='string');
  const fullHistory=await auth(`${winnerPath}/history?limit=100`);assert.equal(fullHistory.status,200,fullHistory.text);
  const expectedHistory=issueRows(`SELECT event_id FROM admin_audit_events WHERE resource_type='issue' AND resource_id=${quoteSQL(winner.id)} ORDER BY created_at DESC,event_id DESC`).map(row=>row.event_id);
  const actualHistory=[];let cursor=null;do{const page=await auth(`${winnerPath}/history?limit=2${cursor?'&cursor='+cursor:''}`);assert.equal(page.status,200,page.text);actualHistory.push(...page.json.items.map(item=>item.id));cursor=page.json.nextCursor;}while(cursor);
  check('Issue history cursor traverses DESC timestamp/eventId without gaps or duplicates',JSON.stringify(actualHistory)===JSON.stringify(expectedHistory)&&new Set(actualHistory).size===actualHistory.length);
  const otherCursor=await auth(`${winnerPath}/history?limit=1`);error(await auth(`/api/v1/admin/issues/${legacyId}/history?cursor=${otherCursor.json.nextCursor}`),400,'INVALID_CURSOR');
  for(const query of ['limit=0','limit=101','limit=1&limit=2','_rsc=x','status=draft'])error(await auth(`${winnerPath}/history?${query}`),400,query.startsWith('limit=0')||query.startsWith('limit=101')?'INVALID_LIMIT':'INVALID_QUERY');
  const expectedPublishBeforeVersion=winner===issueA?2:1;
  check('Issue history records create, patch and status snapshots with truthful versions',fullHistory.json.items.some(item=>item.operation==='issue.publish'&&item.beforeVersion===expectedPublishBeforeVersion&&item.afterVersion===expectedPublishBeforeVersion+1&&item.before.status==='draft'&&item.after.status==='published'));
  error(await auth(`/api/v1/admin/issues/${winner.id}/publish`),405,'METHOD_NOT_ALLOWED');
  error(await send(`/api/v1/admin/issues/${loser.id}/withdraw`,'POST',{status:'withdrawn'},keygen(),(await auth(`/api/v1/admin/issues/${loser.id}`)).headers.get('etag')),400,'UNKNOWN_FIELD');

  const foreignQuoteIssue=await createIssue('foreign-quote',bookB.id,{quotes:[{id:newIssueId('foreign-quote-id'),text:'foreign',sourceLabel:'p. 1'}]});assert.equal(foreignQuoteIssue.response.status,201,foreignQuoteIssue.response.text);
  const winnerBeforeFailure=await auth(winnerPath);const beforeFailureCounts=counts(winner.id);
  issueSQL(`CREATE TRIGGER admin_issue_test_quote_abort BEFORE INSERT ON quotes WHEN NEW.id=${quoteSQL(newIssueId('fault-quote'))} BEGIN SELECT RAISE(ABORT,'local Issue quote fault'); END`);
  try{
    error(await send(winnerPath,'PATCH',{quotes:[{id:newIssueId('ok-before-fault'),text:'first',sourceLabel:'p. 2'},{id:newIssueId('fault-quote'),text:'fault',sourceLabel:'p. 3'}]},keygen(),winnerBeforeFailure.headers.get('etag')),503,'WRITE_UNAVAILABLE');
    check('Quote insertion failure rolls back all Issue changes, audit and receipt',JSON.stringify(counts(winner.id))===JSON.stringify(beforeFailureCounts)&&(await auth(winnerPath)).text===winnerBeforeFailure.text);
  }finally{issueSQL('DROP TRIGGER IF EXISTS admin_issue_test_quote_abort');}
  const currentWinner2=await auth(winnerPath);error(await send(winnerPath,'PATCH',{quotes:[{id:newIssueId('foreign-quote-id'),text:'move',sourceLabel:'p. 9'}]},keygen(),currentWinner2.headers.get('etag')),422,'INVALID_VALUE');
  check('Quote ID owned by another Issue cannot be moved across resources',JSON.stringify(counts(winner.id))===JSON.stringify(beforeFailureCounts));
  const restoredWinner=await send(`${winnerPath}/restore`,'POST',{},keygen(),currentWinner2.headers.get('etag'));assert.equal(restoredWinner.status,200,restoredWinner.text);
  check('Restore republishes a withdrawn Issue without changing its publication identity',restoredWinner.json.data.status==='published'&&restoredWinner.json.data.publicationDate===publishedIdentity.date&&restoredWinner.json.data.issueNumber===publishedIdentity.number);
  const finalPublic=await request(`/api/v1/issues/${winner.id}`);check('Restored and edited Issue is publicly visible with current shared Book data',finalPublic.status===200&&finalPublic.text.includes('发布后共享书名修改'));

  check('Issue writes and read histories leave D1 foreign keys valid',issueRows('PRAGMA foreign_key_check').length===0);
  check('No incomplete receipt, unaudited event or leaked key remains',scalar('SELECT count(*) n FROM admin_write_receipts WHERE completed<>1 OR mutation_ok IS NOT 1 OR audit_ok IS NOT 1')===0&&scalar('SELECT count(*) n FROM admin_audit_events')===scalar('SELECT count(*) n FROM admin_write_receipts')&&secrets.every(secret=>!JSON.stringify(issueRows('SELECT * FROM admin_write_receipts')).includes(secret)));
  result.status='passed';result.prefix=prefix;result.finishedAt=new Date().toISOString();
}catch(error){result.status='failed';result.error=redact(error.stack??error);process.exitCode=1;}
finally{
  try{issueSQL('DROP TRIGGER IF EXISTS admin_issue_test_quote_abort');}catch{/* retain local evidence and state; never reset */}
  await stop();if(ownsKey)unlinkSync(keyFile);result.finishedAt=new Date().toISOString();writeFileSync(new URL(`${mode}-result.json`,evidence),JSON.stringify(result,null,2)+'\n');writeFileSync(new URL(`${mode}-server.log`,evidence),redact(logs));process.stdout.write(JSON.stringify(result,null,2)+'\n');
}
