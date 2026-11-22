#!/usr/bin/env node
/** Post-0003 importer adapter. Dry-run is default; apply has one fixed local D1 target. */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { outsideRepository } from './content-inventory';
import { ImportError, ensure, ROOT } from './history-import/model';
import { loadManagementPlan } from './history-import/model-management';
export { loadManagementPlan } from './history-import/model-management';

export function parseManagementArguments(args:string[]){
  let input:string|undefined;let report:string|undefined;let apply=false;const seen=new Set<string>();
  for(let index=0;index<args.length;index++){
    const flag=args[index];ensure(['--input','--report','--apply-local'].includes(flag)&&!seen.has(flag),'INVALID_ARGUMENT','Supported flags: --input <approved-inventory.json> [--report <new-outside-repository-file>] [--apply-local]. There is no remote target/config/reset/force option.');seen.add(flag);
    if(flag==='--apply-local')apply=true;
    else{const value=args[++index];ensure(value&&!value.startsWith('--'),'INVALID_ARGUMENT',`Missing value for ${flag}`);if(flag==='--input')input=value;else report=value;}
  }
  ensure(input,'INVALID_ARGUMENT','--input is required; the immutable inventory must be supplied explicitly');
  return{input:resolve(input),report,apply};
}
export async function runManagementImport(args:string[]){
  const options=parseManagementArguments(args);const report=options.report?outsideRepository(ROOT,options.report):undefined;
  if(report)ensure(!existsSync(report),'OUTPUT_EXISTS','Report path already exists; use a new external receipt file');
  const plan=loadManagementPlan(options.input);
  const result=options.apply?await(await import('./history-import/apply-management')).applyManagementLocal(plan):{
    status:'dry-run',localOnly:true,databaseOpened:false,databaseId:'00000000-0000-4000-8000-000000000072',
    inputFingerprint:plan.inputFingerprint,managementSchemaPin:plan.managementSchemaPin,semanticSHA256:plan.semanticSHA256,
    provenance:plan.provenance,counts:plan.summary,sourceFieldChecks:plan.sourceFieldChecks,mapping:plan.mappings,
    systemFields:'version=1; created_at/updated_at assigned once at first local apply and reused from its atomic receipt',
  };
  const text=JSON.stringify(result,null,2)+'\n';
  if(report){mkdirSync(dirname(report),{recursive:true});writeFileSync(report,text,{flag:'wx',mode:0o600});}
  return text;
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  runManagementImport(process.argv.slice(2)).then(text=>process.stdout.write(text),error=>{
    const known=error instanceof ImportError;
    process.stderr.write(JSON.stringify({status:'stopped',code:known?error.code:'REHEARSAL_FAILED',message:known?error.message:'Management local rehearsal failed; inspect local evidence and do not reset or retry blindly'})+'\n');
    process.exitCode=1;
  });
}
