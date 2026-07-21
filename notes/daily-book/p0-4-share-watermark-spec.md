# daily-book P0-4：分享图水印 spec v1.1

> **v1.1 变更**（2026-07-21 Martin CR pass 后修补 + Steven fact-check）：
> - **技术栈更正**：v1.0 假设 Satori / `@vercel/og` 服务端生成，**实际是 client-side Canvas 2D API**（`src/scripts/quote-swipe.ts:144-206`）。P0-4 改动落在 canvas 绘制逻辑，非 API endpoint
> - **画布尺寸更正**：1080 × 1080（正方形，社交平台友好），非 1200 × 630
> - **色彩更正**：accent 实际是 `#C03A00`（旧铅红），非 v1.0 假设的 `#FF4D00`；bg 是 `#F2F0EA`（旧纸白）；fg `#0A0A0A`
> - **既有品牌行更正**：canvas 底部已有 `每日一书 · Daily Book` 品牌行，**P0-4 只是把这一行升级为「daily-book · 第 XXX 期」并统一样式规范**
> - §6 i18n **整段移除**（daily-book v1.1 只做中文，与 P0-0/1/2/3 一致）
> - §5.2 覆盖范围收窄到 **金句分享**（当前 `quote-swipe.ts` 只做金句 canvas），书封分享 `share-btn` 走 native `navigator.share`（`quote-swipe.ts:106-131`），**不生成图片**，无水印落点 → 书封分享图整体列入 P1 backlog

> 需求：Victor DM 2026-07-20 P0 全套第 4 项
> 依据：`notes/daily-book-ux-analysis.md` §7.1 P0 #4（品牌感 + 刊物封面感）
> 设计者：@Steven
> 依赖：**P0-1 期号系统**（水印文案「daily-book · 第 XXX 期」需要 `getBookIssueNumber(bookId)`）
> 范围：`daily-book/src/scripts/quote-swipe.ts`（改造 canvas 品牌行）
> 交付给：Jeff（Martin CR pass 后落地 PR E，可与 P0-2/P0-3 并行）

---

## 0. 目标

**金句分享图变刊物封面：把当前 `每日一书 · Daily Book` 品牌行升级为「daily-book · 第 XXX 期」，让分享出去的图片一眼能看出来源 + 期数。**

现状：金句分享 canvas 底部有 `每日一书 · Daily Book` 品牌行，但没有期号，看不出「第几期」。

新增：品牌行文案改为「daily-book · 第 XXX 期」+ 视觉规范固化。

---

## 1. 顾客损失 → 设计对应

| 顾客损失 | 设计对应 | § |
|---|---|---|
| 「分享的金句图看得出是 daily-book，但看不出第几期」 | 品牌行加期号 | §3 §4 |
| 「刊物应该有封面感」 | 品牌行沿用 Neo Brutalism 主色 `--accent #C03A00` | §4 |
| 「日更内容找不到回访锚点」 | 期号即时间线锚点，用户想回访能查到 | §4 |

---

## 2. 不做什么（明确边界）

- ❌ **不加二维码** — 用户不会扫，反而破坏视觉纯粹
- ❌ **不加 URL** — 品牌行「daily-book · 第 XXX 期」自带认知
- ❌ **不做「用户可关闭水印」** — 品牌统一
- ❌ **不做动态水印**（如「@用户名」） — 无用户系统
- ❌ **不改分享图整体构图** — 只改品牌行文案 + 微调视觉
- ❌ **不做书封分享的图片生成** — 当前 `share-btn` 走 native share，无 canvas；书封分享图整体列 P1 backlog
- ❌ **不做多语言** — v1.1 与 P0-0/1/2/3 一致只做中文

---

## 3. 现状梳理（fact-check 完）

### 3.1 分享图生成路径

**只有金句分享**（书封分享无 canvas）：
- **`src/scripts/quote-swipe.ts:144-206`** —「保存图片」按钮触发
- 生成方式：**client-side Canvas 2D API**（`document.createElement('canvas')` + `getContext('2d')`），生成 1080×1080 PNG，`canvas.toDataURL('image/png')` 触发下载
- 不走服务端，不用 Satori / `@vercel/og`
- 字体：`Inter` / `PingFang SC` / `Microsoft YaHei` / `JetBrains Mono` — 系统字体，无 embed

### 3.2 现有 canvas 结构（`quote-swipe.ts:144-206`）

```
1080 × 1080
┌────────────────────────────────────┐
│  ┌──────────────────────────────┐  │ ← 8px 硬边框 (#0A0A0A)
│  │                              │  │
│  │  ┃ 金句正文 (48px)            │  │ ← 12px 竖条 (#C03A00) 引用线
│  │                              │  │
│  │                              │  │
│  │   来源 · 作者 (28px)           │  │
│  │                              │  │
│  │  每日一书 · Daily Book (24px) │  │ ← 现有品牌行 (#C03A00)
│  └──────────────────────────────┘  │
└────────────────────────────────────┘
```

### 3.3 现有品牌行

- 位置：`ctx.fillText('每日一书 · Daily Book', canvas.width / 2, canvas.height - 80)`
- 字体：`700 24px "JetBrains Mono", "PingFang SC", "Microsoft YaHei", monospace`
- 颜色：`--accent #C03A00`
- 对齐：`textAlign = 'center'`

---

## 4. 水印设计规范（v1.1 微改）

### 4.1 文案

**从**：`每日一书 · Daily Book`
**改为**：`daily-book · 第 {n} 期`

例：`daily-book · 第 105 期`

**期号获取**：canvas 生成时需要 quote 的 bookId → 调 P0-1 `getBookIssueNumber(bookId)` 拿到 n
- **数据传递**：`quote-swipe.ts` 已有 `currentShareQuote` / `currentShareSource` 全局态，P0-4 增加 `currentShareBookId` 全局态 + 在 QuoteCard 侧 `data-book-id` 传入
- **兜底**：若 bookId 缺失或期号 lookup 失败 → 品牌行 fallback 到 `daily-book`（去掉「· 第 N 期」，保品牌可读）

### 4.2 位置 + 样式（保持不变 + 微调）

```
┌────────────────────────────────────┐
│                                    │
│  金句正文                            │
│                                    │
│  来源 · 作者                         │
│                                    │
│                                    │
│  daily-book · 第 105 期              │ ← 品牌行 (--accent #C03A00, 700 24px)
└────────────────────────────────────┘
```

- **保持**：位置 `y = canvas.height - 80`、`textAlign='center'`、字体 stack、字号 24px、weight 700、颜色 `#C03A00`
- **改**：仅文案

### 4.3 尺寸

保持 1080 × 1080（`quote-swipe.ts:149-150`）。

### 4.4 字体

保持 `"JetBrains Mono", "PingFang SC", "Microsoft YaHei", monospace`（系统字体，无需 embed）。

`第 N 期` 中文部分由 `PingFang SC` / `Microsoft YaHei` fallback 渲染，`JetBrains Mono` 只作 latin fallback；`daily-book · ` 与数字部分优先 JetBrains Mono，两段字形并存的错落感符合 Neo Brutalism 排版趣味。

---

## 5. 实现要点

### 5.1 quote-swipe.ts 改造伪代码

```ts
import { getBookIssueNumber } from '../utils/issue-number'; // P0-1

// (existing top-level state)
let currentShareBookId: string | null = null;

// (existing openShare) 增加: 从 QuoteCard 侧 data-book-id 传入 → currentShareBookId

// (existing downloadBtn click handler, line ~194-197)
// 替换:
- ctx.fillStyle = '#C03A00';
- ctx.font = '700 24px "JetBrains Mono", "PingFang SC", "Microsoft YaHei", monospace';
- ctx.fillText('每日一书 · Daily Book', canvas.width / 2, canvas.height - 80);
+ ctx.fillStyle = '#C03A00';
+ ctx.font = '700 24px "JetBrains Mono", "PingFang SC", "Microsoft YaHei", monospace';
+ const issueNumber = currentShareBookId ? getBookIssueNumber(currentShareBookId) : null;
+ const brandLine = issueNumber != null
+   ? `daily-book · 第 ${issueNumber} 期`
+   : 'daily-book';
+ ctx.fillText(brandLine, canvas.width / 2, canvas.height - 80);
```

### 5.2 QuoteCard 侧最小增改

`src/components/QuoteCard.astro` — 分享按钮 / 卡片元素上增加 `data-book-id={book.id}`（如尚未加）→ `quote-swipe.ts` 打开分享模态时 `currentShareBookId = trigger.dataset.bookId`。

### 5.3 覆盖场景

**v1.1 仅金句分享 canvas**：
- **金句「保存图片」按钮** → canvas 生成品牌行「daily-book · 第 N 期」

**不在 P0-4 范围**：
- **书封分享**（QuoteCard `share-btn`）走 native `navigator.share`，不生成图片 → 无水印落点
- **书封分享图整体**列 P1 backlog（若未来需要，独立 spec）

### 5.4 P0-1 依赖

- `getBookIssueNumber(bookId): number | null`（P0-1 提供）
- 必须 P0-1 先合并再上 P0-4

### 5.5 缓存

**不涉及**：client-side canvas，用户点一次生成一次，不落服务端 CDN。

---

## 6. schema 与文件改动汇总

### 6.1 无 schema 变更

无 YAML / DB 改动。

### 6.2 修改文件

- `src/scripts/quote-swipe.ts` — 品牌行文案 + `currentShareBookId` 状态 + 调 P0-1 helper
- `src/components/QuoteCard.astro` — 增加 `data-book-id`（若已存在则不改）

### 6.3 无新增文件

`src/utils/watermark.ts` 不新建（一行文案改动无必要独立文件）。

### 6.4 依赖

- **P0-1 期号系统必须先合并**：`getBookIssueNumber(bookId)` helper

---

## 7. 交付给 Jeff 的任务拆分建议

**单 PR 完成**：

### T1（P0-4 单 PR）

- **改动**：§6.2 全部
- **验证清单**：
  1. 金句「保存图片」→ 生成 1080×1080 PNG，底部品牌行文案为 `daily-book · 第 105 期`（数字与当前金句所属书的期号对应）
  2. QuoteCard 的 `data-book-id` 正确传入 `quote-swipe.ts` 全局态
  3. bookId 缺失或 issueNumber 为 null 时 fallback 到 `daily-book`（去掉期号后缀），无 crash
  4. 视觉：品牌行位置（`y = height - 80`）、字体、颜色 `#C03A00`、居中对齐均与现状一致
  5. 中文渲染正常（`第 105 期` 中的中文字符由 fallback 字体渲染）
  6. **回归**：canvas 主体（边框 / 引用线 / 金句正文 / 来源）无变化
  7. 现有 toast `'图片已生成并下载'` 保留

- **预计工作量**：**XS 2-4 小时**

---

## 8. 验收标准

QA 用例（Wen 或 Victor 自测）：
1. 首页某金句「保存图片」→ 底部品牌行显示 `daily-book · 第 XXX 期`，XXX 与该金句所属书的期号一致
2. 收藏本（P0-3 落地后）内某金句「保存图片」→ 同样正确
3. 分享图 PNG 尺寸 1080×1080
4. 品牌行视觉：`#C03A00` 主色、JetBrains Mono / PingFang SC 字体、24px 700 weight、居中
5. **未发布书 fallback**：假若某个金句所属书 `publishedDate: null`（正常不该发生，但作 robust 测），品牌行降级为 `daily-book`，图片不 crash
6. **回归**：现有 canvas 主体（边框 / 引用线 / 金句 / 来源）像素级无变化

---

## 9. 与 P0-0/1/2/3 的关系

| P0 | 关系 |
|---|---|
| P0-0 storage 迁移 | 无直接依赖 |
| P0-1 期号系统 | **强依赖** — 品牌行内含期号 |
| P0-2 我的书架 | 无直接依赖（书架内的书封若加分享，不走 canvas，故不生 watermark） |
| P0-3 我的金句本 | **强协同** — 金句本「分享」按钮生成的图片带 P0-4 品牌行 |

**顺序**：P0-1 先合并 → P0-4 起手（可与 P0-2/P0-3 并行）

---

## 10. 一句话总结

**P0-4 把 `src/scripts/quote-swipe.ts` canvas 里现有的 `每日一书 · Daily Book` 品牌行升级为「daily-book · 第 XXX 期」——一处 canvas fillText + 一处 data-book-id 传参 + P0-1 helper 调用——2-4 小时可上线，是 P0 全套最快见效的品牌一致性动作。**

---

_spec v1.1 完成（2026-07-21 Martin CR pass 修补 + Steven fact-check：Satori→canvas 2D 更正 / 尺寸 1080²  / accent #C03A00 / 收窄到金句 / 去 i18n），等 Martin 二次 CR 后交给 Jeff 实施 PR E（依赖 P0-1 合并）。_
