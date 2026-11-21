#!/usr/bin/env node
/* Safe local Agent helper: prepare is dry-run; execute reuses an immutable retry record. */
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import process from 'node:process';

const ROOT=resolve(new URL('../../../',import.meta.url).pathname);
const usage='Prepare: node scripts/management-request.mjs prepare --method POST|PATCH --path /api/v1/admin/... --body <json-file> [--if-match <exact-etag>] [--key <stable-key>] --record <new-file-outside-repo>\nExecute: CONTENT_API_KEY=<local-key> BOOK_API_ORIGIN=http://127.0.0.1:50076 node scripts/management-request.mjs execute --record <existing-record-outside-repo> --execute-local';
function parse(args){
  const verb=args.shift();assert(['prepare','execute'].includes(verb),usage);const opts={verb};
  for(let i=0;i<args.length;i++){
    const flag=args[i];assert(['--method','--path','--body','--if-match','--key','--record','--execute-local'].includes(flag),`Unknown option ${flag}\n${usage}`);
    assert(!Object.hasOwn(opts,flag.slice(2)),`Duplicate option ${flag}`);
    if(flag==='--execute-local')opts.executeLocal=true;else{const value=args[++i];assert(value&&!value.startsWith('--'),`Missing value for ${flag}`);opts[flag==='--if-match'?'ifMatch':flag.slice(2)]=value;}
  }
  if(verb==='prepare'){
    assert(opts.method&&opts.path&&opts.body&&opts.record&&!opts.executeLocal,usage);
    opts.method=opts.method.toUpperCase();assert(['POST','PATCH'].includes(opts.method),'Only POST and PATCH are supported');
    assert(opts.path.startsWith('/api/v1/admin/')&&!opts.path.includes('?')&&!opts.path.includes('#'),'Path must be a fixed management API path without query or fragment');
    if(opts.ifMatch)assert(!opts.ifMatch.includes('\r')&&!opts.ifMatch.includes('\n'),'If-Match must be one unchanged header value');
    opts.key??=randomBytes(24).toString('hex');assert(/^[A-Za-z0-9_-]{16,128}$/.test(opts.key),'Idempotency key must contain16–128 ASCII letters, digits, _ or -');
  }else assert(opts.record&&opts.executeLocal&&!opts.method&&!opts.path&&!opts.body&&!opts.ifMatch&&!opts.key,'Execution requires exactly --record and --execute-local');
  return opts;
}
function externalPath(value){
  const path=resolve(value);assert(isAbsolute(path),'Path must be absolute');const rel=relative(ROOT,path);
  assert(rel==='..'||rel.startsWith(`..${sep}`),'Retry records must be outside the repository');
  return path;
}
function checkFile(path,exists){
  const parent=dirname(path);mkdirSync(parent,{recursive:true,mode:0o700});
  const parentStat=lstatSync(parent);assert(parentStat.isDirectory()&&!parentStat.isSymbolicLink(),'Record directory cannot be a symlink');
  if(exists){const stat=lstatSync(path);assert(stat.isFile()&&!stat.isSymbolicLink()&&stat.nlink===1,'Retry record must be a regular private file without symlinks/hardlinks');assert((stat.mode&0o077)===0,'Retry record permissions must be owner-only');}
}
function sha(value){return createHash('sha256').update(value).digest('hex');}
function prepare(opts){
  const file=externalPath(opts.record);assert(!existsSync(file),'Refusing to overwrite an existing retry record');
  const body=readFileSync(opts.body);const text=body.toString('utf8');assert(Buffer.from(text,'utf8').equals(body),'Body file must be UTF-8');const parsed=JSON.parse(text);assert(parsed&&typeof parsed==='object'&&!Array.isArray(parsed),'Body must be a JSON object');
  const record={version:1,method:opts.method,path:opts.path,body:text,idempotencyKey:opts.key,ifMatch:opts.ifMatch??null,bodySHA256:sha(body)};
  checkFile(file,false);writeFileSync(file,JSON.stringify(record,null,2)+'\n',{flag:'wx',mode:0o600});
  process.stdout.write(JSON.stringify({status:'dry-run',requestSent:false,record:file,method:record.method,path:record.path,bodySHA256:record.bodySHA256,hasIfMatch:record.ifMatch!==null,idempotencyKeyPreserved:true,authorization:'redacted'})+'\n');
}
async function execute(opts){
  const file=externalPath(opts.record);checkFile(file,true);const record=JSON.parse(readFileSync(file,'utf8'));
  assert(record?.version===1&&['POST','PATCH'].includes(record.method)&&typeof record.path==='string'&&record.path.startsWith('/api/v1/admin/')&&typeof record.body==='string'&&/^[A-Za-z0-9_-]{16,128}$/.test(record.idempotencyKey),'Invalid retry record');
  assert(sha(record.body)===record.bodySHA256,'Retry record body fingerprint mismatch');assert(JSON.parse(record.body)&&typeof JSON.parse(record.body)==='object'&&!Array.isArray(JSON.parse(record.body)),'Retry body must remain a JSON object');
  const origin=process.env.BOOK_API_ORIGIN;const token=process.env.CONTENT_API_KEY;assert(token,'CONTENT_API_KEY is required in the environment');assert(origin,'BOOK_API_ORIGIN is required in the environment');
  const url=new URL(origin);assert(url.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(url.hostname)&&url.pathname==='/'&&!url.search&&!url.hash&&!url.username&&!url.password,'Only an explicit loopback HTTP origin is accepted');
  const headers={'content-type':'application/json','accept-encoding':'identity','idempotency-key':record.idempotencyKey,authorization:`Bearer ${token}`};if(record.ifMatch!==null)headers['if-match']=record.ifMatch;
  try{
    const response=await fetch(new URL(record.path,url),{method:record.method,headers,body:record.body,redirect:'error',signal:AbortSignal.timeout(15000)});const responseText=await response.text();
    let code=null;try{code=JSON.parse(responseText)?.error?.code??null;}catch{/* response body is not printed */}
    process.stdout.write(JSON.stringify({status:'response-received',httpStatus:response.status,errorCode:code,requestId:response.headers.get('x-request-id'),responseSHA256:sha(responseText),retryRecord:file,retryUsesSameKeyAndBody:true,authorization:'redacted'})+'\n');
  }catch(error){process.stdout.write(JSON.stringify({status:'outcome-unknown',message:'No response was confirmed. Re-run execute with this same record; it preserves the original body, If-Match and idempotency key.',retryRecord:file,authorization:'redacted'})+'\n');process.exitCode=2;}
}
try{const opts=parse(process.argv.slice(2));if(opts.verb==='prepare')prepare(opts);else await execute(opts);}catch(error){process.stderr.write(`${error instanceof Error?error.message:String(error)}\n`);process.exitCode=1;}
