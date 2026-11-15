import assert from 'node:assert/strict';
import { existsSync, mkdirSync, writeFileSync, readFileSync, symlinkSync, linkSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { outsideRepository, sha256, canonical } from '../content-inventory';
import { runManagementImport } from '../import-history-management';
import { ImportError, ROOT, tableHash } from './model';
import { loadManagementPlan } from './model-management';
import { LocalManagementTarget, type ManagementQuery } from './local-management-db';
import { applyManagementLocal, inspectManagementForTest, readManagementTablesForTest } from './apply-management';
import { D1_MIGRATIONS_SQL, DEFINITION_SQL } from './schema';

const args = process.argv.slice(2);
assert(args.length === 4 && args[0] === '--input' && args[2] === '--out', 'Usage: tsx scripts/history-import/verify-management-local.ts --input <approved-json> --out <new-external-directory>');
const input = resolve(args[1]); const out = outsideRepository(ROOT,args[3]);
assert(!existsSync(out), 'Use a new evidence directory; existing data/evidence are never removed'); mkdirSync(out,{recursive:true,mode:0o700});
const checks: string[] = []; const details: Record<string,unknown> = {};
const check = (name:string,condition:unknown) => { assert(condition,name); checks.push(name); };
async function stopped(operation:()=>unknown|Promise<unknown>,code:string) {
  try { await operation(); assert.fail(`Expected stop: ${code}`); }
  catch(error) { assert(error instanceof ImportError && error.code === code, `Expected ${code}; got ${error instanceof Error ? error.message : String(error)}`); }
}
const suffix = Date.now().toString(36)+'-'+randomUUID().slice(0,8);
const target = (label:string) => new LocalManagementTarget(`test-${label}-${suffix}`);
const result: Record<string,unknown> = {startedAt:new Date().toISOString(),checks,details};
try {
  const originalSHA = sha256(readFileSync(input)); const plan = loadManagementPlan(input);
  check('Immutable inventory inverse mapping still verifies all 3060 source fields', plan.sourceFieldChecks === 3060);
  const primary = new LocalManagementTarget(); const primaryExisted = existsSync(primary.persistPath);
  const originalBatch = LocalManagementTarget.prototype.batch; let dryCalls = 0;
  LocalManagementTarget.prototype.batch = async function(this:LocalManagementTarget,queries:ManagementQuery[]) { dryCalls++;return originalBatch.call(this,queries); };
  let firstDry: string; let secondDry: string;
  try { firstDry = await runManagementImport(['--input',input]);secondDry = await runManagementImport(['--input',input]); }
  finally { LocalManagementTarget.prototype.batch = originalBatch; }
  check('Default dry-run is byte-identical and makes zero native database calls', firstDry === secondDry && JSON.parse(firstDry).databaseOpened === false && dryCalls === 0);
  check('Dry-run does not create primary local state', existsSync(primary.persistPath) === primaryExisted);
  check('Plan has exactly128 Book/129 Issue/627 Quote and98 NULL editor notes', plan.summary.books === 128 && plan.summary.issues === 129 && plan.summary.quotes === 627 && plan.rows.issues.filter(row=>row.editor_note===null).length===98);
  const pair = plan.mappings.filter(row=>row.bookId==='the-mythical-man-month');
  check('Overlay keeps both original issue identities/numbers52 and117', pair.length===2 && pair.map(row=>row.issueNumber).sort((a,b)=>Number(a)-Number(b)).join(',')==='52,117' && new Set(pair.map(row=>row.issueId)).size===2);
  const other = ['cognitive-awakening','cognitive-awakening-revisit','island-bookstore','the-storied-life-2026','the-art-of-thinking','the-art-of-thought'];
  check('All three unresolved groups retain independent original Book IDs', other.every(id=>plan.rows.books.some(row=>row.id===id)));
  const mutated = structuredClone(plan); mutated.rows.books[0].title = 'UNREVIEWED_IN_MEMORY_CHANGE';
  const mutatedTarget = target('mutated-plan');
  await stopped(()=>applyManagementLocal(mutated,mutatedTarget),'INPUT_DRIFT');
  check('In-memory plan tampering is rejected before target creation',!existsSync(mutatedTarget.persistPath));
  const full = target('full'); const applied = await applyManagementLocal(plan,full); details.first=applied;
  check('First local import succeeds with6345 field/type comparisons', applied.status==='applied-local' && applied.fieldChecks===6345);
  check('Native D1 witness is miniflare.db, never a remote service', applied.servedBy.length===1 && applied.servedBy[0]==='miniflare.db');
  const rows = await readManagementTablesForTest(full);
  check('Two raw substantive bodies and every quote are retained', rows.issues.filter(row=>String(row.body).trim()).length===2 && rows.quotes.length===627);
  check('Cover newlines and numeric metadata survive real D1', rows.books.some(row=>String(row.cover_title).includes('\n')) && rows.books.every(row=>typeof row.year==='number' && typeof row.pages==='number' && typeof row.rating==='number'));
  const types = await full.rows('SELECT DISTINCT typeof(year) AS year_type,typeof(pages) AS pages_type,typeof(rating) AS rating_type FROM books');
  check('SQLite stores numeric fields as numbers rather than text', types.every(row=>row.year_type==='integer' && row.pages_type==='integer' && row.rating_type==='real'));
  const repeated = await applyManagementLocal(plan,full); details.repeat=repeated;
  check('Repeated import verifies then performs a no-op with identical data/timestamps', repeated.status==='noop-verified' && repeated.dataSHA256===applied.dataSHA256 && repeated.importedAt===applied.importedAt);
  check('Repeated import leaves all business fields unchanged', tableHash(await readManagementTablesForTest(full))===applied.dataSHA256);
  await full.batch([{sql:"UPDATE books SET title='LOCAL_CONFLICT_DO_NOT_OVERWRITE' WHERE id='the-mythical-man-month'"}]);
  const conflictBefore = tableHash(await readManagementTablesForTest(full));
  await stopped(()=>applyManagementLocal(plan,full),'TARGET_CONFLICT');
  check('Changed known target stops instead of overwriting; fingerprint unchanged',tableHash(await readManagementTablesForTest(full))===conflictBefore);
  details.conflict={namespace:full.namespace,before:conflictBefore,after:tableHash(await readManagementTablesForTest(full))};

  const drift=resolve(out,'changed-copy.json');writeFileSync(drift,readFileSync(input).toString()+'\n');
  await stopped(()=>runManagementImport(['--input',drift,'--apply-local']),'INPUT_DRIFT');
  check('Changed inventory bytes stop before primary target creation',existsSync(primary.persistPath)===primaryExisted);
  const unknown=target('unknown');await unknown.batch([{sql:'CREATE TABLE sqlitex_unrelated(id TEXT PRIMARY KEY,value TEXT)'},{sql:"INSERT INTO sqlitex_unrelated VALUES('keep','LOCAL_UNKNOWN_DO_NOT_TOUCH')"}]);
  const unknownSnapshot=async()=>sha256(canonical({definitions:await unknown.rows(DEFINITION_SQL),rows:await unknown.rows('SELECT * FROM sqlitex_unrelated')}));
  const unknownBefore=await unknownSnapshot();await stopped(()=>applyManagementLocal(plan,unknown),'TARGET_SCHEMA_UNKNOWN');
  check('Unknown nonempty schema, including sqlite-lookalike names, stops unchanged',await unknownSnapshot()===unknownBefore);
  details.unknown={namespace:unknown.namespace,before:unknownBefore,after:await unknownSnapshot()};
  const metadataOnly=target('fake-metadata');
  await metadataOnly.batch([{sql:'CREATE TABLE d1_migrations(name TEXT,private_value TEXT)'},{sql:"INSERT INTO d1_migrations VALUES('0001_initial.sql','LOCAL_UNKNOWN_METADATA_DO_NOT_TOUCH')"}]);
  const metadataSnapshot=async()=>canonical({schema:await metadataOnly.rows(DEFINITION_SQL),rows:await metadataOnly.rows('SELECT * FROM d1_migrations')});
  const metadataBefore=await metadataSnapshot();await stopped(()=>applyManagementLocal(plan,metadataOnly),'TARGET_SCHEMA_UNKNOWN');
  check('Unknown nonempty table cannot bypass preflight by using migration metadata name',await metadataSnapshot()===metadataBefore);
  const foreign=target('foreign');await foreign.migrate();await foreign.batch([{sql:"INSERT INTO books(id,title) VALUES('local-foreign','LOCAL_FOREIGN_DO_NOT_TOUCH')"}]);
  const foreignBefore=tableHash(await readManagementTablesForTest(foreign));await stopped(()=>applyManagementLocal(plan,foreign),'TARGET_NOT_EMPTY');
  check('Formal but unrecognized nonempty target stops without receipt/data changes',tableHash(await readManagementTablesForTest(foreign))===foreignBefore && (await inspectManagementForTest(foreign)).kind==='management');

  const emptyLedger=target('empty-ledger');await emptyLedger.batch([{sql:D1_MIGRATIONS_SQL}]);
  const afterEmptyLedger=await applyManagementLocal(plan,emptyLedger);
  check('An exact but empty Wrangler migration ledger is accepted as fresh, then receives all exact migrations',afterEmptyLedger.status==='applied-local'&&afterEmptyLedger.fieldChecks===6345&&afterEmptyLedger.counts.books===128);
  details.emptyLedger={namespace:emptyLedger.namespace,result:afterEmptyLedger};

  class SchemaRaceTarget extends LocalManagementTarget {
    attempts=0;
    override async batch(queries:ManagementQuery[]) {
      if(queries.length===4 && queries[0].sql.startsWith('INSERT INTO _local_history_management_receipt')) {
        this.attempts++;
        await super.batch([{sql:'CREATE TABLE local_race_unknown(value TEXT)'},{sql:"INSERT INTO local_race_unknown VALUES('LOCAL_RACE_DO_NOT_TOUCH')"}]);
      }
      return super.batch(queries);
    }
  }
  const schemaRace=new SchemaRaceTarget(`test-schema-race-${suffix}`);
  await stopped(()=>applyManagementLocal(plan,schemaRace),'APPLY_OUTCOME_UNKNOWN');
  const [raceCounts]=await schemaRace.rows('SELECT (SELECT count(*) FROM books) AS books,(SELECT count(*) FROM issues) AS issues,(SELECT count(*) FROM quotes) AS quotes,(SELECT count(*) FROM _local_history_management_receipt) AS receipts');
  check('In-transaction schema witness stops a target changed after preflight, without business writes',schemaRace.attempts===1 && Object.values(raceCounts).every(value=>value===0) && (await schemaRace.rows('SELECT value FROM local_race_unknown'))[0].value==='LOCAL_RACE_DO_NOT_TOUCH');
  class FailingTarget extends LocalManagementTarget {
    attempts=0;
    override async batch(queries:ManagementQuery[]) {
      if(queries.length===4 && queries[0].sql.startsWith('INSERT INTO _local_history_management_receipt')) {
        this.attempts++;
        return super.batch([...queries.slice(0,3),{sql:"INSERT INTO quotes(id,issue_id,text,source_label,position) VALUES('forced-failure','no-such-parent','LOCAL_FAILURE_FIXTURE','',0)"},queries[3]]);
      }
      return super.batch(queries);
    }
  }
  const failed=new FailingTarget(`test-rollback-${suffix}`);
  await stopped(()=>applyManagementLocal(plan,failed),'APPLY_ROLLED_BACK');const rolled=await inspectManagementForTest(failed);
  check('Injected native FK failure rolls back Book/Issue/Quote and receipt together',failed.attempts===1 && Object.values(rolled.counts).every(value=>value===0) && rolled.receipts.length===0);
  const recovered=await applyManagementLocal(plan,new LocalManagementTarget(failed.namespace));details.recovery={rolledBack:{kind:rolled.kind,counts:rolled.counts,receiptCount:rolled.receipts.length},result:recovered};
  check('Explicit recovery on known empty target succeeds without reset',recovered.status==='applied-local' && recovered.fieldChecks===6345);
  class LostAckTarget extends LocalManagementTarget {
    attempts=0;
    override async batch(queries:ManagementQuery[]) {
      const result=await super.batch(queries);
      if(queries.length===4 && queries[0].sql.startsWith('INSERT INTO _local_history_management_receipt')) {this.attempts++;throw new Error('injected acknowledgement loss after native commit');}
      return result;
    }
  }
  const lost=new LostAckTarget(`test-lost-ack-${suffix}`);const observed=await applyManagementLocal(plan,lost);details.lostAck=observed;
  check('Lost write acknowledgement is resolved by readback, not a second write',lost.attempts===1 && observed.status==='applied-observed-after-uncertain-ack' && observed.fieldChecks===6345);
  const afterLost=await applyManagementLocal(plan,new LocalManagementTarget(lost.namespace));
  check('Explicit rerun after uncertain acknowledgement remains a verified no-op',afterLost.status==='noop-verified' && afterLost.dataSHA256===observed.dataSHA256);
  await lost.batch([{sql:'UPDATE _local_history_management_receipt SET input_fingerprint=?',params:['0'.repeat(64)]}]);
  const receiptBefore=canonical(await lost.rows('SELECT * FROM _local_history_management_receipt'));
  await stopped(()=>applyManagementLocal(plan,new LocalManagementTarget(lost.namespace)),'TARGET_INPUT_DRIFT');
  check('Existing receipt with different input lineage stops without replacement',canonical(await lost.rows('SELECT * FROM _local_history_management_receipt'))===receiptBefore && tableHash(await readManagementTablesForTest(lost))===observed.dataSHA256);
  const linked=target('symlink');mkdirSync(resolve(out,'outside-state'));mkdirSync(resolve(linked.persistPath,'..'),{recursive:true});symlinkSync(resolve(out,'outside-state'),linked.persistPath);
  await stopped(()=>applyManagementLocal(plan,linked),'TARGET_UNSAFE');
  check('Target symlink escape is refused before database access',!existsSync(resolve(out,'outside-state/d1')));
  const hard=target('hardlink');mkdirSync(hard.persistPath,{recursive:true});
  const outsideFile=resolve(out,'outside-proof.txt');writeFileSync(outsideFile,'LOCAL_LINK_PROOF');linkSync(outsideFile,resolve(hard.persistPath,'linked-file'));
  await stopped(()=>applyManagementLocal(plan,hard),'TARGET_UNSAFE');
  check('Hard-linked state files are refused without altering external file',readFileSync(outsideFile,'utf8')==='LOCAL_LINK_PROOF');
  const altered=target('altered-path');Object.defineProperty(altered,'persistPath',{value:resolve(out,'unauthorized-state')});
  await stopped(()=>applyManagementLocal(plan,altered),'TARGET_UNSAFE');
  check('In-memory target path changes cannot escape fixed local namespace',!existsSync(altered.persistPath));
  check('Original immutable inventory bytes are unchanged after every scenario',sha256(readFileSync(input))===originalSHA);
  result.status='passed';result.inputFingerprint=plan.inputFingerprint;result.provenance=plan.provenance;result.semanticSHA256=plan.semanticSHA256;
} catch(error) {result.status='failed';result.error=error instanceof Error?error.stack:String(error);if(error instanceof Error&&'cause' in error&&error.cause instanceof Error)result.cause=error.cause.message;process.exitCode=1;}
finally {result.finishedAt=new Date().toISOString();writeFileSync(resolve(out,'result.json'),JSON.stringify(result,null,2)+'\n');process.stdout.write(JSON.stringify(result,null,2)+'\n');}
