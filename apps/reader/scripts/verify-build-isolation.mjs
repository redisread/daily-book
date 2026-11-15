import assert from 'node:assert/strict';
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const mode = process.argv[2] ?? 'default';
assert(['default', 'race'].includes(mode));
const root = new URL('../.cloudflare/output/v0/', import.meta.url);
const config = JSON.parse(readFileSync(new URL('config.json', root), 'utf8'));
const worker = JSON.parse(readFileSync(new URL('workers/default/worker.config.json', root), 'utf8'));
const checks = [];
const check = (label, condition) => { assert(condition, label); checks.push(label); };
const race = mode === 'race';
check('Build Output records the intended mode', config.buildContext.mode === (race ? 'reader-race-test' : 'production'));
check('Worker name selects the intended local-only assembly', worker.name === (race ? 'daily-book-reader-race-local' : 'daily-book-reader-local'));
check('D1 ID is the fixed isolated dummy, never provisioned remotely', worker.env.DB.id === (race ? '00000000-0000-4000-8000-000000000053' : '00000000-0000-4000-8000-000000000049') && worker.env.DB.dev.remote === false);
function sources(url) {
  return readdirSync(url, { withFileTypes: true }).flatMap((entry) => {
    const child = new URL(entry.name + (entry.isDirectory() ? '/' : ''), url);
    return entry.isDirectory() ? sources(child) : entry.name.endsWith('.js') ? [readFileSync(child, 'utf8')] : [];
  });
}
const bundle = sources(new URL('workers/default/bundle/', root));
check('The generated worker bundle is actually inspected', bundle.length > 0 && bundle.some((source) => source.length > 10000));
for (const token of ['reader_test_barrier', 'Local race-test barrier timed out'])
  check(`${race ? 'Test' : 'Default'} bundle ${race ? 'includes' : 'excludes'} ${token}`, bundle.some((source) => source.includes(token)) === race);
const client = sources(new URL('workers/default/assets/', root));
check('Client assets contain no test barrier controls', client.every((source) => !source.includes('reader_test_barrier') && !source.includes('Local race-test barrier timed out')));
const output = new URL('../.cloudflare/evidence/', import.meta.url); mkdirSync(output, { recursive: true });
const result = { mode, checks, bundleFilesInspected: bundle.length, clientFilesInspected: client.length, status: 'passed', finishedAt: new Date().toISOString() };
writeFileSync(new URL(`build-isolation-${mode}.json`, output), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
