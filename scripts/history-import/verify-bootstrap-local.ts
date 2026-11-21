import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { outsideRepository } from '../content-inventory';
import { executeLocalBootstrap, planLocalBootstrap } from './bootstrap-local';
import { LocalManagementTarget, type ManagementQuery } from './local-management-db';
import { ImportError, ROOT } from './model';

const [inputFlag, inputPath, outputFlag, outputPath] = process.argv.slice(2);
assert(process.argv.length === 6 && inputFlag === '--input' && outputFlag === '--out',
  'Usage: --input <approved inventory> --out <new external directory>');
const input = resolve(inputPath);
const out = outsideRepository(ROOT, outputPath);
assert(!existsSync(out), 'Choose a new evidence directory');
mkdirSync(out, { recursive: true, mode: 0o700 });
const reader = resolve(ROOT, 'apps/reader');
const checks: string[] = [];
const check = (description: string, condition: unknown) => {
  assert(condition, description);
  checks.push(description);
};
const output = (file: string, value: unknown) =>
  writeFileSync(resolve(out, file), `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
const localTarget = (id: string) => new LocalManagementTarget(`test-bootstrap-${id}`);
const matches = (code: string) => (error: unknown) => error instanceof ImportError && error.code === code;

const id = randomUUID();
const target = localTarget(id);
const plan = planLocalBootstrap(input, id);
output('plan.json', plan);
check('Dry-run is deterministic, checks 3,060 source fields, and creates no local target',
  plan.databaseOpened === false && plan.plan.sourceFieldChecks === 3060 && !existsSync(target.persistPath)
  && JSON.stringify(planLocalBootstrap(input, id)) === JSON.stringify(plan));

const cliArgs = ['--input', input, '--target', id];
const planFile = resolve(out, 'plan.json');
const cli = (args: string[], timeout: number) => spawnSync(process.execPath, [
  '--import', 'tsx', resolve(ROOT, 'scripts/bootstrap-reader-local.ts'), ...args,
], { cwd: ROOT, encoding: 'utf8', timeout });
const dryRun = cli(cliArgs, 15_000);
assert.ifError(dryRun.error);
check('Four CLI arguments produce the reviewed dry-run without creating a target',
  dryRun.status === 0
  && JSON.stringify(JSON.parse(dryRun.stdout)) === JSON.stringify(plan) && !existsSync(target.persistPath));

const invalidApplyArguments = [
  ['--apply-local'],
  ['--apply-local', ''],
  ['--apply-local', '  '],
  ['--apply-local', '--remote'],
  ['', planFile],
  ['', ''],
  ['--remote', planFile],
  ['--apply-local', planFile, '--remote'],
];
for (const suffix of invalidApplyArguments) {
  const rejected = cli([...cliArgs, ...suffix], 15_000);
  assert.ifError(rejected.error);
  assert.equal(rejected.status, 1, JSON.stringify(suffix));
  assert.equal(rejected.stdout, '', JSON.stringify(suffix));
  const errorLine = rejected.stderr.trim().split('\n').at(-1) ?? '';
  assert.equal(JSON.parse(errorLine).code, 'INVALID_ARGUMENT', JSON.stringify(suffix));
  assert(!existsSync(target.persistPath), JSON.stringify(suffix));
}
check('Malformed CLI apply arguments all exit nonzero without creating a target', true);

const wrongId = randomUUID();
await assert.rejects(executeLocalBootstrap(input, wrongId, plan), matches('PLAN_MISMATCH'));
await assert.rejects(executeLocalBootstrap(input, id, plan, localTarget(wrongId)), matches('TARGET_INVALID'));
const changed = structuredClone(plan);
changed.plan.migrations = changed.plan.migrations.slice(1);
await assert.rejects(executeLocalBootstrap(input, id, changed), matches('PLAN_MISMATCH'));
const driftedInput = resolve(out, 'changed-inventory.json');
writeFileSync(driftedInput, `${readFileSync(input, 'utf8')}\n`, { flag: 'wx', mode: 0o600 });
await assert.rejects(executeLocalBootstrap(driftedInput, id, plan), matches('RELEASE_PREFLIGHT'));
check('Wrong target, tampered plan, and inventory drift stop before target creation',
  !existsSync(target.persistPath) && !existsSync(localTarget(wrongId).persistPath));

const preexistingId = randomUUID();
const preexisting = localTarget(preexistingId);
await preexisting.batch([{ sql: 'CREATE TABLE keep_me(value TEXT)' }]);
await assert.rejects(executeLocalBootstrap(input, preexistingId, planLocalBootstrap(input, preexistingId)), matches('TARGET_UNOWNED'));
check('Preexisting state without ownership is preserved', (await preexisting.rows('SELECT count(*) AS count FROM keep_me'))[0].count === 0);

const apply = cli([...cliArgs, '--apply-local', planFile], 120_000);
assert.ifError(apply.error);
assert.equal(apply.status, 0, apply.stderr || apply.stdout);
const first: Awaited<ReturnType<typeof executeLocalBootstrap>> = JSON.parse(apply.stdout);
output('first.json', first);
check('Native D1 commits all three migrations and imports 128 books, 129 issues and 627 quotes',
  first.status === 'applied-local' && first.migrationReceipt.committed.length === 3
  && first.importReceipt?.counts.books === 128 && first.importReceipt.counts.issues === 129
  && first.importReceipt.counts.quotes === 627 && first.importReceipt.fieldChecks === 6345
  && first.importReceipt.differences === 0 && first.importReceipt.servedBy.includes('miniflare.db'));
const repeat = await executeLocalBootstrap(input, id, plan);
output('repeat.json', repeat);
check('Same approved plan reruns as a verified no-op',
  repeat.status === 'noop-verified' && repeat.migrationReceipt.status === 'noop-verified'
  && repeat.migrationReceipt.schemaSHA256 === first.migrationReceipt.schemaSHA256
  && repeat.importReceipt?.dataSHA256 === first.importReceipt?.dataSHA256
  && repeat.importReceipt?.importedAt === first.importReceipt?.importedAt);

const backup = resolve(out, 'backup');
cpSync(target.persistPath, backup, { recursive: true, errorOnExist: true, force: false });
const preserved = `${target.persistPath}-before-restore`;
renameSync(target.persistPath, preserved);
cpSync(backup, target.persistPath, { recursive: true, errorOnExist: true, force: false });
const restored = await executeLocalBootstrap(input, id, plan);
output('restored.json', restored);
check('Offline backup restored into the same isolated identity and verified all fields',
  restored.status === 'noop-verified' && restored.importReceipt?.dataSHA256 === first.importReceipt?.dataSHA256
  && restored.importReceipt?.fieldChecks === 6345 && existsSync(preserved));

class InterruptedMigration extends LocalManagementTarget {
  override async migrate() {
    const cli = resolve(reader, 'node_modules/.bin/cf');
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
      key !== 'CONTENT_API_KEY' && !key.startsWith('CLOUDFLARE_')));
    execFileSync(cli, ['d1', 'migrations', 'apply', plan.plan.target.databaseId, '--local',
      '--mode', 'reader-admin-write-test', '--persist-to', relative(reader, this.persistPath),
      '--dir', resolve(reader, 'migrations'), '--pattern', resolve(reader, 'migrations/0001_initial.sql')],
    { cwd: reader, env, stdio: ['ignore', 'pipe', 'pipe'] });
    throw new Error('Injected interruption after the first native migration commit');
  }
}
const interruptedId = randomUUID();
const interruptedPlan = planLocalBootstrap(input, interruptedId);
const partial = await executeLocalBootstrap(input, interruptedId, interruptedPlan,
  new InterruptedMigration(localTarget(interruptedId).namespace));
output('interrupted.json', partial);
check('Interrupted migration records only 0001 and commits no import',
  partial.status === 'stopped-migration-incomplete' && partial.migrationReceipt.committed.length === 1 && partial.importReceipt === null
  && (await localTarget(interruptedId).rows('SELECT count(*) AS count FROM books'))[0].count === 0);
const resumed = await executeLocalBootstrap(input, interruptedId, interruptedPlan);
output('resumed.json', resumed);
check('The exact empty prefix resumes and retains the original migration commit record',
  resumed.status === 'applied-local' && resumed.migrationReceipt.committed.length === 3
  && JSON.stringify(resumed.migrationReceipt.committed[0]) === JSON.stringify(partial.migrationReceipt.committed[0])
  && resumed.importReceipt?.fieldChecks === 6345);

class LostAcknowledgments extends LocalManagementTarget {
  importWrites = 0;
  override async migrate() {
    await super.migrate();
    throw new Error('Injected lost response after native migration commits');
  }
  override async batch(queries: ManagementQuery[]) {
    const result = await super.batch(queries);
    if (queries.length === 4 && queries[0].sql.startsWith('INSERT INTO _local_history_management_receipt')) {
      this.importWrites++;
      throw new Error('Injected lost response after atomic import commit');
    }
    return result;
  }
}
const lostId = randomUUID();
const lostPlan = planLocalBootstrap(input, lostId);
const lostTarget = new LostAcknowledgments(localTarget(lostId).namespace);
const observed = await executeLocalBootstrap(input, lostId, lostPlan, lostTarget);
output('lost-ack.json', observed);
check('Both lost responses are reconciled from real local state without repeating the import',
  observed.migrationReceipt.status === 'commit-observed-after-uncertain-ack'
  && observed.importReceipt?.status === 'applied-observed-after-uncertain-ack'
  && observed.importReceipt.fieldChecks === 6345 && lostTarget.importWrites === 1);
const afterLoss = await executeLocalBootstrap(input, lostId, lostPlan);
check('Explicit rerun after response loss performs no migration or import',
  afterLoss.status === 'noop-verified' && afterLoss.importReceipt?.dataSHA256 === observed.importReceipt?.dataSHA256);

await localTarget(interruptedId).batch([{ sql: "UPDATE books SET title='LOCAL_CONFLICT' WHERE id='the-mythical-man-month'" }]);
const conflict = await executeLocalBootstrap(input, interruptedId, interruptedPlan);
check('Changed data stops without replacement',
  conflict.status === 'stopped-import' && conflict.reason?.code === 'TARGET_CONFLICT'
  && (await localTarget(interruptedId).rows("SELECT title FROM books WHERE id='the-mythical-man-month'"))[0].title === 'LOCAL_CONFLICT');

output('result.json', { status: 'passed', checks, target: id, fields: first.importReceipt?.fieldChecks, differences: 0 });
process.stdout.write(`Passed ${checks.length} checks; backup and receipts recorded in ${out}\n`);
