import { canonical } from '../content-inventory';
import { ensure, ImportError, assertPlanUnchanged, materialize, tableHash, compareTables, type Plan, type Tables, type Row } from './model';
import { LocalTarget, LOCAL_DATABASE_ID, type Query } from './local-db';
import { DEFINITION_SQL, RECEIPT_SQL, RECEIPT_TABLE, classifyDefinitions, type Definition } from './schema';

export const COLUMNS = {
  books: ['id','title','author','category','year','pages','rating','description','cover_title','cover_author','cover_url','cover_alt','version','created_at','updated_at'],
  issues: ['id','book_id','editor_note','body','status','publication_date','issue_number','version','created_at','updated_at'],
  quotes: ['id','issue_id','text','source_label','position'],
} as const;
interface Receipt {
  id: string; input_fingerprint: string; provenance_json: string; imported_at: string;
  data_sha256: string; books_count: number; issues_count: number; quotes_count: number; empty_target_guard: number;
}
interface State { kind: ReturnType<typeof classifyDefinitions>; schemaWitness:string; migrationWitness:string|null; counts: { books:number; issues:number; quotes:number }; receipts: Receipt[] }
export interface ApplyResult {
  status: 'applied-local' | 'noop-verified' | 'applied-observed-after-uncertain-ack';
  local: true; databaseId: string; namespace: string; inputFingerprint: string;
  counts: Plan['summary']; fieldChecks: number; dataSHA256: string; importedAt: string;
  provenance: Plan['provenance']; servedBy: string[];
}
async function inspect(target: LocalTarget): Promise<State> {
  const rows = await target.rows(DEFINITION_SQL);
  const definitions = rows.map(row => {
    ensure(['type','name','tbl_name','sql'].every(key => typeof row[key] === 'string'), 'TARGET_SCHEMA_UNKNOWN', 'Malformed local schema definition');
    return { type:String(row.type), name:String(row.name), tbl_name:String(row.tbl_name), sql:String(row.sql) } satisfies Definition;
  });
  const kind = classifyDefinitions(definitions);
  const metadata = await target.rows("SELECT name FROM sqlite_master WHERE type='table' AND name='d1_migrations'");
  let migrationWitness: string|null = null;
  if (metadata.length) {
    const migrations = await target.rows('SELECT id,name,applied_at FROM d1_migrations ORDER BY id');
    migrationWitness = JSON.stringify(migrations.map(row=>[row.id,row.name,row.applied_at]));
    ensure(migrations.length <= 1 && migrations.every(row => row.id === 1 && row.name === '0001_initial.sql' && typeof row.applied_at === 'string' && Number.isFinite(Date.parse(row.applied_at))),
      'TARGET_SCHEMA_UNKNOWN', 'Local target contains an unknown migration history');
    ensure(kind !== 'fresh' || migrations.length === 0, 'TARGET_SCHEMA_UNKNOWN', 'Migration history claims missing formal schema');
  }
  const schemaWitness = JSON.stringify(definitions.map(row=>[row.type,row.name,row.tbl_name,row.sql]));
  if (kind === 'fresh') return { kind, schemaWitness,migrationWitness,counts:{ books:0,issues:0,quotes:0 }, receipts:[] };
  const [counts] = await target.rows('SELECT (SELECT count(*) FROM books) AS books,(SELECT count(*) FROM issues) AS issues,(SELECT count(*) FROM quotes) AS quotes');
  ensure(['books','issues','quotes'].every(key => typeof counts[key] === 'number'), 'LOCAL_PROTOCOL', 'Missing target counts');
  const rawReceipts = kind === 'with-receipt-table' ? await target.rows(`SELECT * FROM ${RECEIPT_TABLE}`) : [];
  ensure(rawReceipts.length <= 1, 'TARGET_CONFLICT', 'Unknown import receipt rows');
  const receipts: Receipt[] = rawReceipts.map(row => {
    ensure(['id','input_fingerprint','provenance_json','imported_at','data_sha256'].every(key => typeof row[key] === 'string') &&
      ['books_count','issues_count','quotes_count','empty_target_guard'].every(key => typeof row[key] === 'number'), 'TARGET_CONFLICT', 'Malformed import receipt');
    return { id:String(row.id), input_fingerprint:String(row.input_fingerprint), provenance_json:String(row.provenance_json), imported_at:String(row.imported_at),
      data_sha256:String(row.data_sha256), books_count:Number(row.books_count), issues_count:Number(row.issues_count), quotes_count:Number(row.quotes_count), empty_target_guard:Number(row.empty_target_guard) };
  });
  return { kind, schemaWitness,migrationWitness,counts:{ books:Number(counts.books),issues:Number(counts.issues),quotes:Number(counts.quotes) }, receipts };
}
const empty = (state: State) => Object.values(state.counts).every(count => count === 0) && state.receipts.length === 0;
async function allRows(target: LocalTarget): Promise<Tables> {
  const result: Tables = { books:[], issues:[], quotes:[] };
  for (const table of ['books','issues','quotes'] as const) {
    const rows = await target.rows(`SELECT * FROM ${table} ORDER BY id COLLATE BINARY`);
    ensure(rows.every(row => typeof row.id === 'string'), 'LOCAL_PROTOCOL', 'Missing entity ID in readback');
    result[table] = rows as Row[];
  }
  return result;
}
async function verifyExisting(plan: Plan, target: LocalTarget, state: State, status: ApplyResult['status']): Promise<ApplyResult> {
  ensure(state.kind === 'with-receipt-table' && state.receipts.length === 1, 'TARGET_CONFLICT', 'No recognized complete import receipt');
  ensure(state.counts.books === 128 && state.counts.issues === 129 && state.counts.quotes === 627, 'TARGET_CONFLICT', 'Target counts differ before any full-data readback');
  const receipt = state.receipts[0];
  ensure(receipt.id === 'history-v1' && receipt.input_fingerprint === plan.inputFingerprint && receipt.provenance_json === canonical(plan.provenance),
    'TARGET_INPUT_DRIFT', 'Nonempty local target belongs to different inputs/tool/overlay; no updates permitted');
  ensure(receipt.books_count === 128 && receipt.issues_count === 129 && receipt.quotes_count === 627 && receipt.empty_target_guard === 1,
    'TARGET_CONFLICT', 'Unexpected local import receipt counts');
  const expected = materialize(plan.rows, receipt.imported_at);
  ensure(receipt.data_sha256 === tableHash(expected), 'TARGET_CONFLICT', 'Receipt row fingerprint differs from the intended rows');
  const verified = compareTables(expected, await allRows(target));
  ensure(verified.fields === 6345 && verified.sha256 === receipt.data_sha256, 'TARGET_CONFLICT', 'Full local readback did not match');
  return { status, local:true, databaseId:LOCAL_DATABASE_ID, namespace:target.namespace, inputFingerprint:plan.inputFingerprint,
    counts:plan.summary, fieldChecks:verified.fields, dataSHA256:verified.sha256, importedAt:receipt.imported_at,
    provenance:plan.provenance, servedBy:[...target.servedBy] };
}
function insertRows(table: keyof Tables, rows: Row[]): Query {
  const columns = COLUMNS[table];
  // JSON1 preserves string/newline/null/number values with one bound JSON scalar.
  // No source text becomes SQL, and this avoids a binding limit per source row.
  return { sql:`INSERT INTO ${table} (${columns.join(',')}) SELECT ${columns.map(column => `json_extract(value,'$.${column}')`).join(',')} FROM json_each(?)`, params:[JSON.stringify(rows)] };
}
export async function applyLocal(suppliedPlan: Plan, target: LocalTarget = new LocalTarget()): Promise<ApplyResult> {
  const plan = structuredClone(suppliedPlan);
  assertPlanUnchanged(plan);
  let state = await inspect(target);
  if (state.receipts.length) return verifyExisting(plan, target, state, 'noop-verified');
  ensure(empty(state), 'TARGET_NOT_EMPTY', 'Nonempty unrecognized local target; no overwrite, reset, or merge is supported');
  if (state.kind === 'fresh') {
    await target.migrate(); state = await inspect(target);
    ensure(state.kind === 'formal' && empty(state), 'TARGET_SCHEMA_UNKNOWN', 'New formal schema did not match the pinned definition');
  }
  if (state.kind === 'formal') {
    await target.batch([{ sql: RECEIPT_SQL }]); state = await inspect(target);
  }
  ensure(state.kind === 'with-receipt-table' && empty(state), 'TARGET_CONFLICT', 'Local target changed while preparing');
  assertPlanUnchanged(plan);
  const importedAt = new Date().toISOString();
  const data = materialize(plan.rows, importedAt); const dataSHA256 = tableHash(data);
  // The empty-target check and stable receipt are INSIDE the same atomic batch
  // as all business inserts. A concurrent/uncertain replay cannot overwrite data.
  const guard: Query = {
    sql:`INSERT INTO ${RECEIPT_TABLE} (id,input_fingerprint,provenance_json,imported_at,data_sha256,books_count,issues_count,quotes_count,empty_target_guard)
      VALUES('history-v1',?,?,?,?,128,129,627,(SELECT CASE WHEN
        (SELECT count(*) FROM books)=0 AND (SELECT count(*) FROM issues)=0 AND (SELECT count(*) FROM quotes)=0 AND
        (SELECT count(*) FROM ${RECEIPT_TABLE})=0 AND
        (SELECT json_group_array(json_array(type,name,tbl_name,sql)) FROM (${DEFINITION_SQL}))=?
        ${state.migrationWitness === null ? '' : 'AND (SELECT json_group_array(json_array(id,name,applied_at)) FROM (SELECT id,name,applied_at FROM d1_migrations ORDER BY id))=?'}
        THEN 1 ELSE 0 END))`,
    params:[plan.inputFingerprint,canonical(plan.provenance),importedAt,dataSHA256,state.schemaWitness,...(state.migrationWitness === null ? [] : [state.migrationWitness])],
  };
  try { await target.batch([guard, insertRows('books',data.books), insertRows('issues',data.issues), insertRows('quotes',data.quotes)]); }
  catch {
    // An error/timeout is not proof of rollback. Observe only; never resubmit.
    try {
      const after = await inspect(target);
      if (after.receipts.length) return await verifyExisting(plan, target, after, 'applied-observed-after-uncertain-ack');
      if (empty(after)) throw new ImportError('APPLY_ROLLED_BACK', 'Native local readback confirms zero business/receipt rows; an explicit new attempt may recover');
    } catch (error) {
      if (error instanceof ImportError && error.code === 'APPLY_ROLLED_BACK') throw error;
    }
    throw new ImportError('APPLY_OUTCOME_UNKNOWN', 'Local write acknowledgement/outcome is unknown or conflicting; stop and inspect, do not blindly retry');
  }
  return verifyExisting(plan, target, await inspect(target), 'applied-local');
}
export async function inspectForTest(target: LocalTarget) { return inspect(target); }
export async function readTablesForTest(target: LocalTarget) { return allRows(target); }
