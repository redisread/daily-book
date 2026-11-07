# Integrated public reader (task67)

Current branch integrates reviewed search0ad49ec87c9d3862f491d99926a01b71d6909e28
and RSS8c61867afb8e6e6946c90a317d5e444c42337471 on their common1b12b79 baseline.
Only merge/config/test evidence changes are made. No schema/FTS/import-pin,
management write, production import, push or deployment is authorized.
The historical branch-specific sections below preserve their original scopes;
the CURRENT branch includes both search and RSS, with the original interfaces.

# Integrated local reader (task61)

This branch integrates the independently accepted public theme530b6cb,
management read-only7241921 and historical rehearsal9ac82f7 on the commonde8d
read-consistency baseline. All remain local-only; no schema/historical-source
change, deployment, management write, search or RSS implementation is implied.
The historical baseline sections below record their original scopes; the
implemented archive extension on this integrated branch is documented last.
The phase1 integration baseline ran480 + management243 + theme131 =854 unique
explicit checks (build-isolation results counted once), before archive changes. For the original-page visual
comparison set BOOK_THEME_BASELINE to your own clean fixed8b checkout as below.

# Daily Book Reader：正式模型与公开读取切片

本包是正式 vinext 应用骨架，**不是阶段1 probe 的延续接口，也不是生产切换**。父 Astro 应用、原内容与生产配置保留不变；本次仅本地 D1 schema、共享读取服务、公开 API 与最小 SSR。完整主题、搜索、管理写接口、历史导入和部署均不在范围。

## 本地复现

使用当前 cf 支持的 Node `^22.23.0 || ^24.22.0 || ^26.12.0`（本次26.13.0/npm11.17.0，macOS x64）：

```sh
cd apps/reader
npm ci --ignore-scripts
npm run verify
```

`verify` 先保留原26项schema约束及开发态/构建态各90项HTTP验证，再执行两种运行态的受控竞态与构建隔离检查。验证最后重新生成普通构建，避免遗留测试入口作为默认产物。所有测试进程自动停止，fixture可重复使用。脚本依赖POSIX的ps/进程组；Windows未覆盖。

- `npm run dev`：本地开发；手动查看时不要与验证脚本并行占用端口。
- `npm run start`：预览已构建Worker。
- `npm run db:local`、`npm run seed:local`：仅初始化包内**虚构测试库**，不是历史数据导入工具。
- `node scripts/verify-schema.mjs`：真实D1约束测试。
- `node scripts/verify-runtime.mjs dev` / `built`：分别使用127.0.0.1:49049/49050，不抢占已有服务。

普通验证仅通过固定虚构D1 UUID `00000000-0000-4000-8000-000000000049`、显式 `--local --persist-to .cloudflare/state` 操作数据。竞态专用模式 `reader-race-test` 使用另一虚构UUID `00000000-0000-4000-8000-000000000053` 和 `.cloudflare/race-state`，端口49353/49354，不操作普通fixture库。配置禁止远程绑定和隧道；无account/domain/secret/deploy脚本，不要部署本配置。旧根目录wrangler配置不是本包入口。

- `npm run verify:baseline`：原206项基线及构建。
- `npm run verify:races`：开发态竞态、测试模式构建/隔离检查、构建态竞态，最后恢复普通构建并确认测试控制代码未进入其中。
- `node scripts/verify-races.mjs dev` / `built`：只访问固定本地地址及虚构53库；built前先执行 `npm run build -- --mode reader-race-test`。

## 正式模型

`migrations/0001_initial.sql` 是本切片唯一schema来源：

- Book独立保存基础资料与数值year/pages/rating；缺项可用NULL/空值表示，以支持不完整草稿。排版封面保留coverTitle/coverAuthor，可选coverUrl/alt。
- Issue引用Book，独立editorNote/body/status/publicationDate/issueNumber/version。历史editorNote允许NULL，不为新发布门槛补造内容。
- Quote属于Issue，稳定ID、原文、sourceLabel与position（0起）；同一期position唯一。
- pub/withdrawn必须同时有合法日期和正整数期号；draft两者均NULL。日期与期号**全状态唯一**，撤回不释放；首次分配后不可改，恢复复用。
- 实体ID稳定；Book/Issue ID为1–128、Quote为1–160个URL安全ASCII字符（首字符字母/数字，其余字母/数字/`_`/`-`），schema与公开读取校验一致。FK防止悬空与被引用Book删除。
- 时间戳UTC；本切片不做首次发布的Asia/Shanghai当日分配、If-Match、幂等/审计/限流或管理接口，这些仍需后续写入任务。

共享逻辑在 `src/domain/`，API与SSR都直接使用D1，不向自身HTTP转发。详情SQL的CASE仅为published生成公开JSON；草稿/撤回只返回可见性，不返回正文、Book或Quote数据。Book是共享资料，**未来编辑Book会影响引用它的所有刊期**，并不是每期复制一份。

## 当前接口

### GET /api/v1/issues

- `{items: PublicIssue[], nextCursor: string|null}`，类型见 `src/domain/types.ts`。
- limit默认20，范围1–100；非整数、超范围、重复参数及未知参数400，不静默截断。不接受status或搜索参数。
- `publicationDate DESC, id DESC`键集分页，游标含两个排序键与v1；不使用offset。末页nextCursor为null。
- 游标是有界、不透明的base64url数据（最长1024字符），严格检查结构/版本/日期/ID；它表示排序边界，不要求边界行仍处于published。因此撤回边界行后仍可继续分页。

### GET /api/v1/issues/:id

- published：200，`{data: PublicIssue}`，包括其Book与按position排序的Quotes。
- draft与不存在：404，统一错误；withdrawn：410，仅撤回说明，不能返回原正文/书籍/书摘。
- 错误：`{error:{code,message},requestId}`，同时设置X-Request-ID；读取故障503，不向外返回SQL/绑定或异常细节。

### 最小 SSR

- `/`仅选最新published；无published显示真实空态，不随机选草稿/旧内容。
- `/issues/:id`提供最小标题、作者、简介、编辑话与书摘；Issue.body仍存储/可在公开详情API读取，但不新增页面正文展示功能。
- `proxy.ts`在流式HTML/RSC开始前应用可见性规则，直接产生404/410；不是只在200页面写提示。门禁与页面读取同一个请求内结果，不各自查询状态。
- 内容响应统一 `no-store`，无ISR/跨请求内容缓存。RSC请求按vinext的`_rsc`协议；缺少/错误缓存键可能先得到框架307规范化，测试记录仅同资源的规范化跳转，并严格检查规范化后的真实状态和所有响应体。

不实现公开写方法；阶段1probe、hello接口、旧日期路由和books.json均不带入。

## 验证与局限

fixture包含28个published（可测默认20与分页）、仅草稿/仅撤回引用的Book及私密内容哨兵、跨刊共享Book、不同期号/日期排序和乱序插入Quotes。开发态/构建态均验证分页、非法输入、完整详情映射、SSR/RSC真实状态/隐私、无写API、原始body不新增展示、D1变更后无重建刷新、撤回即时生效及空态。schema测试覆盖唯一性、不可变身份、FK、草稿空值、恢复与无效值。

### 请求内一致性

`worker.ts`只包裹公开的vinext入口，保留框架执行上下文与instrumentation；绑定仍通过原生 `cloudflare:workers` 访问。每次fetch建立独立的原生AsyncLocalStorage上下文，`readIssueOnce`在其中保存该刊期的单个Promise。没有模块级内容Map、跨请求缓存或客户端可指定的上下文标识。

线性化点是该请求首次单条详情SQL所取得的快照：状态和完整公开Book/Issue/Quote投影在同一语句中决定。proxy依据它返回状态，页面使用同一结果渲染；页面的防御检查不再触发第二次数据库读取。闭态结果不含私密字段，调用链若失去上下文会失败关闭，不悄悄退回二次读取。这是目标刊期响应的一致性，不宣称不同资源、不同SQL或整库共享一个长事务。

撤回前已读到的公开快照允许完成200响应；已读到撤回快照的请求即使随后恢复也完成410。并发的独立请求及之后的新请求读取新状态。不能追回已读取/已发送的历史公开字节，且本实现不会跨请求复用它们。

`fixtures/race-worker.ts`仅由显式测试构建模式选择。服务端observer在门禁读取完成、页面渲染之前领取并等待本地D1 barrier；协调脚本更新状态和字段、先发另一独立请求，再释放原请求。不用时序猜测或客户端延迟头，也不增加HTTP控制接口。每种运行态覆盖HTML/RSC的撤回与恢复，检查真实状态、传输类型、六类展示字段同一快照、私密哨兵缺席、伪造头无效与请求间隔离。RSC先规范化到最终传输URL再开启barrier，JSON API另用正常JSON请求，不混用RSC头。成功RSC响应实测为`text/x-component`；这个固定框架版本的proxy提前终止响应保留HTML错误体和真实410，不将它误当作成功Flight响应，也不擅自改原错误协议。

默认生产模式产物另检查：只引用虚构49库、服务端没有barrier SQL/超时控制代码，客户端产物在两种模式中都没有测试控制代码。此处“生产模式”仅指本地构建，不代表已部署或可正式切换。

本切片仍无公开写接口，**未来幂等/审计、管理写入与读写整合尚未验收**。受控读取竞态通过不等于全部业务并发或生产就绪；正式切换仍需后续完整交付和明确授权。

直接依赖沿用已验证的精确版本：vinext1.4.4、React/DOM/RSC19.3.1、Vite8.3.6、Cloudflare Vite plugin2.0.0-beta.v.12、cf1.0.0-beta.28。官方工具链仍是beta；上游fflate依赖链的5个moderate告警、sourcemap/dynamic-import构建警告仍需上线前复核，本应用未接入不受信任ZIP/OG处理。未验证完整主题、父Astro CI或任何线上环境。

## Protected read-only management (task57)

The management surface is **read-only**. It does not implement writes, publication,
conditional writes, a management UI, cloud provisioning or deployment. The frozen
schema and historical mapping/import tool are unchanged.

- `GET /api/v1/admin/issues`: `{items,nextCursor}`, default20 / max100.
  Optional single `status=draft|published|withdrawn`; omission includes all states.
  Order is publication date DESC (NULL last), then ID DESC. Bounded versioned
  base64url cursors carry a distinct `admin-issues` scope and the exact requested
  status filter (NULL means no filter); changing/omitting that filter rejects reuse.
  Cursor boundaries work across the non-NULL/NULL transition without offsets.
- `GET /api/v1/admin/issues/:id`: `{data:issue}` with current Book and all ordered
  quotes, including draft/withdrawn body and nullable historical fields.
- `GET /api/v1/admin/books/:id`: `{data:book}`, including unreferenced Books.
- Unknown/duplicate list parameters, malformed/noncanonical/overlong cursors and
  any detail query parameter are400. Unknown/invalid detail IDs are404.
- Error envelope remains `{error:{code,message},requestId}` with matching
  `X-Request-ID`. All management responses, including framework404/405 and HEAD,
  are `Cache-Control: no-store` and `Vary: Authorization`.

Only `Authorization: Bearer …` is accepted. `CONTENT_API_KEY` is declared with
`bindings.secret()` and read only from the Worker binding, not client variables,
query parameters, cookies or visibility/state headers. No fallback/default key is
provided; provided Bearer tokens are bounded to4096 characters. Missing configuration returns503; absent, malformed and wrong credentials
return the same generic401 error before any database read. Comparisons hash both
values to fixed-size SHA256 then use the existing `nodejs_compat` timing-safe
comparison API. No key value or request headers are logged/reflected. The Worker
rejects non-GET/HEAD management requests after authentication, without executing
framework handlers or a database write. The old probe remains absent.

Book detail emits a quoted strong `"b:<safe-id>:<version>"` ETag. Issue detail emits
`"i:<base64url(JSON([issueId,issueVersion,bookId,bookVersion]))>"`, so changing a shared
Book version changes every referencing Issue tag even when its own version is
unchanged. IDs/tuple encoding cannot inject header syntax. Unsafe version integers
fail closed rather than produce colliding tags. Quote-set edits belong to the
owning Issue version; future authorized mutation code must increment that version,
and Book edits must increment the Book version. This phase emits tags only and
neither validates write preconditions nor strips/pretends to strengthen `W/` tags.
Tests use identity transport to inspect the server's actual strong validator.

Management SQL never populates the public request-read cache. Public CASE/WHERE
visibility remains in SQL; sharing the SQL JSON projection does not share a
private row or change a public response. Even a valid management Bearer leaves
public draft404/withdrawn410 and published-only lists unchanged, including RSC.

### Native verification

`npm run verify` keeps the original480 checks and adds `verify:admin` in both dev
and built native workerd. `reader-admin-test` uses only fictitious dummy57 and
`.cloudflare/admin-state`; normal/race dummy49/53 and history dummy54 are separate.
Only synthetic fixtures are seeded; no historic content is imported by this test.
The helper has no remote/config/target override. Test-secret files are fresh,
mode-specific, permission0600, refused if already present, and removed only when
created by this run. It never reads/requests a production secret.

`node scripts/verify-admin.mjs dev|built` verifies missing-secret503 first, then
creates a random local Worker secret for positive/negative authentication, cursor
filter/scope/null ordering, all states/nullable fields, safe composite strong tags,
shared Book/quote-version changes, HEAD/method refusal, unchanged D1 after rejected
methods, public/admin isolation (including RSC and concurrent reads), and no value
in captured logs. The built test rebuilds with the secret actually configured and
scans every generated server/client/config file for the value. Reports contain no
key; any unexpected diagnostic occurrence is redacted and makes verification fail.
Default build is restored after the suite. Native process evidence and JSON results
are under `.cloudflare/evidence/admin-*-result.json`.

## Original-theme migration (task58, independent branch)

This branch starts at accepted `de8d061`, independently of the management API
branch. It migrates only `/` and `/issues/:id`, using direct D1 services and the
existing request-local snapshot. Metadata shares the same read result; there is
no self-HTTP request or cross-request content cache. It does not integrate admin
APIs, archive/search/RSS, old date URLs, shelves, favorites or write behavior.

`app/original-theme.css` is a byte-identical copy of fixed historical source
`8b991098f984a5f8870bd01741e3cb937b63d50d:public/styles/neo-brutalism.css`.
The three font packages/versions and five self-hosted Latin faces match that
source. Their OFL licenses accompany this source in `licenses/`. Existing CJK
fallbacks, palette, hard borders/shadows, book cover and quote layout are retained.
`globals.css` adds only content reflow, native-dialog and keyboard/snap styling;
normal desktop/375px palette, font families/title sizes and cover dimensions are
compared against the actual original Astro page in Chrome.

Only implemented home/detail links are exposed. Old archive/search/RSS/history
sections and unimplemented sharing/image actions are not presented as clickable
placeholders. The homepage displays the latest published Issue, including an
implemented Issue permalink, or its truthful empty state. Detail displays all
ordered quotes and existing notes; a missing/blank note is omitted without filler.
Numbers/cover line breaks and full descriptions remain as stored. No raw body is
rendered or passed across a component boundary: React Flight development diagnostics
can serialize Server Component props too, so `displayIssue` constructs a display-only
DTO before that boundary. Public404/410 privacy and the single-read race tests remain.

The cover uses a native modal dialog with a bounded keyboard focus cycle, Escape,
backdrop close and trigger focus restoration. All quotes exist in one ordered DOM:
desktop stacked cards, narrow-screen native horizontal scroll-snap with touch,
Arrow/Home/End and truthful previous/next controls; no duplicate hidden quote lists.
Content remains server-rendered if JS is disabled; enhancement controls do not
pretend to work before hydration. Reduced motion is respected. Long content and
200% text-only scaling grow rather than truncate fixed-height covers/cards.

### Visual/browser reproduction

The independent `reader-theme-test` mode uses fictitious dummy58 with only
`.cloudflare/theme-state`; baseline49/race53 remain separate. One reference fixture
copies only displayed fields from the published129th old source record to compare
like-for-like. Synthetic IDs/body and additional clearly labeled stress/private
fixtures are test-only, not a historical import. Original Markdown and schema are
unchanged. See `fixtures/theme-reference-provenance.json` for source path/hash.

For full original-vs-new comparison, prepare your own clean detached checkout at
fixed8b and install its existing locked dependencies. Do not use a moving/shared
checkout as the source of truth. The helper checks its Git head and src/public
cleanliness before starting the original Astro local server. It only hides the
Astro development toolbar for screenshots, not original product content/styles.

```sh
# This directory: install the locked Reader dependencies.
npm ci --ignore-scripts
# A separate clean8b checkout: npm ci --ignore-scripts
export BOOK_THEME_BASELINE=/absolute/path/to/your/clean-fixed8b-checkout
npm run verify
```

This preserves the original480 checks, then runs actual installed Google Chrome
with native workerd in development and built modes. It compares desktop1280px and
375px home/detail screenshots and computed design properties; checks all quotes,
permalink/return/skip links, dialog focus/escape, long strings, missing fields,
12/1/0 quote cases, 320px, exact200% computed text scaling (not a viewport-only zoom
simulation), no document horizontal overflow or text clipping, real Chrome touch
swipe, public404/410, empty latest-published state, inert script-looking text and
built JS-disabled SSR. Font loading is awaited; no remote font service is used.

Without `BOOK_THEME_BASELINE`, the updated-app checks can run, but the result
explicitly records the original comparison as **not run**; it is not acceptance
coverage for that comparison. Reports/screenshots are written under
`.cloudflare/evidence/theme/`; only self-owned child process groups are stopped,
synthetic dummy58 is restored, and the default build is restored by the suite.
No database, credentials or environment files belong in a source/review package.

## Archive extension (task61 phase2)

`/archive` is a public, read-only SSR page. Its only business query key is
`cursor`; page size is always20, ordering is publication date DESC then ID DESC,
and it directly uses the existing public D1 list service. The single bounded
framework transport key `_rsc` is reserved (≤128 URL-safe characters); it never
selects status, authentication, data scope or a cache. Every other key, repeated
key or malformed cursor returns real400 before framework normalization or
streaming, not a silent redirect or a200 error page. The Worker validates the
original URL because vinext consumes `_rsc` before proxy/page code. All archive
responses, including status errors and protocol normalization, are no-store.

Month groups and cards reuse the fixed8b theme. Each real issue link displays
its stored number/date/title/author, not an inferred continuous number. The
card data contains only these display fields, never body/notes/quotes. Long
text wraps rather than using the old title ellipsis. The header/mobile nav now
link only to implemented Home and Archive; current navigation also renders on
the server. Native next links work without JS; a null nextCursor omits the link.
Previous navigation uses browser history, not offset/page-number synthesis.
Valid empty pages and empty archives say so without private fallback data.

`npm run verify` now runs the original854 unique checks plus146 archive checks
(72dev +73built +1default fixture-isolation). It restores the normal build.
`npm run verify:archive` runs just the archive suite, using fixed fictitious61
and `.cloudflare/archive-state`,49761/49762. It creates a fresh exclusive0600
mode-specific test secret and removes only that owned file; never overwrite an
existing one. It seeds/resets only its own test database, terminates only its
owned process group, and captures actual Chrome/workerd evidence. Cases cover
44rows over3pages, no-JS paging/back, bad/duplicate/unknown queries, HTML/Flight,
HEAD/status/no-store, stored identity, shared private management separation,
no business writes, boundary withdrawal, empty states, long text at320/375/1280
and exact computed200% text sizing. Built output is scanned against the actual
temporary key. Root unit tests include17 new pure input-boundary cases.

These are local tests, not production resources, deployment or import approval.
Search, RSS and management writes remain unimplemented.

## Public search slice (task63, independent from RSS)

This branch starts at reviewed1b12b79. `GET /search` is the original-theme SSR
GET form; `GET /api/v1/search?q=&cursor=&limit=` shares its native D1 service.
Only published Book title/author/category/description and Issue editor_note
are searched. Body and quotes are neither searched nor projected; private
rows are excluded outside the entire OR expression. Output is exactly
`{items:[{id,date,number,title,author}],nextCursor}` (number is the stored issue
number), never a full Issue or Book. No self-HTTP, content cache, FTS, schema
or historical importer/pin change is introduced.

Query contract:
- q is trimmed, then1–100 Unicode codepoints (not UTF16 code units/graphemes).
  Missing q on the page gives an input prompt with no catalogue read; explicitly
  empty/whitespace q is400 on both page/API. Missing API q is400.
- Matching is literal substring via SQLite instr(lower(field),boundQuery).
  `%` and `_` are literal, not wildcards. Only ASCII A–Z case is folded to a–z,
  matching SQLite's default lower(); non-ASCII is exact codepoints. No NFC,
  Unicode case folding, word segmentation, tokenization or relevance ranking
  is promised. Trim+ASCII fold is the cursor's canonical q; echo preserves
  the trimmed input's original case. Equivalent ASCII case/trim may reuse a
  cursor, a different normalized query may not.
- date DESC,id DESC keyset paging,20default/100max. Cursor is canonical base64url
  of a versioned public-search scope/q/date/id object, bound to normalized q;
  bounded2048 bytes on wire, exact keys, valid calendar date/ID/UTF8 required.
  Plain public/admin cursors cannot be reused. Altering limit does not change
  the query's scope. No offset/page synthesis; null cursor means no next link.
- Unknown/repeated/malformed parameters return actual400 before framework
  normalization or streaming. Only the page reserves one URL-safe _rsc≤128;
  the JSON API does not accept that parameter. Raw Worker validation keeps
  framework consumption from hiding duplicates. HTML/RSC/JSON and errors,
  HEAD/framework405/normalization responses are no-store. Auth/state headers
  cannot increase visibility. Error copy is fixed and never echoes input.

The SSR form and ordinary next links work with JS disabled; query echo and
result strings use React text/attribute escaping, not innerHTML. HTML maxlength
is deliberately omitted: browsers count UTF16 units, which would incorrectly
reject100 astral codepoints. Server validation remains authoritative. The
page only renders the five selected summary fields. A user-supplied query can
be echoed even when its text resembles a private marker; that is not a private
DB projection. API JSON never echoes q and excluded-field searches return0.

Original8b search form/grid/card tokens are retained without fake category
filter controls or legacy whole-library JSON/client filtering. Navigation adds
only the implemented search. Mobile labels are compact with full accessible
names so three destinations reflow at200% text. Long cards and query labels
wrap; native editable search input text can scroll normally within the control.
RSS is not mixed into this independent branch.

`npm run verify:search` first builds to generate SDK types on a fresh checkout,
runs real dev/built workerd+Chrome checks in fictitious63/search-state on
49863/49864, then restores fixtures and the normal49 build. Only owned0600
exclusive test key files/process groups are created/removed; no production key
or remote D1 use. Cases include five fields, Chinese/ASCII/Unicode/NFC variants,
100 astral characters, SQL/HTML delimiters, actual400/cursor scope,43 matches
across3pages without gaps/repeats, HTML/Flight/JSON public isolation, read-only
fingerprints, withdrawal at boundary, no-JS GET/paging/history, real Tab/Enter,
320/375/1280 long text and exact200% computed fonts. Built outputs are scanned
against the actual temporary key; normal artifacts exclude test63 fixtures.
The full verify retains existing1000 checks; search has102dev+103built+1default
checks (206) in addition. Root tests add32 pure input-boundary cases.

No deployment, production migration, management write or RSS integration is
implied. RSS8c61867 remains a separately reviewed branch until further direction.

## RSS slice (task64, independent from search)

This branch starts at reviewed1b12b79 and adds only `GET/HEAD /rss.xml`,
server-rendered alternate discovery and a real footer subscription link. It
has no search dependency, schema/FTS/import-pin change, write API or deployment.
The Worker dispatches this fixed resource before framework negotiation so it
always serves RSS, even with stray Flight/state headers; no query is accepted,
HEAD has no body, other methods405/Allow GET,HEAD. Errors are the existing
structured JSON/no-store form; success is UTF8 application/rss+xml/no-store.

D1 is the sole item source, one SELECT of the latest20 published rows ordered
publication_date DESC,id DESC. Only id/date/title/author/book description is
projected; body/editor note/quotes/private rows are not selected. Titles and
XML-safe descriptions remain plain text. XML1.0-invalid control characters
are replaced with U+FFFD, never emitted as invalid numeric entities. Empty
feeds remain RSS2.0. All GUIDs are canonical issue permalinks, independent of
rank/title, unchanged across withdrawal/restoration and shared Book edits.

Canonical origin is the explicit `site` in fixed8b astro.config.mjs:
https://daily-book.jiahongw.com. It is recorded in src/site.ts, never derived
from request Host/Forwarded/X-Forwarded-* headers. Dates are calendar dates
serialized as00:00:00 +0800 with the corresponding weekday (Beijing), not
claimed exact publishing times; the channel description states this precision.

`npm run verify:rss` builds first to generate SDK binding types on a fresh
checkout, then runs34dev/34built native checks and1default fixture-isolation
check, finally restoring the normal49 build. It uses fixed fictitious64 and
.cloudflare/rss-state,49964/49965; no
remote configuration or production key. It seeds/restores only its owned
fixtures and terminates only its owned process group. Actual RSS-specific and
strict XML parsers validate live Worker output; cases include delimiters,
invalid XML controls, Unicode, latest20 ordering/precision, forged Host and
state headers, HEAD/405/400, read-only fingerprints, GUID restoration and empty
feeds. Actual JS-disabled Chrome checks alternate/footer accessibility.
The full verify command preserves all existing1000 checks plus69 RSS checks.
Root tests add9 pure formatter/date cases; rss-parser3.13.0 is dev-only.

## Final local read-only integration (task67)

Merge parents are exactly reviewed0ad49ec search and8c61867 RSS. Common parent
is1b12b79. Seven conflicts were resolved explicitly: README keeps both historical
contracts under the current overview; globals keeps search wrapping plus RSS
footer hit targets; CF/Vite keeps every fixed49/53/57/58/61/63/64 local mode and
state; package keeps both scripts and RSS parser dev dependency/lock; Worker
keeps raw search/archive validation and no-store wrapping plus RSS fixed-resource
dispatch before framework negotiation; theme validation allows only actual
Home/Archive/Search/RSS/Issue links. Search navigation and RSS head/footer both
survive; no endpoint, matching, cursor, XML/date/canonical or schema contract is
changed. No feature, write, deploy, push, historical source or importer pin change.

The full verify runs original1000 +search206 +RSS69 =1275 retained checks, plus
2 final normal-build inspections (1277 total). Repeated default-build recovery
assertions are counted once. Root unit tests are139 (98+32+9); the existing local
historical rehearsal verifier separately exercises29 native D1 recovery cases.
Final normal production-build mode remains explicitly local fake49, not a
production binding/deployment. It is scanned across Worker/client/config output
for all six runtime test modes, the isolated54 history receipt and fixture markers, and the configured key must remain
only a valueless secret declaration; original actual-value key artifact/log scans
in admin/archive/search modes are retained unmodified.

Current integrated desktop/mobile Home and Issue screenshots come from the
theme suite, Archive from its suite, and ordinary43-match Search screenshots
are added to the search suite (besides existing stress images). This is evidence
capture only; screenshot helpers do not add product behavior. All tests remain
owned, local-only and restore their fixtures/key files/process groups/default
build. Independent historical reports retain their fixed Artifact versions.
