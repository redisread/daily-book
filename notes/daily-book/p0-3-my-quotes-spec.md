# daily-book P0-3：我的金句本 spec v1.1

> **v1.1 变更**（2026-07-21 Martin CR pass 后修补）：
> - §3.5 helper 契约**改为消费 P0-0** `daily-book:quotes` key + `onStorageChange` 事件，不再单独定义 `subscribeQuotes`
> - §5.1 fact-check 更正：like-btn **是内存态 UI toggle**（`quote-swipe.ts:83-94`：`let liked=false` + 点击切换 innerHTML/class + toast，**未 persist**），P0-3 首次实装 localStorage 持久化 + 跨 tab 同步
> - §5.3 数据流改为「调用 P0-0 quote helper → 内部 emit `daily-book:storage:changed` → 金句本页 filter key='quotes' → refetch」
> - §7 i18n **整段移除**（daily-book v1.1 只做中文，与 P0-1/2 一致，三语基础独立立 P1 backlog）
> - §8.2/8.3 helper 位置从 `src/utils/quotes.ts` 迁到 P0-0 `src/scripts/storage.ts`（金句 API 在 P0-0 spec §4.3 已预留签名注释，P0-3 首次实装）
> - snapshot 5 字段策略保留（v1.1 不变）
> - **v1.1 二次 CR 修补**：
>   - §3.2 撤销 CI 漂移检测脚本（与 P0-1 v1.1 同步挂 P1 backlog）（M3）
>   - §8.2/§8.3 拍板 **`window.__quotesRegistry` 方案**（M8）：首屏 inline script 一次性 dump，DOM 只放 `data-quote-id`；不走 base64 data-attribute（SSG hydration 友好）

> 需求：Victor DM 2026-07-20 P0 全套第 3 项
> 依据：`notes/daily-book-ux-analysis.md` §7.1 P0 #2（顾客损失 #1「金句无归宿」——★★★★★ 最高留存价值）
> 设计者：@Steven
> 依赖：**P0-0 storage 迁移**（key + 事件基础层）+ **P0-1 期号系统**（金句卡显示「#N 出处」）
> 范围：`daily-book/src/pages/my/quotes.astro`（新增）+ `src/components/QuoteCard.astro` + `src/scripts/quote-swipe.ts`（改造 like-btn）+ 导航入口
> 交付给：Jeff（Martin CR pass 后落地，PR D，与 P0-2/P0-4 并行）

---

## 0. 目标

**让用户能收藏「一句话」——比整本书更容易记住、更有传播力。**

现状：用户看到好金句只能截图或复制，攒了几十张截图找不到。

新增：金句级 ♡ + `/my/quotes` 页——「我的金句本」，展示订阅者的摘抄本。

---

## 1. 顾客损失 → 设计对应

| 顾客损失 | 设计对应 | § |
|---|---|---|
| 「看到好金句只能截图或复制，找不到」 | 金句加 ♡ 按钮 + 「我的金句本」页 | §3 §4 |
| 「金句比整本书更容易被记住」 | 页面命名「金句本」，与「书架」并列 | §4 |
| 「传播时缺少品牌感」 | 金句卡显示「#N 出处」（依赖 P0-1） | §4.4 |

---

## 2. 不做什么（明确边界）

- ❌ **不做后端** — 纯前端 localStorage
- ❌ **不做云端同步** — 与 P0-2 保持一致的 MVP 约束
- ❌ **不做用户上传自己的金句** — 只收藏 books.yaml 已有的
- ❌ **不做金句评论 / 笔记** — 纯摘抄，禁社交
- ❌ **不做「金句合集导出图片」** — 分享单条金句用 P0-4 分享图即可
- ❌ **不做「金句排行 / 热度」** — 破坏「私人摘抄本」主题
- ❌ **不合并 P0-2「书架」的 like 语义** — 「收藏这本书」和「收藏这句话」是两个独立行为

---

## 3. 金句 ID 派生

### 3.1 现状

`books.yaml` 每本书有 `quotes: string[]`（5 条），当前无 id。

### 3.2 派生 quoteId

**方案 A（首选）**：`quoteId = "${bookId}:${quoteIndex}"`（0-based）

- 例：书 id `hundred-years-of-solitude`，第 3 条金句 → `hundred-years-of-solitude:2`
- 优点：无需改 YAML，纯派生
- 风险：**如果书的 quotes 顺序变化，quoteId 会漂移**（书者删了第 2 条，第 3 条就变成第 2 条）
- **防呆**：v1.1 撤销 CI 漂移检测（与 P0-1 v1.1 同步挂 P1 backlog：`notes/daily-book/backlogs.md` 条目「P0-1 期号漂移 + P0-3 quote 漂移 CI 检测（build 时对比索引/quotes 数组，出现变化 warn）」）。snapshot 5 字段已经足够 robust，CI 非阻塞
- **不阻塞**：即便漂移，用户金句本里保留的是**当时的 quote 内容 snapshot**（见 §3.4），不会看到「金句消失」

### 3.3 无需 schema 变更

Victor 红线：不加字段。派生方案 A 通过。

### 3.4 localStorage schema

```ts
type QuoteEntry = {
  quoteId: string;      // "${bookId}:${quoteIndex}"
  quoteText: string;    // snapshot：收藏时的金句原文（防止 YAML 编辑后金句丢失）
  bookId: string;
  bookTitle: string;    // snapshot
  bookAuthor: string;   // snapshot
  publishedDate: string; // snapshot（用于计算期号 + 显示日期）
};

// key
localStorage.getItem('daily-book:quotes')  // JSON: QuoteEntry[]
```

- 数组按操作时间倒序（最新收藏在前）
- **snapshot 字段**：即使 YAML 后续删除该书或改金句，用户金句本仍能看到原文
- 无时间戳字段（v1 保持简单）

### 3.5 helper 函数（消费 P0-0）

**v1.1 变更**：`src/utils/quotes.ts` 撤销，helper 落 P0-0 `src/scripts/storage.ts`（P0-0 spec §4.3 已预留签名注释，P0-3 首次实装）：

```ts
// src/scripts/storage.ts (P0-0 提供接口, P0-3 实装)
export function isQuoteFavorited(quoteId: string): boolean;
export function toggleQuoteFavorite(entry: QuoteEntry): boolean;
export function getFavoriteQuotes(): QuoteEntry[];
export function removeQuoteFavorite(quoteId: string): void;

// 内部：写操作时 emit daily-book:storage:changed
// { key: 'quotes', action: 'add' | 'remove', quoteId }
```

金句本页只调 `onStorageChange` 监听 + `getFavoriteQuotes()` 读快照：

```ts
import { onStorageChange, getFavoriteQuotes } from '../scripts/storage';

// quotes.astro 页面挂载后
const unsubscribe = onStorageChange((detail) => {
  if (detail.key === 'quotes') refetchState();
});
```

跨 tab 同步由 P0-0 `initStorageBroadcast` 兜底。P0-3 不写自己的事件契约。

---

## 4. 页面布局

### 4.1 路径

`/my/quotes`

### 4.2 视觉结构

```
[Neo Brutalism 硬边框]
━━━━━━━━━━━━━━━━━━━━━
📖 我的金句本
你收藏的字句 · 共 87 条
━━━━━━━━━━━━━━━━━━━━━

┌────────────────────────────────────┐
│ ❞ 世界如此之新，一切尚未命名，          │
│    提到的时候尚需用手指指点点。            │
│                                     │
│  《百年孤独》· 加西亚·马尔克斯             │
│  #23 · 2026-05-08                    │
│  [分享 →] [取消收藏]                    │
└────────────────────────────────────┘

┌────────────────────────────────────┐
│ ❞ 生活总是让我们遍体鳞伤，            │
│    但到后来，那些受伤的地方一定会成为        │
│    我们最强壮的地方。                     │
│                                     │
│  《老人与海》· 海明威                    │
│  #17 · 2026-05-02                    │
│  [分享 →] [取消收藏]                    │
└────────────────────────────────────┘
...

[如果为空]
📭 你的金句本还是空的
读到好句子，点 ♡ 收藏
[回首页 →]
```

### 4.3 排序

- **默认按收藏时间倒序**（最新在前）
- **不做筛选 / 搜索**（v1 保持简单，用户 Ctrl+F 即可）
- **不做按书聚合**（按时间流更符合「摘抄本」气质）

### 4.4 卡片元素

每张金句卡显示：
- **左侧引号装饰** ❞（大号，Neo Brutalism 硬字体）
- **金句原文**（大字号 `text-xl`，`font-serif` 或衬线体，突出内容）
- **出处**：`《书名》· 作者`（`text-sm text-muted-foreground`）
- **期号 + 日期**：`#N · YYYY-MM-DD`（依赖 P0-1）
- **操作按钮**：
  - `[分享 →]` — 生成金句分享图（参考现有 QuoteCard 的 share 逻辑）
  - `[取消收藏]` — 从金句本移出

点击金句卡任意位置 → 跳到出处书详情页 `/book/[date]`

### 4.5 空态

- 金句本为空时显示：「📭 你的金句本还是空的 / 读到好句子，点 ♡ 收藏 / [回首页 →]」

### 4.6 移动端

- 单列布局
- 引号装饰缩小
- 「分享」按钮 sticky bottom（方便点）

---

## 5. 与 QuoteCard 的集成

### 5.1 现有 QuoteCard + quote-swipe.ts

**QuoteCard.astro** 有 3 个按钮：`♡ like-btn` / `📤 share-btn` / `🖼 image-btn`（都是真按钮，非装饰）

**quote-swipe.ts:83-94** — like-btn 事实：
```ts
let liked = false;
likeBtn?.addEventListener('click', () => {
  liked = !liked;
  likeBtn.innerHTML = liked ? '♥' : '♡';
  likeBtn.classList.toggle('liked', liked);
  showToast(liked ? '已收藏' : '已取消');
});
```

→ **状态是内存态 UI toggle**（切换 innerHTML/class + toast），**未 persist 到 localStorage**。刷新页面即丢失。

**P0-3 首次实装持久化 + 跨 tab 同步**。

### 5.2 P0-3 改造

- **♡ 按钮**：明确语义为「收藏这句金句」，调用 P0-0 `toggleQuoteFavorite(entry)` → 写入 `daily-book:quotes` key
- **按钮状态视觉**：
  - 未收藏：`♡`（描边）
  - 已收藏：`♥`（填充，Neo Brutalism 主色 `--accent`）
  - 页面加载时通过 `isQuoteFavorited(quoteId)` 初始化状态（首屏 hydration 后从内存态 → 持久化态）
- **点击 ♡ 时**：调用 `toggleQuoteFavorite(entry)`，其中 entry 包含 quote text / bookId / bookTitle / bookAuthor / publishedDate snapshot（避免 YAML 后续改动导致金句本丢失原文）
- **跨 tab**：Tab A 点 ♡ → Tab B QuoteCard 同一金句 UI 自动同步（P0-0 broadcast 兜底 + `onStorageChange` 监听）
- **toast 保留**：`已收藏` / `已取消` toast 不变，UI 交互连续

### 5.3 数据流

**v1.1**：QuoteCard ♡ / quote-swipe.ts like-btn 点击 → 调 P0-0 `toggleQuoteFavorite(entry)` → 写 localStorage `daily-book:quotes` → **P0-0 内部 emit `daily-book:storage:changed` (`{key:'quotes', action:'add'|'remove', quoteId}`)** → 金句本页 `onStorageChange` handler filter `key==='quotes'` → `refetchState()` → UI 无刷新更新。

跨 tab 同步由 P0-0 `initStorageBroadcast` 兜底。本 spec 不重复实现。

---

## 6. 导航入口

### 6.1 主导航栏

现有导航（已被 P0-2 改造为）：`首页 · 归档 · 搜索 · 我的书架`

**P0-3 追加**：`首页 · 归档 · 搜索 · 我的书架 · 我的金句本`

**注意**：如果 5 项过多，桌面端可考虑合并为「我的」下拉菜单：`我的 ▾ → 书架 / 金句本`

**推荐**：桌面端保持 5 项平铺（Neo Brutalism 主题下扁平化好看），移动端 drawer 内两项独立入口。

### 6.2 「我的」聚合页（可选，P1 再评估）

- `/my/index.astro` — 展示「书架 42 期 · 金句本 87 条」两个卡片入口
- v1 不做，v2 若「我的」子页增加再考虑

---

## 7. 文案（v1.1 只做中文，i18n 独立 P1 backlog）

**页面文案清单**（对齐 daily-book Neo Brutalism 语气）：

| 位置 | 中文文案 |
|---|---|
| 页面标题 | `我的金句本` |
| 副标题 | `你收藏的字句 · 共 {n} 条` |
| 出处 | `《{title}》· {author}` |
| 分享按钮 | `分享 →` |
| 取消按钮 | `取消收藏` |
| 空态标题 | `你的金句本还是空的` |
| 空态 hint | `读到好句子，点 ♡ 收藏` |
| 空态 CTA | `回首页 →` |
| 导航入口 | `我的金句本` |
| Toast: 收藏 | `已收藏` |
| Toast: 取消 | `已取消` |

> v1.1 note: i18n 三语基础设施独立立 P1 backlog（与 P0-1/2 一致）。当前文案硬编码在 `quotes.astro` 与 `quote-swipe.ts`。

---

## 8. schema 与文件改动汇总

### 8.1 无 schema 变更（Victor 红线）

`books.yaml` 不动，quoteId 派生自 `${bookId}:${quoteIndex}`。

### 8.2 新增文件

- `src/pages/my/quotes.astro` — 金句本页主体（消费 P0-0 helper + `onStorageChange`）
- `src/components/QuoteBookCard.astro`（可选） — 金句本页卡片组件
- `scripts/check-quote-drift.mjs`（可选） — **v1.1 撤销**（M3 挂 P1 backlog）

### 8.3 修改文件

- `src/scripts/storage.ts` — 实装 P0-0 预留的 4 个 quote API（`isQuoteFavorited` / `toggleQuoteFavorite` / `getFavoriteQuotes` / `removeQuoteFavorite`），内部 emit `daily-book:storage:changed`
- `src/scripts/quote-swipe.ts` — like-btn 从 `let liked=false` 内存态 → 调 P0-0 `toggleQuoteFavorite(entry)` 持久化 + 初始化时用 `isQuoteFavorited(quoteId)` 读状态
- `src/components/QuoteCard.astro` — **v1.1 拍板 `window.__quotesRegistry` 方案**（M8 决议）：首屏 inline script 一次性 dump 全站 quote registry 到 `window.__quotesRegistry: Record<string, QuoteEntry>`（按 `${bookId}:${quoteIndex}` 取），DOM 只放 `data-quote-id`（轻量）。**不走 base64 data-attribute**——98 本 × 5 quote × ~200 bytes ≈ 100KB 塞 head 对 SSG hydration size 不友好
- `src/layouts/BaseLayout.astro`（或对应 header） — 主导航加「我的金句本」入口

### 8.4 依赖

- **P0-0 storage 迁移必须先合并**：key `daily-book:quotes` + 事件契约 + 迁移 flag 都由 P0-0 提供，P0-3 只填 4 个 quote helper 实装
- **P0-1 期号系统必须先合并**：金句卡片显示「#N · YYYY-MM-DD」需要 P0-1 helper

---

## 9. 交付给 Jeff 的任务拆分建议

**推荐 1 个 PR 完成**：

### T1（P0-3 单 PR）

- **改动**：§8.2 + §8.3 全部
- **验证清单**：
  1. P0-0 4 个 quote helper 单测：add/remove/toggle/is 覆盖 + snapshot 5 字段完整
  2. QuoteCard ♡ 按钮点击后 `daily-book:quotes` 出现 snapshot 5 字段
  3. **`quote-swipe.ts` 初始化时 UI 状态从 localStorage 读取**（首屏 hydration 后 ♥/♡ 正确）
  4. `/my/quotes` 页面 SSR + client hydration 正常
  5. **事件消费**：QuoteCard 点击后金句本页 `onStorageChange` 触发 refetch，UI 无刷新即更新
  6. 金句卡按收藏时间倒序展示
  7. 空态渲染
  8. 卡片显示「#N · YYYY-MM-DD」（依赖 P0-1）
  9. 「分享」按钮生成分享图（复用现有 quote-swipe.ts 逻辑，P0-4 落水印）
  10. 「取消收藏」按钮从金句本移出 + QuoteCard ♡ 同步更新
  11. 主导航「我的金句本」入口
  12. 移动端布局正确
  13. **跨 tab**: Tab A 点 ♡ → Tab B 金句本页 5s 内更新 + Tab B QuoteCard 同一金句 UI 同步（P0-0 broadcast 兜底）
  14. **YAML 编辑后金句本不炸**：手工测——收藏一条金句后编辑 `books.yaml` 删除该书，金句本仍能显示原文（snapshot 生效）

- **预计工作量**：**M（2-3 天）**

---

## 10. 验收标准

QA 用例（Wen 或 Victor 自测）：
1. 全新浏览器打开 `/my/quotes` → 空态
2. 首页点某条金句 ♡ → 金句本页立即出现该条（无刷新）
3. 金句本页点「取消收藏」→ 该条消失 + QuoteCard ♡ 同步（返回首页 ♡ 恢复描边）
4. **刷新首页金句 ♡ 状态不丢**（P0-3 首次实装持久化验证点）
5. 金句本按收藏时间倒序（最新在前）
6. 每张卡片显示：引号装饰 + 金句原文 + 出处 + 期号日期 + 分享 + 取消
7. 「分享」按钮生成分享图（含期号水印，见 P0-4）
8. 主导航「我的金句本」入口正确
9. 移动端布局正确
10. **snapshot 韧性**：手工编辑 YAML 后金句本仍显示原文
11. **跨 tab 同步**：Tab A 点 ♡ → Tab B 金句本页 + Tab B QuoteCard 同一金句 UI 均自动同步

---

## 11. 与 P0-1/2/4 的关系

| P0 | 关系 |
|---|---|
| P0-1 期号系统 | **强依赖** — 金句卡显示「#N」 |
| P0-2 我的书架 | **兄弟页** — 并列 `/my/*`，共用导航模式 |
| P0-4 分享图水印 | **强协同** — 「分享」按钮生成的图片带 P0-4 水印 |

**顺序**：P0-1 先合并 → P0-3 起手（可与 P0-2/4 并行）

---

## 12. 一句话总结

**P0-3 用金句级 ♡ + `/my/quotes` 页把金句从「一次性截图」升级为「可回看的私人摘抄本」——snapshot 存储 + 分享按钮 + 期号出处——是 daily-book 最高留存价值（★★★★★）的 P0 项，2-3 天可上线。**

---

_spec v1.1 完成（2026-07-21 Martin CR pass 修补：like-btn 内存态 UI toggle 更正 / helper 落 P0-0 / 去 i18n）+ Martin 二次 CR 修补（CI drift 撤销挂 P1 / `window.__quotesRegistry` 拍板），等 Martin 三次 CR 后交给 Jeff 实施 PR D（依赖 P0-0 + P0-1 合并）。_

