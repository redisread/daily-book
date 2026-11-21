import { lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { canonical, sha256 } from '../content-inventory';
import { ROOT, ensure, ImportError, type Scalar } from './model';
import { loadManagementPlan } from './model-management';
import { LocalManagementTarget } from './local-management-db';
import { applyManagementLocal, inspectManagementForTest as inspectManagement } from './apply-management';
import { D1_MIGRATIONS_SQL, DEFINITION_SQL, definitionFingerprint, normalizeSQL, type Definition } from './schema';
import { MANAGEMENT_MIGRATIONS, schemaFingerprint, verifyManagementMigrationPins } from './schema-management';
import { buildPreflight, readReleaseTarget } from '../../apps/reader/scripts/production-release-preflight.mjs';

const reader = resolve(ROOT, 'apps/reader');
const fakeDatabaseId = '00000000-0000-4000-8000-000000000072';
const ownerFile = 'bootstrap-plan.sha256';
const lockFile = 'bootstrap-lock.sqlite';
const businessTables = ['books', 'issues', 'quotes', 'admin_write_receipts', 'admin_audit_events', 'admin_rate_limit_buckets'];
const localIdPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;

function namespace(id: string) {
  ensure(localIdPattern.test(id), 'TARGET_INVALID', 'Target must be a fresh UUID v4 for the isolated local rehearsal');
  return `test-bootstrap-${id}`;
}

function preparePlan(input: string, id: string) {
  const targetNamespace = namespace(id);
  const releaseTarget = readReleaseTarget();
  const preflight = buildPreflight({
    target: releaseTarget,
    commitSha: undefined,
    inventoryPath: input,
    overlayPath: resolve(ROOT, 'scripts/history-import/overlay.json'),
    requireInventory: true,
    requireOverlay: true,
  });
  ensure(preflight.status === 'DISABLED_AS_DESIGNED' && releaseTarget.deploymentEnabled === false
    && releaseTarget.accountId === null && releaseTarget.databaseId === null
    && releaseTarget.schemaReceiptSha256 === null && releaseTarget.historyImportReceiptSha256 === null,
  'RELEASE_PREFLIGHT', preflight.errors.map(error => error.code).join(', ') || 'Expected the committed disabled release target');
  const history = loadManagementPlan(input);
  const plan = {
    formatVersion: 1,
    localOnly: true,
    target: { id, namespace: targetNamespace, databaseId: fakeDatabaseId, engine: 'miniflare.db' },
    inputs: {
      sourceCommit: history.provenance.sourceCommit,
      inventorySHA256: history.provenance.inventorySHA256,
      overlaySHA256: history.provenance.overlaySHA256,
      historyFingerprint: history.inputFingerprint,
      semanticSHA256: history.semanticSHA256,
    },
    migrations: MANAGEMENT_MIGRATIONS,
    expectedCounts: {
      books: history.summary.books,
      issues: history.summary.issues,
      quotes: history.summary.quotes,
      admin_write_receipts: 0,
      admin_audit_events: 0,
      admin_rate_limit_buckets: 0,
      missingEditorNote: history.summary.missingEditorNote,
      nextIssueNumber: history.summary.nextIssueNumber,
    },
    sourceFieldChecks: history.sourceFieldChecks,
  };
  return { history, plan, planSHA256: sha256(canonical(plan)) };
}

export function planLocalBootstrap(input: string, id: string) {
  const { plan, planSHA256 } = preparePlan(input, id);
  return { status: 'dry-run', databaseOpened: false, planSHA256, plan };
}

function assertStatePath(path: string, directory: boolean) {
  const info = lstatSync(path, { throwIfNoEntry: false });
  if (!info) return false;
  ensure(directory ? info.isDirectory() : info.isFile() && info.nlink === 1, 'TARGET_UNSAFE', 'Rehearsal state cannot traverse links or unexpected files');
  return true;
}

async function withOwnedTarget<T>(target: LocalManagementTarget, digest: string, execute: () => Promise<T>): Promise<T> {
  for (const directory of [resolve(reader, '.cloudflare'), resolve(reader, '.cloudflare/management-rehearsal'), target.persistPath]) {
    if (!assertStatePath(directory, true)) mkdirSync(directory, { recursive: true, mode: 0o700 });
    assertStatePath(directory, true);
  }
  const lockPath = resolve(target.persistPath, lockFile);
  const ownerPath = resolve(target.persistPath, ownerFile);
  for (const suffix of ['', '-journal', '-wal', '-shm']) assertStatePath(lockPath + suffix, false);
  assertStatePath(ownerPath, false);
  const lock = new DatabaseSync(lockPath);
  try {
    try {
      lock.exec('BEGIN IMMEDIATE');
    } catch (error) {
      throw new Error('Cannot lock the isolated bootstrap target', { cause: error });
    }
    if (assertStatePath(ownerPath, false)) {
      ensure(readFileSync(ownerPath, 'utf8') === `${digest}\n`, 'TARGET_PLAN_MISMATCH', 'Existing local state belongs to another plan');
    } else {
      ensure(readdirSync(target.persistPath).every(name => name === lockFile || name === `${lockFile}-journal`),
        'TARGET_UNOWNED', 'Existing local state has no ownership record');
      writeFileSync(ownerPath, `${digest}\n`, { flag: 'wx', mode: 0o600 });
    }
    return await execute();
  } finally {
    lock.close();
  }
}

function asDefinitions(rows: Record<string, Scalar>[]): Definition[] {
  return rows.map(row => {
    ensure(['type', 'name', 'tbl_name', 'sql'].every(key => typeof row[key] === 'string'), 'TARGET_SCHEMA_UNKNOWN', 'Malformed local schema definition');
    return { type: String(row.type), name: String(row.name), tbl_name: String(row.tbl_name), sql: String(row.sql) };
  });
}

function referencePrefix(count: number) {
  const db = new DatabaseSync(':memory:');
  try {
    for (const { name } of MANAGEMENT_MIGRATIONS.slice(0, count)) {
      db.exec(readFileSync(resolve(reader, 'migrations', name), 'utf8'));
    }
    return asDefinitions(db.prepare(DEFINITION_SQL).all() as Record<string, Scalar>[]);
  } finally {
    db.close();
  }
}

async function readMigrationState(target: LocalManagementTarget) {
  const definitions = asDefinitions(await target.rows(DEFINITION_SQL));
  const ledger = definitions.find(row => row.name === 'd1_migrations');
  if (ledger) {
    ensure(ledger.type === 'table' && normalizeSQL(ledger.sql) === normalizeSQL(D1_MIGRATIONS_SQL),
      'TARGET_SCHEMA_UNKNOWN', 'Unknown local migration ledger schema');
  }
  const rows = ledger ? await target.rows('SELECT id,name,applied_at FROM d1_migrations ORDER BY id') : [];
  ensure(rows.length <= MANAGEMENT_MIGRATIONS.length && rows.every((row, index) =>
    row.id === index + 1 && row.name === MANAGEMENT_MIGRATIONS[index].name
    && typeof row.applied_at === 'string' && Number.isFinite(Date.parse(row.applied_at))),
  'TARGET_SCHEMA_UNKNOWN', 'Migration ledger is not an exact prefix of the pinned sequence');
  const committed = rows.map((row, index) => ({
    ...MANAGEMENT_MIGRATIONS[index], id: Number(row.id), appliedAt: String(row.applied_at),
  }));
  if (committed.length === MANAGEMENT_MIGRATIONS.length) {
    const state = await inspectManagement(target);
    const { writeReceipts, auditEvents, rateLimitBuckets } = state.counts;
    ensure(writeReceipts === 0 && auditEvents === 0 && rateLimitBuckets === 0, 'TARGET_NOT_EMPTY', 'Target contains unrelated management records');
    if (state.receipts.length === 0) {
      ensure(Object.values(state.counts).every(count => count === 0), 'TARGET_NOT_EMPTY', 'Target contains data without this import receipt');
    }
    return { committed, schemaSHA256: schemaFingerprint(), imported: state.receipts.length === 1 };
  }

  const business = definitions.filter(row => row.name !== 'd1_migrations');
  ensure(definitionFingerprint(business) === definitionFingerprint(referencePrefix(committed.length)),
    'TARGET_SCHEMA_UNKNOWN', 'Local schema is not the exact schema of the committed migration prefix');
  for (const table of businessTables.filter(name => business.some(definition => definition.name === name))) {
    const [result] = await target.rows(`SELECT count(*) AS count FROM ${table}`);
    ensure(result.count === 0, 'TARGET_NOT_EMPTY', 'Partially migrated target contains data');
  }
  return { committed, schemaSHA256: sha256(definitionFingerprint(business)), imported: false };
}

export async function executeLocalBootstrap(input: string, id: string, approved: unknown,
  target = new LocalManagementTarget(namespace(id))) {
  const { history, plan, planSHA256 } = preparePlan(input, id);
  ensure(canonical(approved) === canonical({ status: 'dry-run', databaseOpened: false, planSHA256, plan }),
    'PLAN_MISMATCH', 'Approved dry-run differs from the current inputs, migrations, or target');
  ensure(target.namespace === plan.target.namespace && target.persistPath === resolve(reader, '.cloudflare/management-rehearsal', plan.target.namespace),
    'TARGET_INVALID', 'Execution target must match the isolated namespace in the approved plan');

  return withOwnedTarget(target, planSHA256, async () => {
    const before = await readMigrationState(target);
    let after = before;
    let uncertain = false;
    if (before.committed.length < plan.migrations.length) {
      verifyManagementMigrationPins();
      try {
        await target.migrate();
      } catch {
        uncertain = true;
      }
      verifyManagementMigrationPins();
      after = await readMigrationState(target);
    }

    const complete = after.committed.length === plan.migrations.length;
    const migrationReceipt = {
      phase: 'schema',
      status: !complete ? 'incomplete' : uncertain ? 'commit-observed-after-uncertain-ack'
        : after === before ? 'noop-verified' : 'applied-local',
      planSHA256,
      committed: after.committed,
      schemaSHA256: after.schemaSHA256,
    };
    if (!complete) return { status: 'stopped-migration-incomplete', planSHA256, migrationReceipt, importReceipt: null };

    // The existing importer binds business rows and its internal receipt in one D1 batch.
    // Migration metadata stays committed if the import fails or its response is lost.
    try {
      const imported = await applyManagementLocal(history, target);
      return {
        status: after.imported ? 'noop-verified' : 'applied-local',
        planSHA256, migrationReceipt,
        importReceipt: { phase: 'history', planSHA256, differences: 0, ...imported },
      };
    } catch (error) {
      return {
        status: 'stopped-import',
        planSHA256, migrationReceipt,
        importReceipt: null,
        reason: error instanceof ImportError ? { code: error.code, message: error.message }
          : { code: 'IMPORT_FAILED', message: 'Import failed during local execution; inspect the target before retrying' },
      };
    }
  });
}
