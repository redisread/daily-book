# daily-book P0-1：期号系统 spec v1.1

> **v1.1 变更**（2026-07-21 Martin CR pass 后修补）：
> - §6 三语 i18n 章节**整段移除**，v1.1 只做中文（daily-book 目前无 i18n 基础设施，`astro.config.mjs` 无 i18n 配置）→ 三语基础独立立 P1 backlog
> - §9 T1 CI 漂移检测**移除**（挂 P1 backlog，等真出现漂移案例再补）
> - §4.4 HistoryGrid 徽章样式改为 **CSS var 版本**（daily-book 用 vanilla CSS，非 Tailwind），Tailwind 变体作 fallback 注解
> - §3.4 formatIssueNumber 精简 signature（去 locale 参数）
> - §4.5 分享图水印文案改为「daily-book · 第 XXX 期」，其余交 P0-4

> 需求：Victor DM 2026-07-20 「印刷时代的每日刊物」产品主题下 P0 全套第 1 项
> 依据：`notes/daily-book-ux-analysis.md` §7.1 P0 #3（顾客损失 #3「无期数感」）
> 前置：P0-0 storage 迁移（无直接依赖，但 P0-1 是根基先合并）
> 设计者：@Steven
> 范围：`daily-book/src/` — data 层派生 + 视觉层渲染（中文一版）
> 交付给：Jeff（Martin CR pass 后落地）

---

## 0. 目标

**给每一本 daily-book 一个「期号」，让静态博客变刊物。**

- 从 `books.yaml` 的 `publishedDate` 按升序推导 `issueNumber`
- 首页 / 详情页 / archive / 分享图统一显示「第 XXX 期」
- 激发用户「收全套」的收集欲 + 回补往期动机

---

## 1. 顾客损失 → 设计对应

| 顾客损失 | 设计对应 | § |
|---|---|---|
| 「每天一本书，看完就散」 | 加期号，用户感受到自己在订一份刊物 | §2 |
| 「不知道自己错过了哪几本」 | archive 按期号排序 + 期号缺口可见 | §4 |
| 「归档看起来只是日期列表」 | 「过往刊号」重命名 + 目录感 | §4 |

---

## 2. 不做什么（明确边界）

- ❌ **不加 schema 字段**——issueNumber 是**运行时派生**，不进 `books.yaml`（Victor CLAUDE.md 红线：schema 变更需审批）
- ❌ **不给未发布的书（`publishedDate: null`）分配期号**（避免用户看到「第 105 期 · 待发布」）
- ❌ **不做手动指定期号**——严格按 publishedDate 升序，avoid 与 index 二源冲突
- ❌ **不做「跳期号」**（如「第 88 期 · 空白」）——期号连续
- ❌ **不给「番外/合集」单独编号**——目前没有这类内容
- ❌ **不做「订阅号 vs 增刊」分类**——所有已发布书统一编号

---

## 3. 期号派生规则

### 3.1 输入

`src/data/books.yaml` 中所有 `publishedDate: YYYY-MM-DD | null` 非 null 的书。

### 3.2 派生函数

新增 `src/utils/issue-number.ts`：

```ts
export interface IssueNumberIndex {
  bookIdToIssue: Map<string, number>;  // book.id → issueNumber
  issueToBookId: Map<number, string>;  // issueNumber → book.id
  totalIssues: number;                  // 已发布书总数
}

/**
 * 派生期号索引。所有 publishedDate 非 null 的书按 publishedDate 升序排列，
 * 第一本为「第 1 期」，第二本为「第 2 期」，以此类推。
 * 同一天多本书按 book.id 字典序（保证幂等）。
 */
export function buildIssueNumberIndex(books: Book[]): IssueNumberIndex {
  const published = books
    .filter(b => b.publishedDate != null)
    .sort((a, b) => {
      const dateCmp = a.publishedDate!.localeCompare(b.publishedDate!);
      return dateCmp !== 0 ? dateCmp : a.id.localeCompare(b.id);
    });
  const bookIdToIssue = new Map<string, number>();
  const issueToBookId = new Map<number, string>();
  published.forEach((book, index) => {
    const issueNumber = index + 1;
    bookIdToIssue.set(book.id, issueNumber);
    issueToBookId.set(issueNumber, book.id);
  });
  return { bookIdToIssue, issueToBookId, totalIssues: published.length };
}
```

### 3.3 幂等性保证

- **同一天多本**：按 `book.id` 字典序作为 tiebreaker（避免 YAML 顺序变化导致期号漂移）
- **新增一本 publishedDate 早于历史**：会**导致其后所有书的期号 +1**——这是刻意的（回填历史书是正常操作）。CI 漂移检测已挂 P1 backlog（见 v1.1 头部变更清单），v1.1 不做 CI warn。
- **新增一本 publishedDate 最新**：期号继续递增，无副作用

### 3.4 格式化函数

新增 `formatIssueNumber(n: number): string`（v1.1 精简，只做中文）：

| 场景 | 输出 |
|---|---|
| 短格式（首页 date 条 / archive 目录 / HistoryGrid 徽章） | `#105` |
| 长格式（详情页 / 分享图 / RSS） | `第 105 期` |

```ts
export function formatIssueNumber(n: number, form: 'short' | 'long' = 'long'): string {
  return form === 'short' ? `#${n}` : `第 ${n} 期`;
}
```

> v1.1 note: 移除 locale 参数（三语基础设施独立 P1 backlog）。未来 i18n 补齐时 signature 扩展为 `formatIssueNumber(n, form, locale)`, 消费方无破坏（form 默认 long, locale 默认 zh）。

---

## 4. 显示位置

### 4.1 首页（`src/pages/index.astro`）

**现状**：顶部 date 条显示「2026-07-20 · 今年第 201 天」

**改造**：改为「**第 XXX 期 · 2026-07-20 · 周六**」

```
[Neo Brutalism 硬边框]
第 105 期 · 2026-07-20 · 周六
[BookCard 今日书]
```

- 期号加粗（`font-black text-2xl`），日期常规（`font-medium text-base`）
- 期号视觉权重 > 日期（刊物特征）
- Neo Brutalism 边框风格保留

### 4.2 详情页（`src/pages/book/[date].astro`）

**现状**：书名 + 作者 + publishedDate

**改造**：书名上方加「第 XXX 期 · YYYY-MM-DD」

```
第 105 期 · 2026-07-20
━━━━━━━━━━━━━━━━━━━━━
《书名》
作者
```

- 期号横条 6px 黑色下划线（Neo Brutalism 硬装饰）
- 期号是「主刊号」，日期是「派送日」，视觉主次一致

### 4.3 archive 页（`src/pages/archive.astro`）

**现状**：按 year-month group，每组内按日期倒序

**改造**：
1. 页面标题：「往期回顾」→ **「过往刊号」** / "Past Issues" / "過去の号"
2. 每本书前显示 `#105` 短格式
3. 保留 year-month 分组（用户仍需按时间找）
4. 期号连续可见——用户看到「#87 → #88 → #89」，缺一目了然

**布局示意**：
```
过往刊号

━━━━ 2026 年 7 月 ━━━━
#107 · 2026-07-22 · 《书名》
#106 · 2026-07-21 · 《书名》
#105 · 2026-07-20 · 《书名》
...

━━━━ 2026 年 6 月 ━━━━
#88 · 2026-06-30 · 《书名》
...
```

### 4.4 首页「往期推荐」（`src/components/HistoryGrid.astro`）

**现状**：区块标题「往期推荐」

**改造**：
- 区块标题：**「过往刊号」**（与 archive 页统一命名）
- 每张卡片右上角显示 `#105`（小徽章，vanilla CSS 版）

**CSS（v1.1 新，vanilla CSS 优先，对齐 daily-book Neo Brutalism 风）**：

```css
.issue-badge {
  position: absolute;
  top: 6px;
  right: 6px;
  padding: 2px 6px;
  background: var(--fg);       /* Neo Brutalism 主前景色（黑） */
  color: var(--bg);            /* 白 */
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
  border: 1.5px solid var(--fg); /* 硬边风一致 */
  border-radius: 0;              /* 硬角 */
  box-shadow: 2px 2px 0 var(--fg); /* 可选：Neo Brutalism 硬阴影 */
}
```

> Tailwind fallback 注解（若未来引入 Tailwind）: `absolute top-1.5 right-1.5 px-1.5 py-0.5 bg-black text-white font-mono text-[11px] font-bold border-[1.5px] border-black shadow-[2px_2px_0_#000]`

### 4.5 分享图（client-side canvas 2D）

**文案**：`daily-book · 第 XXX 期`

- **视觉细节 + 落点见 P0-4 spec v1.1**（canvas 2D API, `quote-swipe.ts:144-206`, 1080×1080, `--accent #C03A00`）
- 本 spec 只声明「期号数据可用」（`getBookIssueNumber(bookId)` helper），不定分享图视觉规范

### 4.6 RSS feed（`public/rss.xml` 或动态生成）

**改造**：
- feed 标题：`daily-book RSS` → `daily-book · 每日刊物`
- 每条 item title：`《书名》` → `第 105 期 · 《书名》`

---

## 5. 边界与降级

### 5.1 期号为空的书

- **`publishedDate: null`**（未发布 / 稿件）→ 不显示期号，也不出现在 archive / RSS
- 现有代码 `getBookByDate` / `getRecentBooks` 已按 publishedDate 过滤，无需改动

### 5.2 单日多本

- 同日 2 本：期号连续（例如 `#105` 与 `#106` 都在 2026-07-20），用户理解为「一天送了 2 期」——这是刊物允许的行为
- 首页仅展示「今日主刊」（保留现有 `getTodayBook` 逻辑，取该日期第一本）；副刊在 archive 可见

### 5.3 全无已发布书（初始化空态）

- `totalIssues === 0` 时首页不显示期号横条（现有 empty state 保留）

---

## 6. 性能与实现约束

- `buildIssueNumberIndex` 在 **build 时执行一次**（Astro SSG），不做 runtime 计算
- 索引结果注入到 `Astro.locals` 或 shared util module，页面直接读
- 98 本书目前排序 + 2 map 构建 ≤ 1ms，性能可忽略
- **没有 fetch / 数据库 / KV**——纯派生

---

## 7. schema 与文件改动汇总

### 7.1 无 schema 变更（Victor 红线遵守）

`books.yaml` **不加任何字段**。issueNumber 完全派生。

### 7.2 新增文件

- `src/utils/issue-number.ts` — 派生函数 + 格式化（中文一版）

### 7.3 修改文件

- `src/pages/index.astro` — date 条改期号
- `src/pages/book/[date].astro` — 详情页期号横条
- `src/pages/archive.astro` — 页面标题 + 每本 `#N` 短格式
- `src/components/HistoryGrid.astro` — 区块标题 + 卡片右上角 `#N` 徽章（vanilla CSS）
- `src/pages/rss.xml.js`（或对应 RSS 生成器） — feed 标题 + item title 加期号
- `src/data/books.ts`（如需暴露 `getBookIssueNumber(bookId)` helper） — 供页面调用

### 7.4 不改的

- 分享图水印（`src/scripts/quote-swipe.ts` canvas API） — 归 **P0-4 分享图水印 spec v1.1**
- 「我的书架」/「我的金句本」页 — 归 P0-2 / P0-3 spec

---

## 8. 交付给 Jeff 的任务拆分建议

单人工作量小，建议合成 1 个 PR（v1.1 精简后）：

### T1（P0-1 单 PR，v1.1 精简）：期号派生 + 5 处显示

- **改动**：§8.2 + §8.3 全部文件
- **验证清单**：
  1. `buildIssueNumberIndex` 单测：3 本已发布 + 1 本 null → 返回 map 大小 3、totalIssues 3、期号 1/2/3
  2. 同日多本 tiebreaker：2 本同 publishedDate、id 字典序 `a` < `b` → id=`a` 是第 N 期、id=`b` 是第 N+1 期
  3. 首页 date 条渲染「第 XXX 期」+ 日期，无期号溢出
  4. archive 页所有已发布书按 `#N desc` 显示，year-month 分组保留
  5. HistoryGrid 卡片右上角 `#N` 徽章（vanilla CSS，硬边硬阴影）
  6. RSS feed 标题 + item title 中文正确
  7. 无未发布书（`publishedDate: null`）显示期号

**预计工作量**：**真 S 4-8 小时**
- 派生函数 + 单测：30 分钟
- 5 处显示改动：2-3 小时
- 验证 + i18n（P1 backlog 挂条）：30 分钟

> v1.1 note: 去 i18n 三语 + 删 CI 漂移检测后, 工作量守住 S. CI 漂移检测挂 P1 backlog（`notes/daily-book/backlogs.md` 追踪条目：「P0-1 期号漂移 CI 检测（build 时对比上次索引，出现「已存在书期号变化」warn）」）

---

## 9. 验收标准

QA 用例覆盖（Wen 或 Victor 自测）：
1. 首页 date 条显示「第 XXX 期 · 2026-07-20 · 周六」
2. 详情页书名上方显示「第 XXX 期 · YYYY-MM-DD」+ 6px 黑色下划线
3. archive 页标题变「过往刊号」，每本书前显示 `#N` 短格式
4. HistoryGrid 卡片右上角 `#N` 黑色小徽章
5. RSS feed 标题 + item title 包含期号（中文）
6. 未发布书（`publishedDate: null`）无期号显示
7. 同日 2 本书期号连续（如 #105 #106）
8. **回归**：首页 today book / 详情页 / archive 现有功能无破坏
9. **性能**：build 时间无显著增长（≤ 200ms 额外开销）

---

## 10. 与 P0-2/3/4 的关系

| P0 | 关系 |
|---|---|
| P0-2 我的书架 | **强依赖** — 书架卡片显示「第 XXX 期」 |
| P0-3 我的金句本 | **强依赖** — 金句卡片显示「#N 出处」 |
| P0-4 分享图水印 | **强依赖** — 分享图水印文案「daily-book · 第 XXX 期」 |

**P0-1 是根基**——必须先落地，其他 3 项才能引用 `getBookIssueNumber(bookId)` helper。

---

## 11. 一句话总结

**P0-1 用 build-time 派生的期号系统（zero schema change）把 daily-book 从「日历式书籍博客」升级为「有刊号感的订阅刊物」——期号显示在首页 date 条 / 详情页横条 / archive 目录 / HistoryGrid 徽章 / RSS feed / 分享图水印（P0-4）——是 P0 4 项的技术根基。**

---

_spec v1.1 完成（2026-07-21 Martin CR pass 修补：去 i18n / 删 CI 漂移 / CSS var 徽章），等 Martin 二次 CR 后交给 Jeff 实施 PR B。_
