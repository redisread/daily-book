# daily-book neo brutalism UI 设计规范 v1.0

> 任务：#38 P1 设计 daily-book neo brutalism UI 规范
> 频道：#proj-daily-book
> 设计者：@Steven
> 日期：2026-07-18
> 关联：#37 daily-book 改造 UI 成 neo brutalism 风格

---

## 0. 设计目标

把 daily-book 从当前的「温和光斑 + 圆角卡片」改造成 **neo brutalism**：高对比、硬边框、直角、粗阴影、快速动效。

保留现有功能（lightbox、轮播、RSS、标记已读/收藏、分享图生成）不动，只改视觉层。

**neo brutalism 的核心**：
- 颜色极少，对比极强
- 边框粗，阴影硬，没有圆角
- 字体重，字号大，层级靠尺寸和字重
- 动效快速、干脆，像机械开关

---

## 1. 颜色系统

### 1.1 核心 token

| Token | Hex | 用途 |
|---|---|---|
| `--bg` | `#F2F0EA` | 主背景：旧纸白 |
| `--fg` | `#0A0A0A` | 文字 / 主边框 |
| `--paper` | `#FFFFFF` | 卡片背景 |
| `--accent` | `#FF4D00` | 唯一强调色：橙红（当前按钮、激活导航、页码） |
| `--accent-alt` | `#FFCE00` | 辅助强调：亮黄（标签、图标底） |
| `--muted` | `#666666` | 次要文字 |
| `--border` | `#0A0A0A` | 边框颜色（与 `--fg` 相同） |

**规则**：
- 只用以上 7 个颜色，不允许渐变。
- 阴影一律使用 `rgba(10,10,10,0.18)` 硬阴影，不带 blur。
- 浅色主题下，正文 `#0A0A0A` 在 `#F2F0EA` 上对比度 ≥ 14:1，满足 WCAG AAA。

### 1.2 色板映射

| 当前元素 | 新颜色 |
|---|---|
| 背景 ambient orbs / grain | 删除，背景纯色 `--bg` |
| 卡片背景 | `--paper` |
| 主按钮 | `--accent` 底 + `--paper` 字 |
| 次按钮 | `--paper` 底 + `--fg` 字 + 2px 边框 |
| 分类标签 | `--accent-alt` 底 + `--fg` 字 |
| 日期/页码 | `--accent` |
| 已读/收藏激活 | `--accent-alt` 边框 + `--accent` 图标 |
| lightbox 遮罩 | `rgba(10,10,10,0.92)` |
| 当前导航 | `--accent` 文字 + `--accent-alt` 下划线 |

---

## 2. 字体系统

### 2.1 字体栈

```
标题（H1/H2/卡片标题）:
  "Space Grotesk", "Noto Sans SC", sans-serif
  font-weight: 700
  letter-spacing: -0.02em

正文 / 描述 / 引用:
  "Inter", "Noto Sans SC", sans-serif
  font-weight: 400 / 500
  letter-spacing: 0

数字 / 日期 / 标签 / 按钮:
  "JetBrains Mono", "Noto Sans SC", monospace
  font-weight: 500 / 700
  letter-spacing: 0.02em
```

**说明**：
- 标题用 Space Grotesk 700，硬朗几何感。
- 中文 fallback 到 Noto Sans SC 700，避免 faux-bold。
- 数字和 UI 元素用 JetBrains Mono，增强 brutalist 的「印刷机械」感。
- 不引入 serif，避免与「粗野」冲突。

### 2.2 字号与层级

| 层级 | 字号 | 字重 | 用途 |
|---|---|---|---|
| hero 书名 | clamp(2rem, 6vw, 4rem) | 700 | 首页主标题 |
| section 标题 | clamp(1.5rem, 4vw, 2.25rem) | 700 | 往期推荐 / 金句 |
| 卡片标题 | 1.25rem | 700 | 历史卡片 / 归档卡片 |
| 正文 | 1rem / 1.125rem | 400 / 500 | 描述、引用正文 |
| 标签 / 日期 | 0.75rem / 0.875rem | 700 mono | 分类、日期、页码 |
| 按钮 | 0.875rem | 700 mono | 所有按钮 |
| footer / 导航 | 0.875rem | 500 | 导航文字 |

---

## 3. 边框与阴影

### 3.1 边框

- 所有卡片、按钮、标签、导航按钮：**2px solid var(--fg)**
- lightbox 内容边框：**4px solid var(--fg)**
- 圆角：**0**，所有元素直角
- 输入框 / 搜索框：**2px solid var(--fg)**，无圆角

### 3.2 阴影

**只有一种阴影**：

```css
box-shadow: 6px 6px 0 rgba(10,10,10,0.18);
```

- 卡片默认：6px 6px
- 卡片 hover：8px 8px（阴影变大 + 卡片轻微上移 2px）
- 按钮默认：4px 4px
- 按钮 hover：6px 6px
- 按钮 active：2px 2px（像被按下）

**禁止**：
- ❌ blur 阴影
- ❌ 多层柔和阴影
- ❌ inset 阴影
- ❌ 彩色阴影

---

## 4. 布局系统

### 4.1 页面容器

- 最大宽度：`1200px`
- 左右 padding：`24px`（桌面）/ `16px`（移动）
- section 间距：`64px`（桌面）/ `48px`（移动）
- 背景：纯色 `--bg`，删除 ambient orbs / grain

### 4.2 网格

- 历史卡片网格：`repeat(auto-fill, minmax(260px, 1fr))`
- 归档页网格：`repeat(auto-fill, minmax(220px, 1fr))`
- gap：`24px`
- 所有卡片高度统一，内容溢出用 `overflow: hidden` + ellipsis

### 4.3 对齐

- 桌面：左对齐为主，重要信息（日期、页码）可右对齐形成对比
- 移动：单列堆叠，保持左对齐

---

## 5. 动效系统

### 5.1 总原则

- 所有动效时长：`120ms – 240ms`
- 缓动：`ease-out`（进场）或 `cubic-bezier(0.2, 0.8, 0.2, 1)`（交互）
- **禁止**：spring、bounce、长 fade、视差

### 5.2 具体规则

| 场景 | 效果 | 时长 | 缓动 |
|---|---|---|---|
| 卡片 hover | translateY(-2px) + 阴影 6→8px | 120ms | ease-out |
| 按钮 hover | translateY(-2px) + 阴影 4→6px | 120ms | ease-out |
| 按钮 active | translateY(0) + 阴影 4→2px | 80ms | ease-out |
| 导航 hover | 文字颜色 → `--accent` | 120ms | ease-out |
| lightbox 打开 | scale(0.96) → scale(1) + opacity 0→1 | 160ms | ease-out |
| lightbox 关闭 | scale(1) → scale(0.96) + opacity 1→0 | 120ms | ease-in |
| 轮播切换 | translateX snap | 180ms | cubic-bezier(0.2,0.8,0.2,1) |
| 页面加载 | 标题 translateY(12px) + opacity | 200ms | ease-out |
| toast 出现 | translateY(8px) + opacity | 160ms | ease-out |
| 链接 hover | 下划线从 0→100% | 120ms | ease-out |

### 5.3 减少动效

```css
@media (prefers-reduced-motion: reduce) {
  * { animation: none !important; transition: none !important; }
}
```

---

## 6. 组件规范

### 6.1 Header / 导航

- 高度：`72px`
- 背景：`--bg`
- 底部边框：`2px solid var(--fg)`
- logo：文字「每日一书」，Space Grotesk 700，不加图标
- 导航按钮：`--paper` 底 + 2px 边框 + 4px 阴影；激活时 `--accent` 文字 + `--accent-alt` 底部 3px 条
- 移动端底部导航：同样 2px 边框 + `--paper` 底，激活项 `--accent-alt` 背景

### 6.2 Hero 卡片

- 背景：`--paper`
- 边框：2px solid `--fg`
- 阴影：6px 6px
- 布局：左书封 / 右信息（桌面），移动上下堆叠
- 书封：保持 2:3，外部加 2px 边框，内部 placeholder 背景改为纯色 `--fg` 或 `--accent`（删除渐变）
- 书封 hover：translateY(-2px) + 阴影 6→8px

### 6.3 QuoteCard

- 背景：`--paper`
- 边框：2px solid `--fg`
- 左侧 6px `--accent` 竖条（引用标识）
- 引用符号 `"`：JetBrains Mono 700，颜色 `--accent`
- 操作按钮：无边框，hover 时 `--accent-alt` 背景
- 已点赞：`--accent` 填充 + `--accent-alt` 背景

### 6.4 HistoryCard / BookCard

- 背景：`--paper`
- 边框：2px solid `--fg`
- 阴影：6px 6px
- 日期：JetBrains Mono 700，颜色 `--accent`
- 标题：Space Grotesk 700
- hover：translateY(-2px) + 阴影 8px 8px

### 6.5 按钮

**Primary**：
- 背景：`--accent`
- 文字：`--paper`
- 边框：2px solid `--fg`
- 阴影：4px 4px
- hover：阴影 6px 6px + translateY(-2px)

**Secondary**：
- 背景：`--paper`
- 文字：`--fg`
- 边框：2px solid `--fg`
- 阴影：4px 4px
- hover：背景 `--accent-alt`

**Disabled**：
- 背景：`--muted`
- 文字：`--paper`
- 阴影：2px 2px
- 无 hover

### 6.6 Lightbox

- 遮罩：`rgba(10,10,10,0.92)`
- 内容：`--paper` 底 + 4px 边框 + 8px 阴影
- 关闭按钮：右上角，`--paper` 底 + 2px 边框 + 4px 阴影，hover `--accent-alt`
- 打开：scale 0.96→1 + fade，160ms
- 关闭：scale 1→0.96 + fade，120ms

### 6.7 搜索 / 输入

- 输入框：`--paper` 底 + 2px 边框 + 4px 阴影
- focus：`outline: 2px solid var(--accent)`，offset 2px
- placeholder：`--muted`

### 6.8 Toast

- 背景：`--fg`
- 文字：`--paper`
- 边框：2px solid `--accent-alt`
- 阴影：4px 4px
- 位置：底部居中（移动端）/ 右下角（桌面）

### 6.9 Footer

- 顶部边框：2px solid `--fg`
- 文字：JetBrains Mono 500，`--muted`
- 链接 hover：`--accent`

---

## 7. 图标与图片

- 删除 emoji 图标（📖 📚 🔍 📡），改用纯文字标签
- 书封 placeholder：纯色 `--fg` 或 `--accent`，标题用 Space Grotesk 700，作者用 Inter 400
- 分享图生成：保持功能，但视觉改为 `--bg` 底 + `--fg` 字 + `--accent` 引用线
- 不使用图标库，如必须使用，用 1.5px stroke 的线性图标

---

## 8. 可访问性

- 颜色对比度全部满足 WCAG AA：正文 ≥4.5:1，大文本 ≥3:1
- focus-visible：2px `--accent` outline，offset 2px
- 键盘导航：Tab 顺序与视觉一致
- lightbox：Esc 关闭，焦点 trap，aria-modal
- 按钮：真实 `<button>`，disabled 用 `disabled` 属性
- 所有 interactive 元素 hover / focus 状态可感知

---

## 9. 性能约束

- 字体：self-host Space Grotesk + Inter + JetBrains Mono + Noto Sans SC subset，总预算 ≤ 250KB
- 删除 ambient orbs / grain 背景（减少 GPU 层）
- 阴影只用 `box-shadow`，不用 `filter: drop-shadow`
- 动效全部 CSS，不引入 JS 动画库

---

## 10. 落地清单（Jeff 实施）

### Phase 1：token + 基础组件

- [ ] 新建 `public/styles/neo-brutalism.css`，定义 §1–§5 token
- [ ] 替换 `Layout.astro` 的字体加载
- [ ] 删除 ambient orbs / grain
- [ ] 改造 Header / 导航 / Footer
- [ ] 改造按钮 / 标签 / 输入框

### Phase 2：核心卡片

- [ ] 改造 HeroCard
- [ ] 改造 QuoteCard
- [ ] 改造 HistoryCard / BookCard
- [ ] 改造 Lightbox

### Phase 3：页面与动效

- [ ] 首页 / 归档页 / 搜索页布局对齐
- [ ] 轮播 snap 动效
- [ ] 页面加载动效
- [ ] Toast 改造
- [ ] 分享图视觉同步

### Phase 4：验收

- [ ] Lighthouse a11y ≥ 95
- [ ] 无圆角 / 无渐变 / 无柔和阴影
- [ ] 所有 hover / active 状态符合 §5
- [ ] 移动端单列堆叠正常

---

## 11. 验收标准

- 打开首页，第一眼感觉是「一本用粗纸和油墨印的书单」，不是「一个温柔的阅读 App」
- 所有卡片、按钮、导航都是直角 + 粗边框 + 硬阴影
- 动效快速、机械，没有柔和 fade
- 功能（lightbox、轮播、RSS、标记已读/收藏、分享图）全部保留且可用
- Lighthouse a11y ≥ 95

---

## 12. 决策点（2026-07-18 已由 @Martin 代表团队确认）

1. 主强调色 `#FF4D00`（橙红）+ 辅助 `#FFCE00`（亮黄）✅
2. 标题 Space Grotesk 700，正文 Inter，数字 JetBrains Mono ✅
3. 删除 emoji 图标、ambient orbs、grain 背景 ✅
4. 不先出静态 HTML 原型，Jeff 直接按规范实施 ✅

---

## 附：PR 链路（2026-07-18 @Wen / @Martin 确认）

Jeff 提 PR → @Martin CR → @Wen 本地测试 → Victor merge → @Wen 线上回归

### Wen 验收清单（自查对照）

**视觉硬性规则**（getComputedStyle 实测）
- 全部直角 border-radius: 0；边框 2px solid #0A0A0A（lightbox 4px）
- 阴影仅 `Npx Npx 0 rgba(10,10,10,0.18)` 无 blur：卡片 6→hover 8px，按钮 4→6→active 2px
- 无渐变（含书封 placeholder）、无 ambient orbs / grain、无 emoji
- 7 色板不超标；字体 Space Grotesk 700 / Inter / JetBrains Mono，中文 fallback Noto Sans SC 无 faux-bold
- 字体请求总量 ≤ 250KB

**动效**
- 全部 120–240ms ease-out，无 spring/bounce/长 fade
- lightbox scale 0.96→1 160ms；轮播 snap 180ms
- prefers-reduced-motion 全禁

**功能回归（必须保留）**
- lightbox（Esc / 焦点 trap / aria-modal）、轮播、RSS、标记已读/收藏、分享图生成、搜索/归档页、移动端单列堆叠

**质量门**
- Lighthouse a11y ≥ 95、控制台 0 error、yaml-check / typecheck / lint / build 全绿

---

## 13. 变更记录

### v1.1（2026-07-18，@Steven 决策，@Martin 确认）

- `--accent` 从 `#FF4D00` 调整为 **`#C03A00`**：原色值小字对比度 3.32:1 不达 WCAG AA 4.5:1（§8 与 §1.1 冲突）。中间方案 `#D64400` 实测白底 4.48:1 仍差 0.02，最终定为 `#C03A00`（白底 5.46:1、--bg 底 4.80:1，双底过 AA），保持「警报橙 → 印刷油墨」气质。
- 影响范围：nav 激活文字、日期、btn-primary、引用竖条、页码等所有 `--accent` 使用处。
- `--accent-alt` `#FFCE00` 不变，其余规范不变。

---

_spec v1.1。核心：高对比、硬边框、直角、快动效。_
