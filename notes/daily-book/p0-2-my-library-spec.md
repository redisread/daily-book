# daily-book P0-2：我的书架 spec v1.1

> **v1.1 变更**（2026-07-21 Martin CR pass 后修补）：
> - §3 storage schema **完全依赖 P0-0**（key 命名 / helper 契约 / 订阅事件）—— P0-2 不重复定义，只引用 + 消费
> - §3.4 helper 函数 **不再单独暴露 `subscribeLibrary`**，改为消费 P0-0 的 `onStorageChange` + filter
> - §5.3 数据流章节改为「订阅 P0-0 `daily-book:storage:changed`」
> - §7 i18n **整段移除**（daily-book v1.1 只做中文，与 P0-1 一致），后续章节顺延
> - §3.1 现有 key 描述**去除**「Jeff 落地前需再核实」（P0-0 已定契约，此处直接引）
> - **v1.1 二次 CR 修补**：
>   - §3.2 撤销自建 `readFavoritesList`/`readReadsList`/`readWantsList` 3 个 pure read 函数 → 改消费 P0-0 §4.3 `getFavorites`/`getReads`/`getWants`（M2 契约收敛）
>   - §4.3 tab 段落删「(zh / en / ja 三语)」括号 + §10 验收删「10. 三语言正确」（M6 v1.0 遗留清理）
>   - 撤销 `src/scripts/my-library.ts` 文件（M2 落地）

> 需求：Victor DM 2026-07-20 P0 全套第 2 项
> 依据：`notes/daily-book-ux-analysis.md` §7.1 P0 #1（顾客损失 #2「收藏了但看不到」）
> 设计者：@Steven
> 依赖：**P0-0 storage 迁移**（key + 事件基础层）+ **P0-1 期号系统**（书架卡片显示「第 XXX 期」）
> 范围：`daily-book/src/pages/my/library.astro`（新增）+ `src/components/BookCard.astro`（增强）+ 导航入口
> 交付给：Jeff（Martin CR pass 后落地，PR C，与 P0-3/P0-4 并行）

---

## 0. 目标

**把用户 localStorage 里已经在存的收藏 / 已读数据展示出来。**

现状：用户点了 ♡ 收藏、点了「已读」，数据都存了 localStorage，但没有页面能看到。

新增：`/my/library` 页——「我的书架」，展示订阅者的收信箱。

---

## 1. 顾客损失 → 设计对应

| 顾客损失 | 设计对应 | § |
|---|---|---|
| 「点了 ♡ 收藏，然后呢？没有下文」 | 「我的书架」页读 localStorage 展示 | §3 |
| 「点了『已读』但看不到列表」 | 分「收藏 / 已读 / 想读」三个 tab | §3.3 |
| 「订阅刊物应该有『我的收信箱』」 | 命名「我的书架」呼应刊物主题 | §2 |
| 「换设备数据丢失」 | v1 明确接受这个约束，v2 再评估云端同步 | §5.2 |

---

## 2. 不做什么（明确边界）

- ❌ **不做后端** — 纯前端 localStorage（无 schema、无 API、无用户系统）
- ❌ **不做云端同步** — 换设备丢数据是 MVP 已知代价；v2 若需要再上 CF Workers KV + 匿名 ID
- ❌ **不做多用户** — 单浏览器 = 单用户，隐私最好
- ❌ **不做评论 / 笔记** — 纯展示（Victor P3 已砍社交类功能）
- ❌ **不做批量导出 / 导入** — v1 无迁移需求
- ❌ **不做「删除已读记录」入口** — 用户可通过 BookCard 上的 toggle 取消
- ❌ **不做「借书清单 / 阅读进度」** — 超出「书架」范畴

---

## 3. localStorage schema（引 P0-0 契约）

### 3.1 key 契约（P0-0 定义）

**P0-0 storage 迁移 spec §2.1 已定义完整 schema**，P0-2 直接消费：

```ts
localStorage.getItem('daily-book:favorites') // JSON: string[] 书 id 数组
localStorage.getItem('daily-book:reads')     // JSON: string[] 书 id 数组
localStorage.getItem('daily-book:wants')     // JSON: string[] 书 id 数组（P0-0 已初始化空数组）
```

> v1.1 note: **v1.0 说的「Jeff 落地前需再核实」在 P0-0 spec 里已闭环** — key 命名、value 结构、迁移策略、事件订阅契约全在 P0-0，P0-2 只引用。

### 3.2 P0-2 消费方 helper

**v1.1 撤销 library.ts helper，全部消费 P0-0 `storage.ts` 暴露的 API（list getter 已由 P0-0 §4.3 提供）**：

```ts
// P0-0 storage.ts 已提供:
import {
  getFavorites, getReads, getWants,        // P0-0 §4.3 list getter
  isFavorited, toggleFavorite,
  isRead, markAsRead, unmarkAsRead,
  isWanted, toggleWant,
  onStorageChange,                          // P0-0 §4.2 单事件订阅
} from '../scripts/storage';

// library.astro 页面内用法
const state = {
  favorites: getFavorites(),  // → string[]
  reads: getReads(),
  wants: getWants(),
};
```

**v1.1 取消 P0-2 自建 `src/scripts/my-library.ts`**——P0-2 不再有任何 helper 文件，只在 `library.astro` 页面内直接调 P0-0 API。「消费方只依赖 P0-0 API 面」契约落地。

### 3.3 完整状态形状（页面内）

```ts
type LibraryState = {
  favorites: string[];  // 书 id，最近操作的在前
  reads: string[];       // 书 id，最近操作的在前
  wants: string[];       // 书 id，最近操作的在前
};
```

- 所有 key namespace 前缀：`daily-book:`（P0-0 统一）
- **顺序约定**：最近操作的书在数组前（`unshift` 新条目）—— 书架展示按此顺序
- **无时间戳** — 避免存过多元数据，纯 id 数组

### 3.4 事件订阅（消费 P0-0 契约）

**v1.1 移除本 spec 单独定义的 `subscribeLibrary`**，改为消费 P0-0 单事件 `daily-book:storage:changed`：

```ts
import { onStorageChange } from '../scripts/storage';

// library.astro 页面挂载后
const unsubscribe = onStorageChange((detail) => {
  if (['favorites', 'reads', 'wants'].includes(detail.key)) {
    refetchState();  // 全量重读三个数组，简单且正确
  }
});

// beforeunload / astro:page-load 时 unsubscribe
```

**关键**：不写自己的事件契约（避免与 P0-0 分歧）。跨 tab 同步已在 P0-0 `initStorageBroadcast` 里搞定。BookCard 触发 mutation → storage.ts 内部 emit → 书架页监听到 → refetchState → UI 更新。

---

## 4. 页面布局

### 4.1 路径

`/my/library` — Astro 静态页 + client-side hydration（因为 localStorage 只在 client 可读）

### 4.2 视觉结构

```
[Neo Brutalism 硬边框]
━━━━━━━━━━━━━━━━━━━━━
📮 我的书架
你的订阅收信箱 · 共 42 期
━━━━━━━━━━━━━━━━━━━━━

[Tab] ♡ 收藏 (24)  ✓ 已读 (18)  ☆ 想读 (7)
━━━━━━━━━━━━━━━━━━━━━

┌────────────────────────────────────┐
│  #105 · 2026-07-20                 │
│  ┌──────┐                          │
│  │[封面] │  《书名》                    │
│  │       │  作者                       │
│  └──────┘  ♡ 已收藏 · 2 天前            │
└────────────────────────────────────┘

┌────────────────────────────────────┐
│  #98 · 2026-07-13                  │
│  ...                                │
└────────────────────────────────────┘

...

[如果为空]
📭 你的书架还是空的
每天推一本书，点 ♡ 就收进这里
[回首页 →]
```

### 4.3 Tab 切换

- 3 个 tab：**收藏 / 已读 / 想读**（中文一版，i18n 独立 P1 backlog）
- URL 反映 tab 状态：`/my/library?tab=favorites | reads | wants`（可分享 / 可刷新保留）
- 默认 tab：`favorites`
- Tab 切换用 client-side navigation（不刷页）
- 每个 tab 右侧显示计数徽章（`(24)`）

### 4.4 卡片元素

每张书架卡显示：
- **期号徽章**（左上）：`#105`（来自 P0-1 `getBookIssueNumber(bookId)`）
- **发布日期**（左上，期号右侧）：`2026-07-20`
- **书封**（左侧 80×120）
- **书名 + 作者**（右侧）
- **状态标签**（右下）：`♡ 已收藏 · 2 天前` / `✓ 已读 · 5 天前` / `☆ 想读 · 3 天前`
  - **时间**：v1 不存时间戳，所以显示不了「2 天前」——**去掉时间**，只显示状态标签
  - 更新为：`♡ 已收藏` / `✓ 已读` / `☆ 想读`
- 点击整张卡跳详情页 `/book/[date]`
- 右上角小按钮「取消」（`×` 图标）— 移出书架

### 4.5 空态

- Tab 里无书时显示空态卡（如 §4.2 示意图底部）
- 3 个 tab 全空时显示大空态：「你的书架还是空的 / 每天推一本书，点 ♡ 就收进这里 / [回首页 →]」

### 4.6 移动端

- Tab 变横向 scroll bar（不 wrap）
- 卡片 full-width，书封尺寸减半（40×60）
- 「取消」按钮改为 swipe left 手势 or 点击卡片进入编辑态

---

## 5. 与 BookCard 的集成

### 5.1 现有 BookCard（`src/components/BookCard.astro`）

现在有：`♡ 收藏` 按钮 + `✓ 已读` 按钮

### 5.2 P0-2 增强

- **新增按钮**：`☆ 想读`（加入 wants）
- **新增交互**：3 个按钮都是 toggle（点一次加入，再点一次移除）
- **按钮状态视觉**：
  - 未选中：`border-2 border-black bg-white text-black`
  - 已选中：`bg-accent text-white`（Neo Brutalism 硬填充）
- **按钮排布**：一行 3 个，等宽 flex

### 5.3 数据流

**v1.1**：BookCard 内所有 toggle 操作调用 P0-0 `src/scripts/storage.ts` helper（`toggleFavorite` / `markAsRead` / `toggleWant`）→ 写 localStorage → **内部 emit `daily-book:storage:changed`** → 书架页 `onStorageChange` 监听器 → filter `key in ['favorites', 'reads', 'wants']` → `refetchState()` → UI 更新。

跨 tab 同步由 P0-0 `initStorageBroadcast` 兜底，本 spec 不重复实现。

---

## 6. 导航入口

### 6.1 主导航栏（`src/layouts/Layout.astro` 或 header）

现有导航：`首页 · 归档 · 搜索`

**改造**：加「我的书架」入口 → `首页 · 归档 · 搜索 · 我的书架`

- 桌面：文字链接
- 移动端：drawer / hamburger 菜单里
- 图标：📮 或 lucide `BookMarked`

### 6.2 首页 BookCard 下方 hint（可选）

若 localStorage 已有任一 favorites/reads/wants ≥ 1 条：
在首页 BookCard 下方显示小 hint：「📮 你的书架已有 N 期」，点击跳 `/my/library`

不做也无所谓（导航入口够了），Jeff 视工作量决定。

---

## 7. 文案（v1.1 只做中文，i18n 独立 P1 backlog）

**页面文案清单**（对齐 daily-book Neo Brutalism 语气）：

| 位置 | 中文文案 |
|---|---|
| 页面标题 | `我的书架` |
| 副标题 | `你的订阅收信箱 · 共 {n} 期` |
| Tab: 收藏 | `♡ 收藏` |
| Tab: 已读 | `✓ 已读` |
| Tab: 想读 | `☆ 想读` |
| 卡片状态: 已收藏 | `♡ 已收藏` |
| 卡片状态: 已读 | `✓ 已读` |
| 卡片状态: 想读 | `☆ 想读` |
| 取消按钮 | `取消` |
| 空态: 收藏 | `还没有收藏的书 · 每天推一本，点 ♡ 收进来` |
| 空态: 已读 | `还没有已读的书` |
| 空态: 想读 | `还没有想读的书` |
| 空态: 全空 | `你的书架还是空的` |
| 空态 hint | `每天推一本书，点 ♡ 就收进这里` |
| 空态 CTA | `回首页 →` |
| 导航入口 | `我的书架` |

> v1.1 note: i18n 三语基础设施独立立 P1 backlog（与 P0-1 一致），届时把此表 zh/en/ja 三列铺齐。当前文案硬编码在 `library.astro`。

---

## 8. schema 与文件改动汇总

### 8.1 无 schema 变更（Victor 红线）

`books.yaml` 不动。所有数据在 localStorage。

### 8.2 新增文件

- `src/pages/my/library.astro` — 书架页主体
- `src/scripts/my-library.ts` — **v1.1 撤销**（M2 落地，P0-2 不再自建 helper，纯消费 P0-0 §4.3 list getter）
- `src/components/LibraryTabs.astro`（可选，也可 inline） — Tab 组件
- `src/components/LibraryCard.astro`（可选） — 书架卡片组件

### 8.3 修改文件

- `src/components/BookCard.astro` — 加「想读」按钮 + 3 按钮 toggle 化（复用 P0-0 storage API）
- `src/scripts/storage.ts` — 若 P0-0 未加 `toggleWant`/`isWanted`（应加），此处补齐
- `src/layouts/Layout.astro`（或对应 header） — 主导航加「我的书架」入口

### 8.4 依赖

- **P0-0 storage 迁移必须先合并**：key 命名 / 迁移完成 flag / 事件契约都由 P0-0 提供
- **P0-1 期号系统必须先合并**：书架卡片显示「#N · YYYY-MM-DD」需要 P0-1 的 `getBookIssueNumber(bookId)` helper

---

## 9. 交付给 Jeff 的任务拆分建议

**推荐 1 个 PR 完成**（工作量集中，不建议拆分）：

### T1（P0-2 单 PR，v1.1 依赖 P0-0 已合并）

- **改动**：§8.2 + §8.3 全部
- **验证清单**：
  1. P0-0 `getFavorites`/`getReads`/`getWants` 返回正确数组（v1.1 不再自建纯读函数）
  2. **事件消费**：BookCard 点击后书架页 `onStorageChange` 触发 refetch，UI 无刷新即更新（filter `detail.action in ['add', 'remove', 'sync']` 覆盖三场景）
  3. `/my/library` 页面 SSR 无报错（静态 shell + client hydration）
  4. Tab 切换 URL 更新（`?tab=reads`）+ 刷新保留状态
  5. 空态渲染（tab 空 + 全空两种）
  6. 卡片显示期号「#N · YYYY-MM-DD」（依赖 P0-1）
  7. BookCard 3 按钮 toggle 状态视觉正确
  8. 主导航「我的书架」入口出现
  9. 移动端 tab scroll + 卡片布局正确
  10. **跨 tab**: 一个 tab 收藏一本，另一 tab 书架页 5s 内更新（P0-0 broadcast 兜底）
- **预计工作量**：**S-M（2-3 天）**

---

## 10. 验收标准

QA 用例（Wen 或 Victor 自测）：
1. 全新浏览器打开 `/my/library` → 空态显示「你的书架还是空的」
2. 首页点♡ → 书架页 favorites tab 立即出现该书（无刷新）
3. 首页点「已读」→ 书架页 reads tab 立即出现
4. 首页点「想读」→ 书架页 wants tab 立即出现
5. 书架页点「取消」→ 该书从 tab 消失 + BookCard 状态同步（返回首页看到 toggle 已取消）
6. 切换 tab → URL 变化 + tab 内容切换
7. 刷新页面 → URL tab 参数保留 + 数据不丢
8. 每张书架卡片显示「#N · YYYY-MM-DD · 书名 · 作者 · 状态徽章」
9. 主导航「我的书架」入口跳转正确
10. 移动端：tab 横向 scroll，卡片 full-width
11. **性能**：书架有 100+ 本时无明显卡顿

---

## 11. 与 P0-1/3/4 的关系

| P0 | 关系 |
|---|---|
| P0-1 期号系统 | **强依赖** — 卡片显示「#N」 |
| P0-3 我的金句本 | **兄弟页** — `/my/quotes`，与 `/my/library` 并列，共用 helper 结构 |
| P0-4 分享图水印 | 无直接依赖 |

**顺序**：P0-1 先合并 → P0-2 起手（可与 P0-3/4 并行）

---

## 12. 一句话总结

**P0-2 用一个纯前端 `/my/library` 页把用户 localStorage 里已经在存的收藏 / 已读 / 想读（新增）数据展示为「我的书架」——3 个 tab + 期号徽章 + 空态引导 + BookCard toggle 同步——零 schema 变更，2-3 天可上线。**

---

_spec v1.1 完成（2026-07-21 Martin CR pass 修补：storage 契约完全依赖 P0-0 / 单事件订阅 / 去 i18n）+ Martin 二次 CR 修补（list getter 消费 / 删 i18n 残留），等 Martin 三次 CR 后交给 Jeff 实施 PR C（依赖 P0-0 + P0-1 合并）。_

