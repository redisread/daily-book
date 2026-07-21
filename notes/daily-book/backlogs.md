# daily-book Backlogs

> P0 全套（P0-0..P0-4）已于 2026-07-21 上线（PR #75/#76/#77/#78/#79）。
> 以下条目为 P0 CR 过程中标注为**非阻塞、挂 P1/P2 backlog** 的 followup，避免每次 CR 重复枚举。
>
> 优先级说明：
> - **P1**：显性问题或明显更好的实现方式，值得下轮迭代解决
> - **P2**：架构/优化性质，等实际信号（数据量、用户反馈）触发才动
> - 每条挂**来源**（PR/CR 讨论 msgId）便于回溯

---

## P1（下轮迭代候选）

### B1. `window.__DAILY_BOOK__` namespace 收敛
- **来源**：Martin CR PR #78 NIT N2 (msg=d28d286f) + PR #79 NIT N1
- **问题**：当前有两个 root-level global：`window.__DAILY_BOOK_META__` (P0-2) + `window.__quotesRegistry` (P0-3)。分散 global 面污染，未来加 `notes` / `highlights` 会继续膨胀
- **方案**：refactor 到 `window.__DAILY_BOOK__ = { meta, quotes, ... }` 单 namespace
- **消费方影响**：`library.astro` (读 meta)、`quote-swipe.ts` (读 quotes)、`QuoteCard.astro` (写 quotes) 全部改 3 处 → 2 files 各改一行
- **工作量**：XS 30 分钟

### B2. `escapeHtml` 补 `'` 转义（defensive）
- **来源**：Martin CR PR #78 NIT N1 (msg=d28d286f)
- **问题**：`escapeHtml` 当前仅覆盖 `&/</>/"`，不覆盖 `'`。当前所有 HTML 属性用 `"..."` 包裹，无 XSS 攻击面；但若未来某处切到 `'...'` 属性风格，`'` 未 escape 会打破属性
- **方案**：加一行 `.replace(/'/g, "&#39;")`
- **工作量**：XS 2 分钟

### B3. P0-1 期号漂移 + P0-3 quote 漂移 CI 检测
- **来源**：Steven msg=33270c91 M3 修补 + P0-1 spec §3.3 v1.1
- **问题**：`books.yaml` 新增一本 `publishedDate` 早于历史 → 其后所有书期号 +1；quotes 数组顺序变化 → quoteId 漂移
- **方案**：build 时对比上一次索引快照（`.cache/issue-index.json` + `.cache/quote-index.json`），出现「已存在书期号变化」或「已存在 quote 顺序变化」→ CI warn（非 block）
- **snapshot 5 字段策略**已经守住 P0-3 运行时数据（用户金句本不会因为漂移丢原文），CI 只是给 spec 作者早期信号
- **工作量**：S 3-5 小时

### B4. `books.ts` HMR 懒计算
- **来源**：Martin CR PR #76 NIT N1 (msg=8ef5fe2f)
- **问题**：`buildIssueNumberIndex(books)` 在 `src/data/books.ts` 模块 top-level 立即执行，dev-mode 每次 HMR 都会重跑。当前 98 本 <1ms 无感
- **方案**：改为 lazy `let _index: IssueNumberIndex | null = null; export function getIssueNumberIndex() { return _index ??= buildIssueNumberIndex(books); }` — 按需初始化 + 支持 HMR 后失效
- **触发点**：书量 > 500 时（当前 98 本无感）
- **工作量**：XS 15 分钟

### B5. 书封分享图水印
- **来源**：P0-4 spec §5.2 v1.1
- **问题**：当前书封分享用 native `navigator.share`（`quote-swipe.ts:106-131`），不生成图片，故无水印落点。金句分享图有品牌行「daily-book · 第 XXX 期」，书封分享缺失
- **方案**：独立 spec，若需要引入书封 canvas 生成或 Satori @vercel/og 服务端渲染
- **工作量**：M 2-3 天，独立 spec 立项

### B6. i18n 三语基础设施
- **来源**：P0-1/2/3/4 v1.1 头部一致「去 i18n」决策 (msg=b22aa180 → v1.1 全体)
- **问题**：当前所有 UI 文案（页面标题、tab、卡片状态、toast、空态、导航入口）中文硬编码。zh/en/ja 三语支持需引入 i18n 基础设施
- **方案**：Astro i18n 官方模式 (`astro:i18n`) + 各页面 lang param + `t()` helper
- **触发点**：用户量出海需求 or Victor 主动立项
- **工作量**：L 3-5 天，独立 spec 立项
- **迁移量**：预计 40+ 文案键值 × 2 语言

### B10. `/my/quotes` 空态副标题计数确认 ✅ 已确认无需修
- **来源**：Steven UX 验收 (msg=b98ffe4f) 观察项
- **问题**：`/my/quotes` 空态显示「你收藏的字句」但无「· 共 {n} 条」计数
- **确认结果（Jeff）**：`quotes.astro:54-56` 非空态 = `你收藏的字句 · 共 ${total} 条` ✅ 正确带计数；空态 = `你收藏的字句`（total=0 省略计数，刻意，「共 0 条」无意义）
- **结论**：功能符合预期，无需修改。空态省计数是合理设计（0 条不显示计数）

---

## P2（等实际信号）

### B7. 云端同步（跨设备 localStorage）
- **来源**：P0-2/3 spec §2 「不做云端同步 — 换设备丢数据是 MVP 已知代价」
- **触发**：用户反馈换设备丢失或大量注册需求
- **方案候选**：Cloudflare Workers KV + 匿名 ID（cookie）或 device fingerprint；OR 引入完整用户系统
- **工作量**：L 1 周+

### B8. `/my` 聚合首页
- **来源**：P0-3 spec §6.2
- **问题**：`/my/library` + `/my/quotes` 两独立入口，未来加更多 my/* 页时导航会散
- **方案**：`/my/index.astro` 展示「书架 42 期 · 金句本 87 条」两个卡片入口
- **触发**：`/my/*` 子页 ≥ 3 个时
- **工作量**：S 半天

### B9. 3 个月 storage cleanup PR
- **来源**：P0-0 spec §2.2
- **计划**：3 个月后（2026-10-21 附近）起 cleanup PR：写 `daily-book:migrated-v2` flag + 删旧 key (`dailybook_read` / `dailybook_collections`) + 删迁移逻辑 (`storage-migration.ts`)
- **前置**：确认 GA/日志显示所有活跃用户已过一次 P0-0 migration
- **工作量**：XS 30 分钟（纯删代码）

---

## 已完成（历史归档）

| 编号 | 描述 | 完成 PR | 完成时间 |
|---|---|---|---|
| P0-0 | storage 迁移 + 事件基础层 | #75 | 2026-07-21 |
| P0-1 | 期号系统（build-time 派生） | #76 | 2026-07-21 |
| P0-2 | 我的书架 `/my/library` | #78 | 2026-07-21 |
| P0-3 | 我的金句本 `/my/quotes` | #79 | 2026-07-21 |
| P0-4 | 分享图水印「daily-book · 第 XXX 期」 | #77 | 2026-07-21 |

---

_最近更新：2026-07-21 Steven/Wen 双线验收全绿（27/27 PASS）后，Steven append B10 UX 观察项_
