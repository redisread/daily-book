/* global fetch, AbortSignal */
import assert from 'node:assert/strict';
import process from 'node:process';
import {spawn,spawnSync} from 'node:child_process';
import {once} from 'node:events';
import {randomBytes} from 'node:crypto';
import {existsSync,unlinkSync,writeFileSync,readFileSync} from 'node:fs';
import {fileURLToPath,URL} from 'node:url';
import {setTimeout as wait} from 'node:timers/promises';
import {stripAnsi} from './readiness.mjs';
import {managementRows,managementSQL,migrateManagementDB} from './management-db.mjs';

const mode=process.argv[2];assert(['dev','built'].includes(mode));
const root=fileURLToPath(new URL('../',import.meta.url));const keyFile=new URL('../.env.reader-admin-write-test.local',import.meta.url);
assert(!existsSync(keyFile),'Refuse to overwrite existing secret file');
const secrets=[];let key=randomBytes(32).toString('hex');secrets.push(key);
const result={mode,startedAt:new Date().toISOString(),checks:[]};let logs='';let serverA;let serverB;
const ports=mode==='dev'?[50072,50073]:[50074,50075];const origins=ports.map(port=>`http://127.0.0.1:${port}`);
const redact=value=>secrets.reduce((text,secret)=>text.split(secret).join('[REDACTED]'),String(value));
const check=(name,value)=>{assert(value,name);result.checks.push(name);};
const err=(response,status,code)=>{assert.equal(response.status,status,response.text);assert.equal(response.json?.error?.code,code,response.text);assert.equal(response.headers.get('cache-control'),'no-store');assert((response.headers.get('vary')??'').toLowerCase().includes('authorization'));};
function startOne(port) {
  const env=Object.fromEntries(Object.entries(process.env).filter(([name])=>name!=='CONTENT_API_KEY'&&name!=='VITE_CONTENT_API_KEY'&&!name.startsWith('CLOUDFLARE_')));
  if(mode==='dev')env.VINEXT_NO_DEV_LOCK='1';
  const args=['node_modules/vite/bin/vite.js',mode==='dev'?'dev':'preview','--mode','reader-admin-write-test','--host','127.0.0.1','--port',String(port)];
  const child=spawn(process.execPath,args,{cwd:root,env,detached:true,stdio:['ignore','pipe','pipe']});let phase='';
  for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{const text=String(chunk);logs+=text;phase+=text;});
  return {child,ready:(async()=>{const origin=`http://127.0.0.1:${port}`;const deadline=Date.now()+60000;while(!stripAnsi(phase).includes(origin)){if(child.exitCode!==null)throw Error('Rate-limit test server exited');if(Date.now()>deadline)throw Error('Rate-limit test server startup timed out');await wait(100);}return origin;})()};
}
async function stopOne(server){if(!server||server.exitCode!==null)return;const exited=once(server,'exit');process.kill(-server.pid,'SIGTERM');if(!(await Promise.race([exited.then(()=>true),wait(5000,undefined,{ref:false}).then(()=>false)]))){try{process.kill(-server.pid,'SIGKILL');}catch{/* already stopped */}}}
async function stop(){await Promise.all([stopOne(serverA),stopOne(serverB)]);serverA=undefined;serverB=undefined;}
async function build(){const env=Object.fromEntries(Object.entries(process.env).filter(([name])=>name!=='CONTENT_API_KEY'&&name!=='VITE_CONTENT_API_KEY'&&!name.startsWith('CLOUDFLARE_')));const built=spawnSync('npm',['run','build','--','--mode','reader-admin-write-test'],{cwd:root,env,encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:20*1024*1024});const text=(built.stdout??'')+(built.stderr??'');assert(secrets.every(secret=>!text.includes(secret)),'Build output contains configured key');logs+=text;assert.equal(built.status,0,'Owned management-rate-limit test build');}
async function start(){const a=startOne(ports[0]);serverA=a.child;await a.ready;const b=startOne(ports[1]);serverB=b.child;await b.ready;return origins;}
async function request(origin,path,options={}){const response=await fetch(new URL(path,origin),{...options,headers:{'Accept-Encoding':'identity',Connection:'close',...options.headers},redirect:'manual',signal:AbortSignal.timeout(20000)});const text=await response.text();assert(secrets.every(secret=>!text.includes(secret)),'Key appeared in response');if(path.startsWith('/api/v1/admin/')){assert.equal(response.headers.get('cache-control'),'no-store');assert((response.headers.get('vary')??'').toLowerCase().includes('authorization'));}return {status:response.status,headers:response.headers,text,json:text&&(response.headers.get('content-type')??'').includes('application/json')?JSON.parse(text):null};}
const admin=(origin,path,options={})=>request(origin,path,{...options,headers:{Authorization:`Bearer ${key}`,...options.headers}});
const count=(bucket,windowStart)=>managementRows(`SELECT request_count FROM admin_rate_limit_buckets WHERE actor='content-api' AND bucket='${bucket}' AND window_start=${windowStart}`)[0]?.request_count;
async function waitForWindowHeadroom(requiredMs){
  while(true){const remaining=60_000-(Date.now()%60_000);if(remaining>=requiredMs)return;await wait(remaining+25);}
}
try{
  migrateManagementDB();
  managementSQL('DELETE FROM admin_rate_limit_buckets');
  if(mode==='built')await build();await start();
  const [originA,originB]=origins;
  const absent=await request(originA,'/api/v1/admin/books');err(absent,503,'ADMIN_UNAVAILABLE');check('Missing key fails before rate-limit D1 access',managementRows('SELECT * FROM admin_rate_limit_buckets').length===0);
  await stop();writeFileSync(keyFile,`CONTENT_API_KEY=${key}\n`,{flag:'wx',mode:0o600});if(mode==='built')await build();await start();

  managementSQL('DELETE FROM admin_rate_limit_buckets');
  const unauthorized=await request(originA,'/api/v1/admin/books',{headers:{Authorization:'Bearer invalid'}});err(unauthorized,401,'UNAUTHORIZED');
  check('Unauthorized requests are never counted',managementRows('SELECT * FROM admin_rate_limit_buckets').length===0);
  await waitForWindowHeadroom(45_000);managementSQL('DELETE FROM admin_rate_limit_buckets');
  const readStart=Math.floor(Date.now()/60_000);
  const invalidRead=await admin(originA,'/api/v1/admin/books?limit=0');err(invalidRead,400,'INVALID_LIMIT');
  const reads=[];for(let index=0;index<119;index++)reads.push(await admin(index%2?originB:originA,'/api/v1/admin/books'));
  check('Authenticated read validation failures count against shared read bucket',invalidRead.status===400&&reads.every(response=>response.status===200)&&count('read',readStart)===120);
  const read429=await admin(originA,'/api/v1/admin/books');err(read429,429,'RATE_LIMITED');
  const readRetry=Number(read429.headers.get('retry-after'));check('121st read is429 with next-minute Retry-After and private caching',readRetry>=1&&readRetry<=60&&count('read',readStart)===121);

  managementSQL('DELETE FROM admin_rate_limit_buckets');
  await waitForWindowHeadroom(20_000);
  const writeStart=Math.floor(Date.now()/60_000);
  const invalidWrites=[];for(let index=0;index<30;index++)invalidWrites.push(await admin(index%2?originB:originA,'/api/v1/admin/books',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}));
  result.writeProbe={statusCounts:Object.fromEntries([...new Set(invalidWrites.map(response=>response.status))].map(status=>[status,invalidWrites.filter(response=>response.status===status).length])),errorCodes:[...new Set(invalidWrites.map(response=>response.json?.error?.code??null))],bucketCount:count('write',writeStart),window:writeStart,currentWindow:Math.floor(Date.now()/60_000)};
  check('Authenticated malformed writes count against shared write bucket',invalidWrites.every(response=>response.status===400&&response.json?.error?.code==='INVALID_IDEMPOTENCY_KEY')&&count('write',writeStart)===30);
  const write429=await admin(originB,'/api/v1/admin/books',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});err(write429,429,'RATE_LIMITED');
  check('31st write is429 and Retry-After is bounded',Number(write429.headers.get('retry-after'))>=1&&Number(write429.headers.get('retry-after'))<=60&&count('write',writeStart)===31);
  const unaffectedRead=await admin(originA,'/api/v1/admin/books');check('Read and write buckets are independent',unaffectedRead.status===200);

  managementSQL('DELETE FROM admin_rate_limit_buckets');
  const oldMinute=Math.floor(Date.now()/60_000)-1;
  managementSQL(`INSERT INTO admin_rate_limit_buckets(actor,bucket,window_start,request_count) VALUES('content-api','read',${oldMinute},120)`);
  const switched=await admin(originA,'/api/v1/admin/books');const newMinute=Math.floor(Date.now()/60_000);
  check('UTC minute boundary opens a fresh read window',switched.status===200&&count('read',newMinute)===1);

  // Parallel requests are split across two independently started local workers
  // during dev mode. The local SQLite adapter locks competing writer processes,
  // so alternate across instances here and stress concurrency in one instance.
  if(mode==='dev'){
    managementSQL('DELETE FROM admin_rate_limit_buckets');
    const sharedMinute=Math.floor(Date.now()/60_000);const acrossInstances=[];
    for(let index=0;index<40;index++)acrossInstances.push(await admin(index%2?originB:originA,'/api/v1/admin/books',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}));
    check('Requests round-robin across two local Worker instances share the same persisted write bucket',acrossInstances.filter(response=>response.status===400).length===30&&acrossInstances.filter(response=>response.status===429).length===10&&count('write',sharedMinute)===31);
    managementSQL('DELETE FROM admin_rate_limit_buckets');
    const concurrentMinute=Math.floor(Date.now()/60_000);
    const contenders=await Promise.all(Array.from({length:40},()=>admin(originA,'/api/v1/admin/books',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})));
    result.concurrentProbe={statusCounts:Object.fromEntries([...new Set(contenders.map(response=>response.status))].map(status=>[status,contenders.filter(response=>response.status===status).length])),errorCodes:[...new Set(contenders.map(response=>response.json?.error?.code??null))],bucketCount:count('write',concurrentMinute)};
    check('A concurrent local Worker burst atomically enforces the 30-request write cap',contenders.filter(response=>response.status===400).length===30&&contenders.filter(response=>response.status===429).length===10&&count('write',concurrentMinute)===31);
  }

  managementSQL('DELETE FROM admin_rate_limit_buckets');
  const first=await admin(originA,'/api/v1/admin/books');assert.equal(first.status,200);
  check('Rate-limit logical identity is stable across secret rotation (before)',managementRows("SELECT sum(request_count) n FROM admin_rate_limit_buckets WHERE actor='content-api' AND bucket='read'")[0].n===1);
  await stop();const old=key;key=randomBytes(32).toString('hex');secrets.push(key);writeFileSync(keyFile,`CONTENT_API_KEY=${key}\n`,{mode:0o600});if(mode==='built')await build();await start();
  const rotated=await admin(origins[0],'/api/v1/admin/books');assert.equal(rotated.status,200,rotated.text);
  check('Secret rotation does not create a new management rate-limit identity',managementRows("SELECT sum(request_count) n FROM admin_rate_limit_buckets WHERE actor='content-api' AND bucket='read'")[0].n===2&&managementRows('SELECT DISTINCT actor FROM admin_rate_limit_buckets').length===1);

  managementSQL('CREATE TRIGGER IF NOT EXISTS admin_rate_limit_qa_abort BEFORE INSERT ON admin_rate_limit_buckets BEGIN SELECT RAISE(ABORT, "LOCAL_RATE_LIMIT_STORAGE_FAILURE"); END');
  const beforeFailure=managementRows('SELECT count(*) AS n FROM admin_rate_limit_buckets')[0].n;
  const unavailable=await admin(origins[0],'/api/v1/admin/books');err(unavailable,503,'RATE_LIMIT_UNAVAILABLE');
  check('D1 counter failure fails closed for management reads without changing the bucket',managementRows('SELECT count(*) AS n FROM admin_rate_limit_buckets')[0].n===beforeFailure);
  const publicRead=await request(origins[0],'/api/v1/issues');check('Public reads remain available during management counter failure',publicRead.status===200);
  result.status='passed';
}catch(error){result.status='failed';result.error=redact(error.stack??error);if(error.cause)result.cause=redact(error.cause.stack??error.cause);result.failureLogs=redact(logs).slice(-4000);process.exitCode=1;}
finally{
  try{managementSQL('DROP TRIGGER IF EXISTS admin_rate_limit_qa_abort;');}catch{/* Preserve unreachable local state for inspection. */}
  await stop();if(existsSync(keyFile))unlinkSync(keyFile);result.finishedAt=new Date().toISOString();result.logsSHA256=(await import('node:crypto')).createHash('sha256').update(redact(logs)).digest('hex');process.stdout.write(JSON.stringify(result,null,2)+'\n');
}
