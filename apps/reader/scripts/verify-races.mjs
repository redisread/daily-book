import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash, randomBytes } from 'node:crypto';
import { setTimeout as wait } from 'node:timers/promises';
import { migrateRaceDB, raceSQL, raceRows } from './race-db.mjs';
import { stripAnsi } from './readiness.mjs';

const mode = process.argv[2]; assert(['dev', 'built'].includes(mode));
const root = fileURLToPath(new URL('../', import.meta.url));
const output = new URL('../.cloudflare/evidence/', import.meta.url); mkdirSync(output, { recursive: true });
const port = mode === 'dev' ? 49353 : 49354;
const origin = `http://127.0.0.1:${port}`;
const result = { mode, startedAt: new Date().toISOString(), checks: [], cases: [] };
const check = (name, condition) => { assert(condition, name); result.checks.push(name); };
const headers = { RSC: '1', Accept: 'text/x-component', 'X-Reader-Visibility': 'published', 'X-Request-Id': 'forged-shared-context' };
let server; let logs = ''; let readinessLogs = ''; let pending;
const runtimeSecret = randomBytes(32).toString('hex');
const ids = new Set();
const hash = (value) => createHash('sha256').update(value).digest('hex');
async function request(path, requestHeaders = {}) {
  assert(!(path.startsWith('/api/') && requestHeaders.RSC), 'RSC transport headers belong to page requests, not the JSON API');
  const response = await fetch(new URL(path, origin), { headers: { 'Accept-Encoding': 'identity', ...requestHeaders }, redirect: 'manual', signal: AbortSignal.timeout(20000) });
  const text = await response.text();
  return { status: response.status, headers: response.headers, text };
}
function inspect(label, response, status, prefix) {
  check(`${label}: actual HTTP ${status}`, response.status === status);
  // Successful RSC must really be Flight. This pinned framework's proxy early
  // exits preserve the existing HTML 410 response (observed, not a Flight 200).
  const expectedMime = label.startsWith('RSC ') && status === 200 ? 'text/x-component' : 'text/html';
  check(`${label}: actual ${expectedMime} transport`, (response.headers.get('content-type') ?? '').includes(expectedMime));
  check(`${label}: no-store`, /no-store/.test(response.headers.get('cache-control') ?? ''));
  check(`${label}: no private fixture payload`, !response.text.includes('PRIVATE_RACE_'));
  if (status === 200) {
    for (const field of ['TITLE', 'AUTHOR', 'DESCRIPTION', 'NOTE', 'QUOTE', 'SOURCE'])
      check(`${label}: coherent ${field}`, response.text.includes(prefix + '_' + field));
    check(`${label}: no other public snapshot mixed in`, !response.text.includes((prefix === 'PUBLIC_INITIAL' ? 'PUBLIC_RESTORED' : 'PUBLIC_INITIAL') + '_TITLE'));
  } else {
    check(`${label}: no public body on closed snapshot`, !response.text.includes('PUBLIC_INITIAL_') && !response.text.includes('PUBLIC_RESTORED_'));
  }
}
function stateSQL(prefix, status) {
  assert(['PUBLIC_INITIAL', 'PUBLIC_RESTORED', 'PRIVATE_RACE_WITHDRAWN'].includes(prefix));
  assert(['published', 'withdrawn'].includes(status));
  return `UPDATE books SET title='${prefix}_TITLE',author='${prefix}_AUTHOR',description='${prefix}_DESCRIPTION',cover_title='${prefix}_COVER',version=version+1 WHERE id='race-book';
    UPDATE quotes SET text='${prefix}_QUOTE',source_label='${prefix}_SOURCE' WHERE id='race-quote';
    UPDATE issues SET status='${status}',editor_note='${prefix}_NOTE',body='${prefix}_BODY',version=version+1 WHERE id='race-issue';`;
}
async function barrier() {
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) {
    const [row] = await raceRows("SELECT * FROM reader_test_barrier WHERE id='current'");
    if (row.claimed === 1) return row;
    await wait(25);
  }
  throw new Error('The request did not reach the controlled visibility barrier');
}
try {
  await migrateRaceDB();
  await raceSQL(readFileSync(new URL('../fixtures/races.sql', import.meta.url), 'utf8'));
  await raceSQL("UPDATE reader_test_barrier SET armed=0,released=1 WHERE id='current';" + stateSQL('PUBLIC_INITIAL', 'published'));
  server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', mode === 'dev' ? 'dev' : 'preview', '--mode', 'reader-race-test', '--host', '127.0.0.1', '--port', String(port)], { cwd: root, detached: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, CONTENT_API_KEY: runtimeSecret } });
  for (const stream of [server.stdout, server.stderr]) stream.on('data', (chunk) => {
    logs += chunk.toString();
    readinessLogs = stripAnsi(logs);
  });
  const deadline = Date.now() + 60000;
  while (!readinessLogs.includes(origin)) {
    if (server.exitCode !== null) throw new Error(`Owned test server exited: ${server.exitCode}`);
    if (Date.now() > deadline) throw new Error('Owned test server startup timed out');
    await wait(100);
  }
  const ready = await request('/api/v1/issues/race-issue');
  check('Dedicated test Worker uses its own dummy53 D1 state', ready.status === 200 && JSON.parse(ready.text).data.book.title === 'PUBLIC_INITIAL_TITLE');
  const native = execFileSync('ps', ['-axo', 'pid=,ppid=,pgid=,command='], { encoding: 'utf8' }).split('\n')
    .map((line) => /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/.exec(line))
    .filter((m) => m && Number(m[3]) === server.pid && m[4].includes('/workerd') && /\bserve\b/.test(m[4]))
    .map((m) => ({ pid: Number(m[1]), parent: Number(m[2]), group: Number(m[3]), command: m[4] }));
  check('Barrier cases execute in an owned native workerd', native.length > 0); result.runtimeProcesses = native;
  // Normalize the framework's RSC transport URL BEFORE arming the barrier. A 307
  // creates another HTTP request and must not be mistaken for one read snapshot.
  let rscPath = '/issues/race-issue?_rsc';
  for (let hop = 0; hop < 3; hop++) {
    const response = await request(rscPath, headers);
    if (response.status !== 307) { check('Canonical RSC request is a real public 200', response.status === 200); break; }
    const next = new URL(response.headers.get('location'), origin);
    assert(next.origin === origin && next.pathname === '/issues/race-issue' && next.searchParams.has('_rsc'));
    rscPath = next.pathname + next.search;
  }
  for (const transport of ['HTML', 'RSC']) {
    const path = transport === 'HTML' ? '/issues/race-issue' : rscPath;
    const requestHeaders = transport === 'RSC' ? headers : { 'X-Reader-Visibility': 'published', 'X-Request-Id': 'forged-shared-context' };
    for (const transition of ['withdraw', 'restore']) {
      const label = `${transport} ${transition}`;
      const oldKind = transition === 'withdraw' ? 'published' : 'withdrawn';
      await raceSQL("UPDATE reader_test_barrier SET armed=0,released=1 WHERE id='current';" + stateSQL(transition === 'withdraw' ? 'PUBLIC_INITIAL' : 'PRIVATE_RACE_WITHDRAWN', oldKind));
      await raceSQL("UPDATE reader_test_barrier SET armed=1,claimed=0,released=0,request_id=NULL,observed_kind=NULL,physical_reads=NULL WHERE id='current'");
      let settled = false;
      // Attach rejection handling immediately while this request is deliberately
      // concurrent with the coordinator and another independent HTTP request.
      pending = request(path, requestHeaders).then((value) => { settled = true; return { value }; }, (error) => { settled = true; return { error }; });
      const gate = await barrier();
      check(`${label}: barrier is after the expected visibility decision`, gate.observed_kind === oldKind);
      check(`${label}: decision used exactly one physical issue projection`, gate.physical_reads === 1);
      check(`${label}: request identity is server-owned and independent`, typeof gate.request_id === 'string' && gate.request_id !== 'forged-shared-context' && !ids.has(gate.request_id));
      ids.add(gate.request_id);
      check(`${label}: first response has not completed before release`, !settled);
      await raceSQL(stateSQL(transition === 'withdraw' ? 'PRIVATE_RACE_WITHDRAWN' : 'PUBLIC_RESTORED', transition === 'withdraw' ? 'withdrawn' : 'published'));
      const concurrent = await request(path, requestHeaders);
      inspect(`${label} concurrent request`, concurrent, transition === 'withdraw' ? 410 : 200, 'PUBLIC_RESTORED');
      check(`${label}: an independent request completes while the first is paused`, !settled);
      await raceSQL("UPDATE reader_test_barrier SET released=1 WHERE id='current'");
      const outcome = await pending; pending = undefined;
      if (outcome.error) throw outcome.error;
      inspect(`${label} original request`, outcome.value, transition === 'withdraw' ? 200 : 410, 'PUBLIC_INITIAL');
      const fresh = await request(path, requestHeaders);
      inspect(`${label} next request`, fresh, transition === 'withdraw' ? 410 : 200, 'PUBLIC_RESTORED');
      const api = await request('/api/v1/issues/race-issue', { 'X-Reader-Visibility': 'published', 'X-Request-Id': 'forged-shared-context' });
      check(`${label}: API is a fresh visibility read`, api.status === (transition === 'withdraw' ? 410 : 200) && !api.text.includes('PRIVATE_RACE_'));
      check(`${label}: API keeps its JSON transport`, (api.headers.get('content-type') ?? '').includes('application/json'));
      if (api.status === 200) {
        const data = JSON.parse(api.text).data;
        check(`${label}: restoration keeps publication identity`, data.publicationDate === '2026-01-02' && data.issueNumber === 1);
      }
      result.cases.push({ transport, transition, gate, apiStatus: api.status, original: { status: outcome.value.status, mime: outcome.value.headers.get('content-type'), sha256: hash(outcome.value.text) }, concurrent: { status: concurrent.status, mime: concurrent.headers.get('content-type'), sha256: hash(concurrent.text) }, fresh: { status: fresh.status, mime: fresh.headers.get('content-type'), sha256: hash(fresh.text) } });
    }
  }
  check('Synthetic local secret is not written to server logs', !logs.includes(runtimeSecret));
  check('All four controlled withdraw/restore HTML/RSC cases completed', result.cases.length === 4);
  result.status = 'passed';
} catch (error) {
  result.status = 'failed'; result.error = error.stack; process.exitCode = 1;
} finally {
  try { await raceSQL("UPDATE reader_test_barrier SET armed=0,released=1 WHERE id='current'"); } catch { /* setup may have failed */ }
  if (pending) await pending;
  if (server && server.exitCode === null) {
    const exited = once(server, 'exit'); process.kill(-server.pid, 'SIGTERM');
    if (!(await Promise.race([exited.then(() => true), wait(5000, undefined, { ref: false }).then(() => false)]))) {
      try { process.kill(-server.pid, 'SIGKILL'); } catch { /* already exited */ }
    }
  }
  result.finishedAt = new Date().toISOString();
  const safeLogs = logs.replaceAll(runtimeSecret, '[redacted synthetic local secret]');
  writeFileSync(new URL(`race-${mode}-result.json`, output), JSON.stringify(result, null, 2));
  writeFileSync(new URL(`race-${mode}-server.log`, output), safeLogs);
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  if (result.status !== 'passed') process.stderr.write(safeLogs);
}
