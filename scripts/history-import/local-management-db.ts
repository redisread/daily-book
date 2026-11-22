import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, lstatSync, writeFileSync, unlinkSync, readFileSync, readdirSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';
import { ROOT, ensure, type Scalar } from './model';

const READER_ROOT=resolve(ROOT,'apps/reader');
const DB_ID='00000000-0000-4000-8000-000000000072';
const CLI=resolve(READER_ROOT,'node_modules/.bin/cf');
const MIGRATIONS=resolve(READER_ROOT,'migrations');
export interface ManagementQuery {sql:string;params?:Scalar[]}
interface RawResult { success:boolean; results:{columns:string[];rows:Scalar[][]}; meta:{served_by?:string} }

export class LocalManagementTarget {
  readonly persistPath:string;
  constructor(readonly namespace='primary'){
    ensure(namespace==='primary'||/^test-[a-z0-9-]{1,75}$/.test(namespace),'TARGET_INVALID','Only fixed primary or owned local-test namespaces are supported');
    this.persistPath=resolve(READER_ROOT,'.cloudflare',namespace==='primary'?'management-state':`management-rehearsal/${namespace}`);
  }
  private prepare():void {
    const expected=resolve(READER_ROOT,'.cloudflare',this.namespace==='primary'?'management-state':`management-rehearsal/${this.namespace}`);
    ensure(this.persistPath===expected,'TARGET_UNSAFE','Management target path changed');
    const stat=lstatSync(resolve(READER_ROOT,'.cloudflare'),{throwIfNoEntry:false});
    if(stat)ensure(stat.isDirectory()&&!stat.isSymbolicLink(),'TARGET_UNSAFE','Worker local state directory cannot be a symlink');
    else mkdirSync(resolve(READER_ROOT,'.cloudflare'),{mode:0o700});
    const rootReal=resolve(READER_ROOT);
    const relativePath=relative(rootReal,this.persistPath).split(sep).join('/');
    ensure(relativePath===(this.namespace==='primary'?'.cloudflare/management-state':`.cloudflare/management-rehearsal/${this.namespace}`),'TARGET_UNSAFE','Management target escaped its fixed local path');
    let current=resolve(READER_ROOT,'.cloudflare');
    for(const part of relativePath.split('/').slice(1)){
      current=resolve(current,part);const item=lstatSync(current,{throwIfNoEntry:false});
      if(item)ensure(item.isDirectory()&&!item.isSymbolicLink(),'TARGET_UNSAFE','Management D1 path cannot traverse symlinks or files');
      else mkdirSync(current,{mode:0o700});
    }
    ensure(JSON.parse(readFileSync(resolve(READER_ROOT,'node_modules/cf/package.json'),'utf8')).version==='1.0.0-beta.28','RUNTIME_DRIFT','Use the reviewed local CF CLI version');
    const inspect=(directory:string):void=>{
      for(const entry of readdirSync(directory,{withFileTypes:true})){
        const path=resolve(directory,entry.name);const item=lstatSync(path);
        ensure(!item.isSymbolicLink()&&(!item.isFile()||item.nlink===1),'TARGET_UNSAFE','Local persisted state cannot contain symlinks or shared hardlinks');
        if(item.isDirectory())inspect(path);
      }
    };
    inspect(this.persistPath);
  }
  private run(args:string[],maxBuffer=24*1024*1024):string {
    this.prepare();
    const env=Object.fromEntries(Object.entries(process.env).filter(([name])=>name!=='CONTENT_API_KEY'&&!name.startsWith('CLOUDFLARE_')));
    return execFileSync(CLI,args,{cwd:READER_ROOT,env,encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer});
  }
  async migrate():Promise<void> {
    this.run(['d1','migrations','apply',DB_ID,'--local','--mode','reader-admin-write-test','--persist-to',relative(READER_ROOT,this.persistPath),'--dir',MIGRATIONS]);
  }
  async batch(queries:ManagementQuery[]):Promise<RawResult[]> {
    this.prepare();
    ensure(queries.length>0&&queries.every(query=>typeof query.sql==='string'&&(!query.params||query.params.every(value=>value===null||typeof value==='string'||(typeof value==='number'&&Number.isFinite(value))))),'QUERY_INVALID','Only bounded SQL and scalar values are supported');
    const file=resolve(this.persistPath,`.batch-${randomUUID()}.json`);
    writeFileSync(file,JSON.stringify(queries),{mode:0o600,flag:'wx'});
    try {
      const results:unknown=JSON.parse(this.run(['d1','raw',DB_ID,'--local','--mode','reader-admin-write-test','--persist-to',relative(READER_ROOT,this.persistPath),'--batch',`@${file}`]));
      ensure(Array.isArray(results)&&results.every(result=>result?.success===true&&result.meta?.served_by==='miniflare.db'&&Array.isArray(result.results?.columns)&&Array.isArray(result.results?.rows)),'LOCAL_PROTOCOL','Expected successful native local D1 batch');
      return results as RawResult[];
    } finally {unlinkSync(file);}
  }
  async rows(sql:string,params:Scalar[]=[]):Promise<Record<string,Scalar>[]> {
    const results=await this.batch([{sql,params}]);
    return results.flatMap(result=>result.results.rows.map(values=>Object.fromEntries(result.results.columns.map((key,index)=>[key,values[index]]))));
  }
}
