import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { canonical, sha256, verifyInventory, type Inventory, type Entry } from '../content-inventory';
import { ROOT, ensure, projectEntries, tableHash, type Overlay, type Plan } from './model';
import { verifyManagementMigrationPins } from './schema-management';

export interface ManagementProvenance {
  sourceCommit:string; inventoryCommit:string; inventoryToolSHA256:string; inventorySHA256:string;
  schemaCommit:string; schemaSHA256:string; overlaySHA256:string; importerSHA256:string;
  managementMigrationPin:string;
}
export interface ManagementPlan extends Omit<Plan,'formatVersion'|'provenance'> {
  formatVersion:2;
  provenance:ManagementProvenance;
  managementSchemaPin:string;
}

const managementImporterFiles=[
  'scripts/import-history-management.ts','scripts/content-inventory.ts','scripts/history-import/model.ts',
  'scripts/history-import/model-management.ts','scripts/history-import/schema-management.ts',
  'scripts/history-import/apply-management.ts','scripts/history-import/local-management-db.ts',
  'scripts/history-import/overlay.json','apps/reader/cloudflare.config.ts','apps/reader/vite.config.ts',
];
const baselineSourceHashes=new Map<string,string>();
function hashFile(path:string):string{return sha256(readFileSync(resolve(ROOT,path)));}
function baselineSourceHash(path:string):string {
  const cached=baselineSourceHashes.get(path);if(cached)return cached;
  const bytes=execFileSync('git',['show',`8b991098f984a5f8870bd01741e3cb937b63d50d:${path}`],{cwd:ROOT,maxBuffer:16*1024*1024});
  const hash=sha256(bytes);baselineSourceHashes.set(path,hash);return hash;
}

export function loadManagementPlan(inputPath:string):ManagementPlan {
  const inputStat=statSync(inputPath);
  ensure(inputStat.isFile()&&inputStat.size<=8*1024*1024,'INPUT_DRIFT','Inventory must be a bounded regular file');
  const raw=readFileSync(inputPath);
  const pins=verifyManagementMigrationPins();
  ensure(raw.length<=8*1024*1024&&sha256(raw)=== '4918f76db3da19ba122ed01073b942551ed8e64d926a5c5ee8fb2d370879b5ad','INPUT_DRIFT','Inventory bytes differ from the approved immutable package');
  const inventory=JSON.parse(raw.toString('utf8')) as Inventory & {sourceSha:string;toolHead:string;toolSHA256:string;readerCode:{path:string;sha256:string;blobId:string}[]};
  ensure(inventory.sourceSha==='8b991098f984a5f8870bd01741e3cb937b63d50d'&&inventory.toolHead==='185d2a0438b73cd7432ee7baaf489e46e2ae564d'&&inventory.toolSHA256==='be003c1a2099085db6667c83412bb0abc4ecefe03392d19badad8e3ed7f4c7db','INPUT_DRIFT','Inventory provenance differs from the approved source/tool');
  ensure(hashFile('scripts/content-inventory.ts')===inventory.toolSHA256,'TOOL_DRIFT','Pinned inventory implementation changed');
  for(const file of inventory.readerCode){
    ensure(typeof file.path==='string'&&!file.path.startsWith('/')&&!file.path.split('/').includes('..')&&!file.path.includes('\\'),'SOURCE_INVALID','Inventory contains an unsafe source path');
    ensure(baselineSourceHash(file.path)===file.sha256,'READER_DRIFT',`Pinned legacy source does not match its immutable baseline: ${file.path}`);
  }
  ensure(hashFile('apps/reader/migrations/0001_initial.sql')==='cbda5b150021955d388fe22984a3167f110aae1b953019295803e95362856e3b','SCHEMA_DRIFT','Legacy content schema 0001 differs from the reviewed pin');
  ensure(hashFile('scripts/history-import/overlay.json')==='27f6e44aff5da93f9d3c64f087fcd8d4f748233421e35adaaa10e81880382bb8','OVERLAY_DRIFT','Reviewed identity overlay bytes changed');
  const verification=verifyInventory(inventory);
  ensure(verification.passed&&verification.fieldChecks===3060,'SOURCE_INVALID','Original field/hash/identity verification failed');
  const overlay=JSON.parse(readFileSync(resolve(ROOT,'scripts/history-import/overlay.json'),'utf8')) as Overlay;
  const {rows,mappings}=projectEntries(inventory.entries as Entry[],overlay);
  ensure(rows.books.length===128&&rows.issues.length===129&&rows.quotes.length===627,'COUNT_MISMATCH','Unexpected mapped historical counts');
  ensure(rows.issues.every(row=>row.status==='published')&&rows.issues.filter(row=>row.editor_note===null).length===98,'COUNT_MISMATCH','Historical publication/note deficiencies changed');
  ensure(canonical(rows.issues.map(row=>row.issue_number).sort((a,b)=>Number(a)-Number(b)))===canonical(Array.from({length:129},(_,i)=>i+1)),'IDENTITY_DRIFT','Historical Issue numbers must remain exactly 1–129');
  const importerSHA256=sha256(canonical(Object.fromEntries(managementImporterFiles.map(path=>[path,hashFile(path)]))));
  const provenance:ManagementProvenance={sourceCommit:'8b991098f984a5f8870bd01741e3cb937b63d50d',inventoryCommit:'185d2a0438b73cd7432ee7baaf489e46e2ae564d',
    inventoryToolSHA256:'be003c1a2099085db6667c83412bb0abc4ecefe03392d19badad8e3ed7f4c7db',inventorySHA256:'4918f76db3da19ba122ed01073b942551ed8e64d926a5c5ee8fb2d370879b5ad',
    schemaCommit:'98dfb5cfce872a54b28501c5aa2b73adc3f0703d',schemaSHA256:'cbda5b150021955d388fe22984a3167f110aae1b953019295803e95362856e3b',
    overlaySHA256:'27f6e44aff5da93f9d3c64f087fcd8d4f748233421e35adaaa10e81880382bb8',importerSHA256,managementMigrationPin:pins};
  const semanticSHA256=tableHash(rows);const managementSchemaPin=sha256(pins);
  const plan:ManagementPlan={formatVersion:2,inputPath:resolve(inputPath),provenance,managementSchemaPin,semanticSHA256,
    inputFingerprint:sha256(canonical({provenance,managementSchemaPin,semanticSHA256})),sourceFieldChecks:verification.fieldChecks,rows,mappings,
    summary:{books:128,issues:129,quotes:627,missingEditorNote:98,rawBodiesWithContent:2,nextIssueNumber:130}};
  return plan;
}
export function assertManagementPlanUnchanged(plan:ManagementPlan):void {
  const fresh=loadManagementPlan(plan.inputPath);
  ensure(canonical(plan)===canonical(fresh),'INPUT_DRIFT','Management importer inputs/tool or in-memory plan changed after planning');
}
