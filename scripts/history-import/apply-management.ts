import { canonical } from '../content-inventory';
import { ensure, ImportError, materialize, tableHash, compareTables, type Tables, type Row } from './model';
import { assertManagementPlanUnchanged, type ManagementPlan } from './model-management';
import { LocalManagementTarget, type ManagementQuery } from './local-management-db';
import { DEFINITION_SQL, type Definition } from './schema';
import { MANAGEMENT_MIGRATION_NAMES, MANAGEMENT_RECEIPT_SQL, MANAGEMENT_RECEIPT_TABLE, classifyManagementDefinitions, expectedMigrationWitness, schemaFingerprint } from './schema-management';

interface Receipt {
  id:string; input_fingerprint:string; provenance_json:string; imported_at:string;
  schema_fingerprint:string; migration_witness:string; data_sha256:string;
  books_count:number; issues_count:number; quotes_count:number; empty_target_guard:number;
}
interface State {
  kind:ReturnType<typeof classifyManagementDefinitions>;
  schemaWitness:string; migrationWitness:string|null;
  counts:{books:number;issues:number;quotes:number;writeReceipts:number;auditEvents:number;rateLimitBuckets:number};
  receipts:Receipt[];
}
export interface ManagementApplyResult {
  status:'applied-local'|'noop-verified'|'applied-observed-after-uncertain-ack';
  local:true; databaseId:'00000000-0000-4000-8000-000000000072';
  inputFingerprint:string; schemaFingerprint:string; counts:ManagementPlan['summary'];
  fieldChecks:number; dataSHA256:string; importedAt:string; provenance:ManagementPlan['provenance']; servedBy:string[];
}
const TARGET_DB_ID='00000000-0000-4000-8000-000000000072' as const;
const receiptColumns='id,input_fingerprint,provenance_json,imported_at,schema_fingerprint,migration_witness,data_sha256,books_count,issues_count,quotes_count,empty_target_guard';
const columns={
  books:['id','title','author','category','year','pages','rating','description','cover_title','cover_author','cover_url','cover_alt','version','created_at','updated_at'],
  issues:['id','book_id','editor_note','body','status','publication_date','issue_number','version','created_at','updated_at'],
  quotes:['id','issue_id','text','source_label','position'],
} as const;

async function inspect(target:LocalManagementTarget):Promise<State>{
  const rows=await target.rows(DEFINITION_SQL);
  const definitions=rows.map(row=>{
    ensure(['type','name','tbl_name','sql'].every(key=>typeof row[key]==='string'),'TARGET_SCHEMA_UNKNOWN','Malformed local schema definition');
    return {type:String(row.type),name:String(row.name),tbl_name:String(row.tbl_name),sql:String(row.sql)} satisfies Definition;
  });
  const kind=classifyManagementDefinitions(definitions);
  const hasMigrationTable=definitions.some(row=>row.name==='d1_migrations');
  let migrationWitness:string|null=null;
  if(hasMigrationTable){
    const migrations=await target.rows('SELECT id,name,applied_at FROM d1_migrations ORDER BY id');
    if(kind==='fresh'&&migrations.length===0){
      // Wrangler can initialize an empty local migration ledger before the first
      // apply. Treat that exact empty ledger as fresh; any partial/unknown ledger
      // remains a hard stop.
      migrationWitness=null;
    }else{
      const expected=MANAGEMENT_MIGRATION_NAMES;
      ensure(migrations.length===expected.length&&migrations.every((row,index)=>row.id===index+1&&row.name===expected[index]&&typeof row.applied_at==='string'&&Number.isFinite(Date.parse(row.applied_at as string))),
        'TARGET_SCHEMA_UNKNOWN','Local target migration history differs from exact 0001–0003 pins');
      migrationWitness=JSON.stringify(migrations.map(row=>[row.id,row.name,row.applied_at]));
    }
  }
  const schemaWitness=JSON.stringify(definitions.map(row=>[row.type,row.name,row.tbl_name,row.sql]));
  if(kind==='fresh')return{kind,schemaWitness,migrationWitness,counts:{books:0,issues:0,quotes:0,writeReceipts:0,auditEvents:0,rateLimitBuckets:0},receipts:[]};
  const [counts]=await target.rows(`SELECT (SELECT count(*) FROM books) books,(SELECT count(*) FROM issues) issues,(SELECT count(*) FROM quotes) quotes,
    (SELECT count(*) FROM admin_write_receipts) writeReceipts,(SELECT count(*) FROM admin_audit_events) auditEvents,
    (SELECT count(*) FROM admin_rate_limit_buckets) rateLimitBuckets`);
  ensure(Object.values(counts).every(value=>typeof value==='number'),'LOCAL_PROTOCOL','Missing local target row counts');
  const receiptsRaw=kind==='management-with-receipt'?await target.rows(`SELECT ${receiptColumns} FROM ${MANAGEMENT_RECEIPT_TABLE}`):[];
  ensure(receiptsRaw.length<=1,'TARGET_CONFLICT','Unknown management import receipt rows');
  const receipts=receiptsRaw.map(row=>{
    ensure(['id','input_fingerprint','provenance_json','imported_at','schema_fingerprint','migration_witness','data_sha256'].every(key=>typeof row[key]==='string')&&
      ['books_count','issues_count','quotes_count','empty_target_guard'].every(key=>typeof row[key]==='number'),'TARGET_CONFLICT','Malformed management import receipt');
    return {id:String(row.id),input_fingerprint:String(row.input_fingerprint),provenance_json:String(row.provenance_json),imported_at:String(row.imported_at),
      schema_fingerprint:String(row.schema_fingerprint),migration_witness:String(row.migration_witness),data_sha256:String(row.data_sha256),
      books_count:Number(row.books_count),issues_count:Number(row.issues_count),quotes_count:Number(row.quotes_count),empty_target_guard:Number(row.empty_target_guard)};
  });
  return{kind,schemaWitness,migrationWitness,counts:{books:Number(counts.books),issues:Number(counts.issues),quotes:Number(counts.quotes),writeReceipts:Number(counts.writeReceipts),auditEvents:Number(counts.auditEvents),rateLimitBuckets:Number(counts.rateLimitBuckets)},receipts};
}
const isEmpty=(state:State)=>Object.values(state.counts).every(count=>count===0)&&state.receipts.length===0;
async function allRows(target:LocalManagementTarget):Promise<Tables>{
  const result:Tables={books:[],issues:[],quotes:[]};
  for(const table of ['books','issues','quotes'] as const){
    const rows=await target.rows(`SELECT * FROM ${table} ORDER BY id COLLATE BINARY`);
    ensure(rows.every(row=>typeof row.id==='string'),'LOCAL_PROTOCOL','Missing entity ID during readback');
    result[table]=rows as Row[];
  }
  return result;
}
async function verifyExisting(plan:ManagementPlan,target:LocalManagementTarget,state:State,status:ManagementApplyResult['status']):Promise<ManagementApplyResult>{
  ensure(state.kind==='management-with-receipt'&&state.receipts.length===1,'TARGET_CONFLICT','No recognized complete management import receipt');
  ensure(state.counts.books===128&&state.counts.issues===129&&state.counts.quotes===627,'TARGET_CONFLICT','Imported content counts differ');
  const receipt=state.receipts[0];
  ensure(receipt.id==='history-management-v1'&&receipt.input_fingerprint===plan.inputFingerprint&&receipt.provenance_json===canonical(plan.provenance),
    'TARGET_INPUT_DRIFT','Target belongs to different inventory, schema, tool, or overlay; no updates permitted');
  ensure(receipt.schema_fingerprint===schemaFingerprint()&&receipt.migration_witness===expectedMigrationWitness(),'TARGET_SCHEMA_UNKNOWN','Receipt schema/migration pin differs');
  ensure(receipt.books_count===128&&receipt.issues_count===129&&receipt.quotes_count===627&&receipt.empty_target_guard===1,'TARGET_CONFLICT','Unexpected management receipt counts');
  const expected=materialize(plan.rows,receipt.imported_at);ensure(receipt.data_sha256===tableHash(expected),'TARGET_CONFLICT','Receipt row fingerprint differs from expected inventory');
  const checked=compareTables(expected,await allRows(target));
  ensure(checked.fields===6345&&checked.sha256===receipt.data_sha256,'TARGET_CONFLICT','Full management readback did not match');
  return{status,local:true,databaseId:TARGET_DB_ID,inputFingerprint:plan.inputFingerprint,schemaFingerprint:receipt.schema_fingerprint,
    counts:plan.summary,fieldChecks:checked.fields,dataSHA256:checked.sha256,importedAt:receipt.imported_at,provenance:plan.provenance,servedBy:['miniflare.db']};
}
function insertRows(table:keyof Tables,rows:Row[]):ManagementQuery{
  const names=columns[table];
  return{sql:`INSERT INTO ${table} (${names.join(',')}) SELECT ${names.map(name=>`json_extract(value,'$.${name}')`).join(',')} FROM json_each(?)`,params:[JSON.stringify(rows)]};
}
export async function applyManagementLocal(supplied:ManagementPlan,target:LocalManagementTarget=new LocalManagementTarget()):Promise<ManagementApplyResult>{
  const plan=structuredClone(supplied);assertManagementPlanUnchanged(plan);
  let state=await inspect(target);
  if(state.receipts.length)return verifyExisting(plan,target,state,'noop-verified');
  ensure(isEmpty(state),'TARGET_NOT_EMPTY','Management import only accepts a fresh, empty local D1 target');
  if(state.kind==='fresh'){await target.migrate();state=await inspect(target);ensure(state.kind==='management'&&isEmpty(state),'TARGET_SCHEMA_UNKNOWN','Migrated local schema differs from exact 0001–0003 pin');}
  if(state.kind==='management'){await target.batch([{sql:MANAGEMENT_RECEIPT_SQL}]);state=await inspect(target);}
  ensure(state.kind==='management-with-receipt'&&isEmpty(state),'TARGET_CONFLICT','Target changed while preparing import');
  const importedAt=new Date().toISOString();const rows=materialize(plan.rows,importedAt);const digest=tableHash(rows);
  const guard:ManagementQuery={
    sql:`INSERT INTO ${MANAGEMENT_RECEIPT_TABLE}(id,input_fingerprint,provenance_json,imported_at,schema_fingerprint,migration_witness,data_sha256,books_count,issues_count,quotes_count,empty_target_guard)
      VALUES('history-management-v1',?,?,?,?,?,?,128,129,627,(SELECT CASE WHEN
        (SELECT count(*) FROM books)=0 AND (SELECT count(*) FROM issues)=0 AND (SELECT count(*) FROM quotes)=0 AND
        (SELECT count(*) FROM admin_write_receipts)=0 AND (SELECT count(*) FROM admin_audit_events)=0 AND (SELECT count(*) FROM admin_rate_limit_buckets)=0 AND
        (SELECT count(*) FROM ${MANAGEMENT_RECEIPT_TABLE})=0 AND
        (SELECT json_group_array(json_array(type,name,tbl_name,sql)) FROM (${DEFINITION_SQL}))=? AND
        (SELECT json_group_array(json_array(id,name,applied_at)) FROM (SELECT id,name,applied_at FROM d1_migrations ORDER BY id))=?
        THEN 1 ELSE 0 END))`,
    params:[plan.inputFingerprint,canonical(plan.provenance),importedAt,schemaFingerprint(),expectedMigrationWitness(),digest,state.schemaWitness,state.migrationWitness],
  };
  try{await target.batch([guard,insertRows('books',rows.books),insertRows('issues',rows.issues),insertRows('quotes',rows.quotes)]);}
  catch(error){
    try{
      const after=await inspect(target);if(after.receipts.length)return verifyExisting(plan,target,after,'applied-observed-after-uncertain-ack');
      if(isEmpty(after)){
        const failure=new ImportError('APPLY_ROLLED_BACK','Native local readback confirms no business or receipt rows; a new explicit attempt may recover');
        Object.defineProperty(failure,'cause',{value:error,enumerable:false});
        throw failure;
      }
    }catch(error){if(error instanceof ImportError&&error.code==='APPLY_ROLLED_BACK')throw error;}
    const failure=new ImportError('APPLY_OUTCOME_UNKNOWN','Import acknowledgement/outcome is unknown or conflicting; inspect the local target, do not retry blindly');
    Object.defineProperty(failure,'cause',{value:error,enumerable:false});
    throw failure;
  }
  return verifyExisting(plan,target,await inspect(target),'applied-local');
}
export async function inspectManagementForTest(target:LocalManagementTarget){return inspect(target);}
export async function readManagementTablesForTest(target:LocalManagementTarget){return allRows(target);}
