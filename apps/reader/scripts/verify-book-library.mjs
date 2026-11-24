import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import Parser from 'rss-parser';
import { stripAnsi } from './readiness.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const parent = join(root, '.cloudflare', 'library-rehearsal');
mkdirSync(parent, { recursive: true });
const state = mkdtempSync(join(parent, 'run-'));
const mode = 'reader-library-test';
const db = '00000000-0000-4000-8000-000000000087';
const port = 49987;
const origin = 'http://127.0.0.1:' + port;
const key = randomUUID();
const cli = join(root, 'node_modules/.bin/cf');
const safeEnv = Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'USER', 'SystemRoot'].flatMap(name =>
  process.env[name] ? [[name, process.env[name]]] : []));
const env = { ...safeEnv, READER_LIBRARY_TEST_STATE: state, CLOUDFLARE_INCLUDE_PROCESS_ENV: 'true', CONTENT_API_KEY: key };
const localOptions = [db, '--local', '--mode', mode, '--persist-to', state];
const command = (args) => execFileSync(cli, args, { cwd: root, env: safeEnv, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
const migrate = directory => command(['d1', 'migrations', 'apply', ...localOptions, '--dir', directory]);
const sql = statement => JSON.parse(command(['d1', 'raw', ...localOptions, '--sql=' + statement]));
const rows = statement => sql(statement).flatMap(item => item.results.rows.map(row =>
  Object.fromEntries(item.results.columns.map((name, index) => [name, row[index]]))));
const parser = new Parser();
const checks = [];
const photos = [];
let browser;
let server;
let log = '';

async function stop() {
  if (!server || server.exitCode !== null) return;
  const exited = once(server, 'exit');
  process.kill(-server.pid, 'SIGTERM');
  if (!await Promise.race([exited.then(() => true), wait(5000, false, { ref: false })])) {
    process.kill(-server.pid, 'SIGKILL');
    await exited;
  }
}
async function start() {
  let output = '';
  server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--mode', mode, '--port', String(port), '--strictPort'],
    { cwd: root, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  for (const stream of [server.stdout, server.stderr]) stream.on('data', data => { output += data; log += data; });
  const deadline = Date.now() + 90000;
  while (!stripAnsi(output).includes(origin)) {
    if (server.exitCode !== null || Date.now() > deadline) throw new Error('Local library preview failed to start');
    await wait(100);
  }
}
async function request(path, status = 200, options = {}) {
  const response = await fetch(origin + path, { signal: AbortSignal.timeout(20000), redirect: 'manual', ...options });
  assert.equal(response.status, status, path + ': ' + (await response.clone().text()).slice(0, 800));
  return response;
}
async function publicBookId() {
  return /data-book-id="([^"]+)"/.exec(await (await request('/')).text())?.[1];
}
async function rss() {
  return parser.parseString(await (await request('/rss.xml')).text());
}
const today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
const tomorrow = new Date(Date.parse(today) + 86400000).toISOString().slice(0, 10);
const previousDay = new Date(Date.parse(today) - 86400000).toISOString().slice(0, 10);
const action = (id, name, tag) => request('/api/v1/admin/books/' + id + '/' + name, 200, {
  method: 'POST', body: '{}', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json',
    'Idempotency-Key': randomUUID(), 'If-Match': tag },
});
async function capture(page, name) {
  const file = join(state, name + '.png');
  await page.screenshot({ path: file, fullPage: true, animations: 'disabled' });
  photos.push(file);
}
let status = 'failed';
try {
  migrate('migrations');
  sql(readFileSync(join(root, 'fixtures/seed.sql'), 'utf8'));
  migrate('library-migrations');
  assert.equal(rows("SELECT status FROM book_content WHERE book_id='draft-book'")[0].status, 'draft');
  assert.equal(rows("SELECT status FROM book_content WHERE book_id='withdrawn-book'")[0].status, 'withdrawn');
  assert.deepEqual(rows("SELECT id,position FROM book_quotes WHERE book_id='shared-book' ORDER BY position"),
    [{ id: 'latest-q1', position: 0 }, { id: 'latest-q2', position: 1 }]);
  checks.push('Legacy draft and withdrawal stay private. Latest public issue supplies ordered excerpts.');

  // Add a second eligible book for verification of withdrawal and replacement.
  sql("INSERT INTO books (id,title,author) VALUES('replacement-book','Alpha','另一个作者'); INSERT INTO book_content (book_id,status,eligible_on) VALUES('replacement-book','published','0001-01-01')");
  execFileSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--mode', mode], {
    cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 12 * 1024 * 1024,
  });
  await start();
  const concurrent = await Promise.all(Array.from({ length: 18 }, (_, index) => index % 2
    ? publicBookId()
    : rss().then(feed => new URL(feed.items[0].link).pathname.split('/').at(-1))));
  assert(concurrent[0]);
  assert.equal(new Set(concurrent).size, 1);
  const firstId = concurrent[0];
  const original = (await rss()).items[0];
  assert.equal(original.guid, 'https://daily-book.jiahongw.com/#recommendation-' + today);
  checks.push('Concurrent native requests share a single recommendation across HTML and RSS.');

  const card = (await (await request('/api/v1/books?q=测试作者')).json()).items[0];
  assert.equal(card.id, 'shared-book');
  const catalog = (await (await request('/api/v1/books')).json()).items;
  assert.deepEqual(catalog.map(card => card.id), ['replacement-book', 'shared-book']);
  const shared = (await (await request('/api/v1/books/shared-book')).json()).data;
  assert.equal(shared.editorNote, '公开编辑的话');
  assert.deepEqual(shared.quotes.map(quote => quote.position), [0, 1]);
  assert(!Object.hasOwn(shared, 'body'));
  for (const path of ['/books/draft-book', '/books/withdrawn-book', '/api/v1/books/draft-book',
    '/api/v1/books/withdrawn-book', '/issues/published-latest', '/book/2026-11-01/', '/api/v1/issues', '/archive']) {
    const body = await (await request(path, 404)).text();
    assert(!body.includes('SENTINEL'));
  }
  await request('/books?q=a&q=b', 400);
  await request('/api/v1/books?page=0', 400);
  await request('/api/v1/admin/books/draft-book', 401);
  checks.push('Stable book routes, sorted catalog, author search, private-book exclusion, and retired URLs.');

  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const visitors = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  const page = await visitors.newPage();
  await page.goto(origin + '/');
  await expect(page.locator('article')).toHaveAttribute('data-book-id', firstId);
  await capture(page, 'home-mobile');
  await page.locator('nav a[href="/books"]:visible').click();
  await expect(page.getByRole('heading', { name: '书籍库', exact: true })).toBeVisible();
  await capture(page, 'library-mobile');
  await page.getByLabel('按书名或作者查找').fill('测试作者');
  await page.getByRole('button', { name: '搜索' }).click();
  await expect(page.locator('[data-library-book-id]')).toHaveCount(1);
  await page.locator('[data-library-book-id="shared-book"] a').click();
  await expect(page.getByRole('heading', { name: '公开书籍 <proof>' })).toBeVisible();
  await capture(page, 'book-mobile');
  checks.push('Mobile browser without JavaScript opens the library, searches, and visits a stable detail link.');

  const editorContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const editor = await editorContext.newPage();
  await editor.goto(origin + '/admin/books');
  await editor.getByLabel('管理密钥').fill(key);
  await editor.getByRole('button', { name: '新建草稿' }).click();
  await editor.getByLabel('书籍 ID', { exact: true }).fill('new-library-book');
  await editor.getByLabel('书名', { exact: true }).fill('Beta');
  await editor.getByLabel('作者', { exact: true }).fill('编辑测试作者');
  await editor.getByLabel('分类', { exact: true }).fill('测试');
  await editor.getByLabel('简介', { exact: true }).fill('测试简介');
  await editor.getByLabel('编者按', { exact: true }).fill('每日一书'.repeat(12));
  await editor.getByRole('button', { name: '添加书摘' }).click();
  await editor.getByLabel('摘录', { exact: true }).fill('新书的第一条摘录。');
  await editor.getByLabel('出处', { exact: true }).fill('第一章');
  await editor.getByRole('button', { name: '保存草稿' }).click();
  await expect(editor.getByRole('status')).toHaveText('已保存。');
  await request('/api/v1/books/new-library-book', 404);
  await editor.getByRole('button', { name: '发布书籍' }).click();
  await expect(editor.getByRole('link', { name: '查看公开书页' })).toBeVisible();
  await request('/api/v1/books/new-library-book');
  assert.equal(await publicBookId(), firstId);
  const newRow = rows("SELECT eligible_on FROM book_content WHERE book_id='new-library-book'")[0];
  assert.equal(newRow.eligible_on, tomorrow);
  await editor.getByLabel('管理密钥').fill('');
  await capture(editor, 'editor-desktop');
  checks.push('Browser saves a private draft, publishes it directly, and new book becomes eligible on the next Beijing date.');

  // Use the actual local scheduled Worker entry with explicit Beijing boundaries.
  const spec = await (await request('/cdn-cgi/local/explorer/api')).json();
  const cronRoute = Object.entries(spec?.paths ?? {}).find(([path, operations]) =>
    /cron|scheduled/.test(path) && operations?.post);
  assert(cronRoute, 'Local Explorer has no scheduled test endpoint');
  const dispatch = async scheduledTime => {
    const result = await request('/cdn-cgi/local/explorer/api' + cronRoute[0] + '?worker=daily-book-reader-library-local', 200, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cron: '0 16 * * *', scheduled_time: scheduledTime }),
    });
    const payload = await result.json();
    assert.equal(payload.success, true);
  };
  const token = { Authorization: 'Bearer ' + key };
  const record = async id => (await request('/api/v1/admin/books/' + id, 200, { headers: token })).headers.get('ETag');
  const other = firstId === 'shared-book' ? 'replacement-book' : 'shared-book';
  const midnight = Date.parse(today + 'T00:00:00+08:00');
  sql("UPDATE book_content SET eligible_on='" + tomorrow + "' WHERE book_id='" + other + "'");
  await dispatch(midnight - 1);
  await dispatch(midnight);
  await dispatch(midnight);
  assert.deepEqual(rows('SELECT day,book_id FROM daily_recommendations ORDER BY day'),
    [{ day: previousDay, book_id: firstId }, { day: today, book_id: firstId }]);
  const repeat = (await rss()).items;
  assert.equal(repeat.length, 2);
  assert.equal(repeat[0].link, repeat[1].link);
  assert.notEqual(repeat[0].guid, repeat[1].guid);
  assert.equal(repeat[1].guid, 'https://daily-book.jiahongw.com/#recommendation-' + previousDay);
  sql("UPDATE book_content SET eligible_on='" + today + "' WHERE book_id='" + other + "'");
  checks.push('Real scheduled invocations at Beijing midnight store separate days; repeated books keep separate RSS GUIDs.');

  await action(firstId, 'withdraw', await record(firstId));
  assert.deepEqual(rows("SELECT book_id FROM daily_recommendations WHERE day='" + today + "'"), [{ book_id: other }]);
  assert.equal(await publicBookId(), other);
  const replacement = (await rss()).items[0];
  assert.equal(replacement.guid, original.guid);
  assert(replacement.link.endsWith('/books/' + other));
  await stop();
  await start();
  assert.equal(await publicBookId(), other);
  await action(other, 'withdraw', await record(other));
  assert.deepEqual(rows("SELECT book_id FROM daily_recommendations WHERE day='" + today + "'"), [{ book_id: null }]);
  assert.equal(await publicBookId(), undefined);
  assert((await (await request('/')).text()).includes('暂无推荐'));
  assert(!(await rss()).items.some(item => item.guid === original.guid));
  checks.push('Withdrawal fills the same day, keeps the RSS GUID, and persists across restart. Empty eligible pool removes today.');

  await dispatch(midnight + 86400000 - 1);
  const empty = rows("SELECT book_id FROM daily_recommendations WHERE day='" + today + "'");
  assert.deepEqual(empty, [{ book_id: null }]);
  await dispatch(midnight + 86400000);
  const firstEligible = rows("SELECT book_id FROM daily_recommendations WHERE day='" + tomorrow + "'");
  assert.deepEqual(firstEligible, [{ book_id: 'new-library-book' }]);
  assert(!(await rss()).items.some(item => item.guid.endsWith(tomorrow)));
  checks.push('The newly published book enters the draw exactly at the next Beijing midnight. RSS excludes future entries.');
  status = 'passed';
} finally {
  if (browser) await browser.close();
  await stop();
  writeFileSync(join(state, 'runtime.log'), log.split(key).join('[REDACTED]'), { mode: 0o600 });
  const result = { status, checks, photos };
  writeFileSync(join(state, 'result.json'), JSON.stringify(result, null, 2) + '\n', { mode: 0o600 });
  console.log(JSON.stringify(result, null, 2));
}
