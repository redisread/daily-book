import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash, randomBytes } from 'node:crypto';
import { setTimeout as wait } from 'node:timers/promises';
import { localSQL, rows } from './local-db.mjs';
import { stripAnsi } from './readiness.mjs';

const mode = process.argv[2]; assert(['dev','built'].includes(mode));
const root = new URL('../', import.meta.url); process.chdir(fileURLToPath(root));
const dir = new URL('../.cloudflare/evidence/', import.meta.url); mkdirSync(dir, { recursive: true });
const origin = `http://127.0.0.1:${mode === 'dev' ? 49049 : 49050}`;
const seed = readFileSync(new URL('../fixtures/seed.sql', import.meta.url), 'utf8');
const checks = [];
const result = { mode, startedAt: new Date().toISOString(), checks };
const runtimeSecret = randomBytes(32).toString('hex');
let server; let logs = ''; let readinessLogs = '';
const check = (name, condition) => { assert(condition, name); checks.push(name); };
let splitEscapeLogs = '';
for (const chunk of [`${origin.slice(0, -5)}\u001b[3`, `2m${origin.slice(-5)}\u001b[0m`]) splitEscapeLogs += chunk;
check('ANSI readiness normalization handles an escape sequence split across chunks', stripAnsi(splitEscapeLogs) === origin);
const privateMarkers = [
  'DRAFT_ONLY_BOOK_', 'WITHDRAWN_ONLY_BOOK_', 'DRAFT_EDITOR_NOTE_SENTINEL', 'DRAFT_SHARED_EDITOR_NOTE_SENTINEL',
  'DRAFT_BODY_SENTINEL', 'DRAFT_SHARED_BODY_SENTINEL', 'WITHDRAWN_BODY_SENTINEL', 'WITHDRAWN_EDITOR_NOTE_SENTINEL',
  'DRAFT_QUOTE_SENTINEL', 'DRAFT_QUOTE_SOURCE_SENTINEL', 'DRAFT_SHARED_QUOTE_SENTINEL', 'DRAFT_SHARED_QUOTE_SOURCE_SENTINEL',
  'WITHDRAWN_QUOTE_SENTINEL', 'WITHDRAWN_QUOTE_SOURCE_SENTINEL',
];
const request = async (path, options = {}, noStore = true) => {
  const isRSC = options.headers?.RSC === '1';
  let target = new URL(path, origin);
  if (isRSC && !target.searchParams.has('_rsc')) target.search += (target.search ? '&' : '?') + '_rsc';
  let response; let text;
  for (let hop = 0; hop < 3; hop++) {
    response = await fetch(target, { ...options, headers: { 'Accept-Encoding': 'identity', ...(isRSC ? { Accept:'text/x-component' } : {}), ...options.headers }, redirect: 'manual', signal: AbortSignal.timeout(15000) });
    text = await response.text();
    for (const marker of privateMarkers) assert(!text.includes(marker), `Private fixture leaked at ${path}`);
    if (!isRSC || response.status !== 307) break;
    const next = new URL(response.headers.get('location'), origin);
    assert(next.origin === origin && next.pathname === target.pathname && next.searchParams.has('_rsc'), 'Only follow same-resource RSC protocol normalization');
    (result.rscCanonicalizations ??= []).push({ from:target.pathname+target.search, to:next.pathname+next.search, status:307 });
    target = next;
  }
  for (const marker of privateMarkers) assert(!text.includes(marker), `Private fixture leaked at ${path}`);
  if (noStore && !/no-store/.test(response.headers.get('cache-control') ?? '')) {
    const diagnostic = { path, status: response.status, headers: Object.fromEntries(response.headers), preview: text.slice(0,800) };
    writeFileSync(new URL(`${mode}-http-failure.json`,dir),JSON.stringify(diagnostic,null,2));
    assert.fail(`no-store at ${path}: ${response.status}, ${response.headers.get('cache-control')}`);
  }
  return { response, text, json: response.headers.get('content-type')?.includes('application/json') && text ? JSON.parse(text) : null };
};
const list = async (query = '') => {
  const r = await request('/api/v1/issues' + query); assert.equal(r.response.status, 200); return r.json;
};
const cursor = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
try {
  localSQL(seed);
  const expected = rows("SELECT id,publication_date FROM issues WHERE status='published' ORDER BY publication_date DESC,id DESC");
  assert.equal(expected.length, 28);
  server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', mode === 'dev' ? 'dev' : 'preview', '--host','127.0.0.1','--port',String(mode === 'dev' ? 49049 : 49050)], {
    cwd: root, env: { ...process.env, CONTENT_API_KEY: runtimeSecret }, detached: true, stdio: ['ignore','pipe','pipe'],
  });
  for (const stream of [server.stdout,server.stderr]) stream.on('data', (chunk) => {
    const output = chunk.toString();
    logs += output;
    readinessLogs = stripAnsi(logs);
  });
  const deadline = Date.now() + 60000;
  while (!readinessLogs.includes(origin)) {
    if (server.exitCode !== null) throw new Error(`Owned server exited: ${server.exitCode}`);
    if (Date.now() > deadline) throw new Error('Owned server startup timed out');
    await wait(100);
  }
  const first = await list();
  check('Default limit is exactly 20 and response envelope is {items,nextCursor}', first.items.length === 20 && typeof first.nextCursor === 'string' && Object.keys(first).sort().join(',') === 'items,nextCursor');
  check('Only published issues and referenced public book metadata returned', first.items.every((issue) => issue.status === 'published' && issue.book.id === 'shared-book'));
  const processRows = execFileSync('ps',['-axo','pid=,ppid=,pgid=,command='],{ encoding:'utf8' }).split('\n')
    .map((line) => /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/.exec(line))
    .filter((m) => m && Number(m[3]) === server.pid && m[4].includes('/workerd') && /\bserve\b/.test(m[4]))
    .map((m) => ({ pid:Number(m[1]), parent:Number(m[2]), group:Number(m[3]), command:m[4] }));
  check('Requests execute in an owned native workerd process', processRows.length > 0); result.runtimeProcesses = processRows;
  const all = await list('?limit=100');
  check('Maximum accepted limit is bounded and terminal cursor is null', all.items.length === 28 && all.nextCursor === null);
  check('Date DESC / id DESC order matches independent D1 query', JSON.stringify(all.items.map((issue) => issue.id)) === JSON.stringify(expected.map((row) => row.id)));
  check('Book numeric fields and typographic cover newline preserved', all.items[0].book.year === 2026 && all.items[0].book.pages === 200 && all.items[0].book.rating === 8.5 && all.items[0].book.coverTitle === '公开\n书籍');
  const decoded = JSON.parse(Buffer.from(first.nextCursor,'base64url').toString());
  check('Cursor records both ordering keys and format version', decoded.v === 1 && decoded.publicationDate === first.items.at(-1).publicationDate && decoded.id === first.items.at(-1).id && Object.keys(decoded).sort().join(',') === 'id,publicationDate,v');
  const seen = []; let next = null; let pages = 0;
  do {
    const page = await list('?limit=2' + (next ? `&cursor=${encodeURIComponent(next)}` : ''));
    check(`Keyset page ${++pages} has at most two published records`, page.items.length <= 2 && page.items.every((issue) => issue.status === 'published'));
    seen.push(...page.items.map((issue) => issue.id)); next = page.nextCursor;
    assert(pages <= 15, 'Pagination terminates');
  } while (next !== null);
  check('Keyset pagination has no skips, duplicates or private records', new Set(seen).size === 28 && JSON.stringify(seen) === JSON.stringify(expected.map((row) => row.id)));
  const afterEnd = await list(`?cursor=${cursor({v:1,publicationDate:expected.at(-1).publication_date,id:expected.at(-1).id})}`);
  check('After-last cursor returns an empty terminal page', afterEnd.items.length === 0 && afterEnd.nextCursor === null);
  for (const value of ['', '0','-1','1.5','1.0','NaN','Infinity','1e2','101','1000','001',' 20']) {
    const bad = await request('/api/v1/issues?limit=' + encodeURIComponent(value));
    check(`Invalid limit ${JSON.stringify(value)} is rejected, not clamped`, bad.response.status === 400 && bad.json.error.code === 'INVALID_LIMIT' && typeof bad.json.requestId === 'string');
  }
  for (const query of ['?status=draft','?status=withdrawn','?includeDrafts=true','?q=anything','?limit=1&limit=2','?cursor=a&cursor=b']) {
    const bad = await request('/api/v1/issues' + query);
    check(`Unsupported/ambiguous query ${query} rejected`, bad.response.status === 400 && bad.json.error.code === 'INVALID_QUERY');
  }
  const badCursors = ['', '%', 'x'.repeat(1025), 'not-base64!', Buffer.from('not-json').toString('base64url'),
    cursor({v:2,publicationDate:'2026-11-01',id:'published-latest'}),
    cursor({v:1,publicationDate:'2026-02-30',id:'published-latest'}),
    cursor({v:1,publicationDate:'2026-11-01',id:''}),
    cursor({v:1,publicationDate:'2026-11-01',id:'published-latest',status:'draft'}),
    cursor({v:1,publicationDate:'2026-11-01',id:"x' OR 1=1 --"}),
    cursor({v:1,publicationDate:'2026-11-01'}), cursor([]), cursor(null),
  ];
  for (const [index,value] of badCursors.entries()) {
    const bad = await request('/api/v1/issues?cursor=' + encodeURIComponent(value));
    check(`Invalid cursor ${index+1} rejected`, bad.response.status === 400 && bad.json.error.code === 'INVALID_CURSOR');
  }
  const detail = await request('/api/v1/issues/published-latest');
  check('Detail uses {data:issue} and matches the list projection', detail.response.status === 200 && Object.keys(detail.json).join(',') === 'data' && JSON.stringify(detail.json.data) === JSON.stringify(all.items[0]));
  check('Quotes preserve stable IDs, parent IDs, source labels and position order', JSON.stringify(detail.json.data.quotes.map((quote) => [quote.id,quote.issueId,quote.sourceLabel,quote.position])) === JSON.stringify([['latest-q1','published-latest','第一章',0],['latest-q2','published-latest','第二章',1]]));
  check('Issue body is stored/read by API and missing historical editor notes remain null', detail.json.data.body === 'PUBLISHED_BODY_STORED_NOT_RENDERED_LATEST' && all.items.find((issue) => issue.id === 'published-first').editorNote === null);
  const home = await request('/'); const html = await request('/issues/published-latest');
  check('Home uses latest published date rather than highest assigned number', home.response.status === 200 && home.text.includes('data-issue-id="published-latest"') && !home.text.includes('data-issue-id="withdrawn-hidden"'));
  check('Published SSR is real HTML with the same issue/book/quotes as API', html.response.status === 200 && html.text.includes('data-issue-id="published-latest"') && html.text.includes('公开书籍 &lt;proof&gt;') && html.text.includes('公开第一条书摘 &lt;proof&gt;') && html.text.includes('第一章'));
  check('Stored issue body is not added as a new SSR feature', !html.text.includes('PUBLISHED_BODY_STORED_NOT_RENDERED_LATEST'));
  const releaseProbe = { headers: { 'X-Reader-Release-Check': '1' } };
  const probedHome = await request('/', releaseProbe);
  const probedIssue = await request('/api/v1/issues/published-latest', releaseProbe);
  const servingVersion = probedHome.response.headers.get('x-reader-worker-version');
  check('Release probes identify the same serving Worker on SSR and API responses',
    !home.response.headers.has('x-reader-worker-version')
    && typeof servingVersion === 'string' && servingVersion.length > 0
    && servingVersion === probedIssue.response.headers.get('x-reader-worker-version')
    && probedHome.response.headers.get('cache-control') === 'no-store');
  const flight = await request('/issues/published-latest', { headers:{ RSC:'1' } });
  check('Published RSC request succeeds without private fixture content', flight.response.status === 200 && /text\/x-component/.test(flight.response.headers.get('content-type') ?? '') && flight.text.includes('公开第一条书摘'));
  let draftHTML; let missingHTML;
  for (const [id,status] of [['draft-hidden',404],['draft-shared',404],['withdrawn-hidden',410],['missing-issue',404]]) {
    const api = await request('/api/v1/issues/' + id);
    check(`${id}: API has real ${status} and only error/requestId`, api.response.status === status && Object.keys(api.json).sort().join(',') === 'error,requestId' && typeof api.json.error.message === 'string' && typeof api.json.requestId === 'string' && api.response.headers.get('x-request-id') === api.json.requestId);
    const page = await request('/issues/' + id);
    check(`${id}: SSR has real ${status}, not a status-looking 200`, page.response.status === status);
    if (id === 'draft-hidden') draftHTML = page.text;
    if (id === 'missing-issue') missingHTML = page.text;
    const data = await request('/issues/' + id, { headers:{ RSC:'1','Next-Router-Prefetch':'1' } });
    check(`${id}: RSC/prefetch has real ${status} and no private payload`, data.response.status === status);
  }
  check('Draft and unknown SSR responses are indistinguishable', draftHTML === missingHTML);
  for (const name of ['x-middleware-subrequest','x-reader-visibility']) {
    const bypass = await request('/issues/withdrawn-hidden', { headers: { [name]:'proxy:proxy:proxy:proxy:proxy' } });
    check(`Forged ${name} does not bypass visibility gate`, bypass.response.status === 410);
  }
  for (const [path,method] of [['/api/v1/issues','POST'],['/api/v1/issues/published-latest','PATCH'],['/api/v1/issues/published-latest','DELETE']]) {
    const r = await request(path, { method, headers:{ 'Content-Type':'application/json' }, body:JSON.stringify({body:'MUST_NOT_WRITE'}) });
    check(`${method} ${path} is not a public write API`, r.response.status === 405);
  }
  for (const path of ['/api/v1/admin/probe','/api/hello','/books.json','/book/2026-02-30']) {
    const r = await request(path,{},false); check(`${path} is absent, without legacy/probe fallback`,r.response.status === 404);
  }
  const legacy = await request('/book/2026-11-01?utm_source=archive');
  check('Old book date redirects to the precise current issue and drops legacy query parameters',
    legacy.response.status === 307 && legacy.response.headers.get('location') === '/issues/published-latest' && !legacy.text);
  const legacyHead = await request('/book/2026-11-01/', { method: 'HEAD' });
  check('Legacy date HEAD redirects without a body',
    legacyHead.response.status === 307 && legacyHead.response.headers.get('location') === '/issues/published-latest' && !legacyHead.text);
  const nonexistentLegacy = await request('/book/2026-11-06');
  const withdrawnLegacy = await request('/book/2026-11-05');
  check('Unknown and withdrawn dates are indistinguishable 404s without redirect',
    nonexistentLegacy.response.status === 404 && withdrawnLegacy.response.status === 404
    && !withdrawnLegacy.response.headers.has('location') && nonexistentLegacy.text === withdrawnLegacy.text);
  const methodLegacy = await request('/book/2026-11-01', { method: 'POST' });
  check('Old book date rejects writes',
    methodLegacy.response.status === 405 && methodLegacy.response.headers.get('allow') === 'GET, HEAD');
  const beforeWithdraw = await list('?limit=1');
  localSQL("UPDATE books SET title='READ_THROUGH_UPDATE <proof>',version=version+1 WHERE id='shared-book'");
  const changed = await request('/api/v1/issues/published-latest'); const changedHTML = await request('/issues/published-latest');
  check('API and same-URL SSR reflect a local D1 change without rebuild/restart', changed.json.data.book.title === 'READ_THROUGH_UPDATE <proof>' && changedHTML.text.includes('READ_THROUGH_UPDATE &lt;proof&gt;'));
  localSQL("UPDATE issues SET status='withdrawn' WHERE id='published-latest'");
  for (const [path,headers] of [['/api/v1/issues/published-latest',{}],['/issues/published-latest',{}],['/issues/published-latest',{RSC:'1'}]]) {
    const r = await request(path,{headers});
    check(`Withdrawal immediately returns 410 at ${path}${headers.RSC ? ' RSC':''}`, r.response.status === 410 && !r.text.includes('READ_THROUGH_UPDATE') && !r.text.includes('PUBLISHED_BODY_STORED_NOT_RENDERED_LATEST'));
  }
  const withdrawnAlias = await request('/book/2026-11-01');
  check('The old date stops redirecting immediately after withdrawal',
    withdrawnAlias.response.status === 404 && !withdrawnAlias.response.headers.has('location')
    && withdrawnAlias.text === nonexistentLegacy.text);
  const advanced = await request('/'); const nextPage = await list('?limit=1&cursor=' + encodeURIComponent(beforeWithdraw.nextCursor));
  check('Home advances and existing cursor still works after boundary-row withdrawal', advanced.text.includes('data-issue-id="published-middle"') && nextPage.items[0].id === 'published-middle');
  localSQL("UPDATE issues SET status='withdrawn' WHERE status='published'");
  const empty = await list(); const emptyHTML = await request('/');
  check('Empty published library returns items=[] and nextCursor=null', empty.items.length === 0 && empty.nextCursor === null);
  check('Empty home is truthful and does not choose a draft/withdrawn fallback', emptyHTML.text.includes('暂无已发布刊期。') && !emptyHTML.text.includes('READ_THROUGH_UPDATE') && !emptyHTML.text.includes('data-issue-id='));
  result.status = 'passed'; result.publicFixtureCount = 28;
  result.listSHA256 = createHash('sha256').update(JSON.stringify(all)).digest('hex');
  result.ssrSHA256 = createHash('sha256').update(html.text).digest('hex');
} catch (error) {
  result.status = 'failed'; result.error = error.stack; process.exitCode = 1;
} finally {
  if (server && server.exitCode === null) {
    const exited = once(server,'exit'); process.kill(-server.pid,'SIGTERM');
    if (!(await Promise.race([exited.then(() => true),wait(5000,undefined,{ref:false}).then(() => false)]))) {
      try { process.kill(-server.pid,'SIGKILL'); } catch { /* already exited */ }
    }
  }
  // Restore only our synthetic fixtures; this helper cannot target a real/remote database.
  try { localSQL(seed); } catch (error) { result.restoreError = String(error.message); result.status = 'failed'; process.exitCode = 1; }
  result.finishedAt = new Date().toISOString();
  check('Synthetic local secret is not written to server logs', !logs.includes(runtimeSecret));
  writeFileSync(new URL(`${mode}-result.json`,dir),JSON.stringify(result,null,2));
  writeFileSync(new URL(`${mode}-server.log`,dir),logs);
  process.stdout.write(JSON.stringify(result,null,2) + '\n');
  if (result.status !== 'passed') process.stderr.write(logs);
}
