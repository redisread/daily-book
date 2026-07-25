# daily-book P1 刊物化收尾 spec v1.1

> 编辑的话（editorNote）+ 今日已阅印章
> 立项：task #43（2026-07-25，Victor 授权 Steven 决策「你决策，我只要你给我一个结果」msg=cd3d7750）
> 上游：daily-book UX 分析 v1.0（`notes/daily-book-ux-analysis.md`，task #19 done）P1 项「策展语 + 峰终点」
> 作者：@Steven｜内容协同：@卢曼｜CR：@Martin｜实现：@Jeff
> **v1.1（Martin CR 正式 PASS，msg=1a6dced3）**：R1 契约放宽 40–100 + 样张修订（87/89 字复核）+ 禁 emoji 条款 + §3.2 read-at 写入位置显式化（函数内部成功分支）

---

## 0. 一句话

**刊物主题的最后两块拼图：策展人声音（编辑的话）+ 阅读仪式（已阅印章）。** 前者让每期有「人」在说话，后者把「看完一期」从一次点击变成一个盖章动作。

---

## 1. 背景

- 产品主题「印刷时代的每日刊物——每天派送一本书」（UX 分析定调，Victor 圈 A 方案）
- P0 全套已上线（2026-07-22 收官，27/27 验收 PASS）：期号 / 书架 / 金句本 / 分享图水印
- P0 收官后主题仍缺两块：**刊物里没有编辑的声音**（全是书摘，无策展人）；**阅读动作没有仪式**（「标记已读」= toast + 按钮置灰，无记忆点）
- 卢曼 2026-07-24 到岗（内容运营 / 每日一书全流程），策展人声音有了 owner → P1 从 blocked 转为可立项

**范围**：2 个特性，1 个 zod 字段新增，0 DB 变更，0 迁移。
**不做**（§7 out of scope）：RSS 注入 editorNote、HistoryGrid 印章、老书补 editorNote、取消已读交互。

---

## 2. 特性 A：编辑的话（editorNote）

### 2.1 内容契约（已与卢曼对齐，msg=2d60a167）

- **来源**：从卢曼每日书摘的「对今天的映射」段抽核心句，无额外创作成本
- **必填性**：**每期必有**（报纸不开天窗），自新期起生效
- **字数**：**40–100 字**（zod `max(100)` 卡口；Martin CR R1 修正：原契约 40–80 与样张实际体量矛盾，放宽至 40–100）
- **禁用 emoji**：zod length 按 UTF-16 计，一个 emoji 算 2 字，避免隐形超支（Martin CR 附注，卢曼已确认）
- **语气**：策展人第一人称判断——为什么今天选这本 / 它和当下什么呼应；不是书评、不是摘要重复

**样张锚定**（卢曼修订版，msg=16be9c3b；JS UTF-16 length 一手复核：7-24=87 字、7-25=89 字，均 ≤100 无 emoji）：

> 7-24《人月神话》：Brooks 的外科手术团队与我们的 agent harness 惊人相似：一个主刀、一群助手、规则是作者不审自己的稿。五十年前的组织智慧，正好理解今天的 agent 团队。

> 7-25《反脆弱》：本周反复出现一条主线：克制不是软弱，而是结构性的冗余。DeepSeek 开源、Addy 保留审查点、Uncle Bob 用约束替代读 diff——Taleb 统称「反脆弱设计」。

### 2.2 数据层

- `src/schemas/*.ts` 的 `BookSchema` 新增：
  ```ts
  editorNote: z.string().min(1, "编辑的话不能为空").max(100, "编辑的话最多 100 字").optional()
  ```
- `src/data/books.yaml`：7-24 / 7-25 两期按 §2.1 样张落入 `editorNote` 字段；此后每期由卢曼供稿（随书摘流程，Victor 终批）
- **老书不补**：`optional` 字段，老数据无此键向后兼容，`publishedHistory` 期号推导不受影响（Jeff 已核实，msg=43ba8804）

### 2.3 展示

- **位置**：`BookCard.astro` 书籍信息列，`book-desc` 之后、`book-meta-inline` 之前
- **结构**：
  ```html
  <aside class="editor-note" aria-label="编辑的话">
    <div class="editor-note-label">编辑的话</div>
    <p class="editor-note-text">{book.editorNote}</p>
  </aside>
  ```
- **条件渲染**：`book.editorNote` 缺失（老书）→ 区块整体不渲染，无占位、无空态文案
- **视觉**（Neo Brutalism 体系内，token 沿用 neo-brutalism spec）：
  - 容器：2px solid 主边框色，背景用卡片底色，`box-shadow: 4px 4px 0` 硬阴影（与站内卡片同语言）
  - label：小号粗体大写字距「编辑的话」，左侧配 ✎ 或「——」装饰线
  - 正文：`font-size` 同 desc 或 -1 档，行高 1.7
  - 与 desc 的区分：desc 是「书的简介」（关于书），editorNote 是「编辑在说话」（关于今天）——视觉上 desc 裸排、editorNote 装盒

---

## 3. 特性 B：今日已阅印章

### 3.1 现状（一手核实）

- `BookCard.astro` 已有「标记已读」按钮（`data-action="markRead"`），`initBookActions` 接线
- 点击后：`markAsRead` 写 storage → toast「已标记为已读」→ 按钮文案「已读」+ disabled
- **功能完整，零仪式**——这就是峰终定律里缺失的「终」

### 3.2 设计

**隐喻**：图书馆还书日期章 / 邮戳。盖在封面上，带日期，歪一点（盖章从不是正的）。

- **视觉**：圆形印章，直径 ≈ 封面宽 38%，定位于**封面右上角**（部分溢出封面边缘，像真章盖在书角）
  - 外圈 2.5px 圆环 + 内圈细圆环，红色系印章色（建议 `var()` 体系内品牌红，与 P0-4 水印 `#C03A00` 同族）
  - 文案两行：上行「已阅」大字粗体，下行日期 `MM/DD`
  - 整体 `transform: rotate(-12deg)`，半透明（opacity 0.9），`mix-blend-mode: multiply` 让章「吃进」封面纸感
- **动效**：点击「标记已读」→ 印章 `scale(1.4) opacity(0)` → `scale(1) opacity(0.9)`，180ms ease-out，一次性，不循环
- **状态源**：
  - 显隐：`isRead(bookId)`（P0-0 reads）+ 订阅 `daily-book:storage:changed`（key=reads）跨 tab 同步
  - 已读后刷新页面：SSR HTML 不含印章，client 端 hydration 后渲染（印章节点初始 `hidden`，JS 判定后显示 + 播动效仅当次标记时；刷新恢复显示**不播动效**）
- **日期来源（关键决策）**：P0-0 reads 是纯 bookId 数组，**无时间戳**（一手核实 `storage.ts` `markAsRead`）
  - 方案：新增 `daily-book:read-at` key（JSON map `{[bookId]: timestamp}`），`markAsRead` / `unmarkAsRead` 双写
  - **写入位置（Martin CR 显式化）**：read-at 的写/删必须挂在 `markAsRead` / `unmarkAsRead` **函数内部的成功分支**（markAsRead 对已读 bookId 返回 false 不写 → read-at 同样不写），禁止在调用侧散写
  - **降级规则**：印章显示日期以 `read-at[bookId]` 为准；缺失（老数据 / 双写漂移）→ 降级只显示「已阅」无日期
  - 一致性裁定：reads 为唯一事实源（印章显隐跟 reads），read-at 仅为展示装饰，漂移不影响功能
  - 不选 reads 改对象数组方案：P0-0 刚做完 title→id 迁移，不再动存量结构

### 3.3 边界

- 未读 → 无印章、按钮现状（「标记已读」可点）
- 已读 → 印章 + 按钮「已读」disabled（现状保留）
- 取消已读：现 UI 无入口（按钮 disabled 后不可逆），书架页管理交互不在本 spec（§7）
- 印章不遮挡封面 lightbox 点击区（`pointer-events: none`）

---

## 4. Wireframe

tldraw 线框：`outputs/p1-editor-note-read-seal-wireframe-v1.png`（随 spec 附 Slock 附件）。
两个区块标注：① BookCard 信息列 editorNote 装盒位置；② 封面右上角印章定位 + 旋转角。

## 5. 验收标准

**特性 A**
1. 7-24 期书籍页显示「编辑的话」区块，文案与 §2.1 样张逐字一致（**v1.1 口径修正**：books.yaml 尚无 7-25《反脆弱》条目——入库即发布挂 Victor 终批；7-25 的 editorNote 随条目入库时带入并届时验收，Martin msg=88b2cf2e）
2. 区块位于 desc 与 meta 行之间，视觉与 Neo Brutalism 卡片语言一致（硬边框 + 硬阴影）
3. 无 editorNote 的老书页面：区块完全不渲染（DOM 无节点）
4. yaml 中 editorNote 超 100 字 → 构建期 zod 校验报错
5. 移动端（375px）区块不破版

**特性 B**
6. 点击「标记已读」→ 印章盖出（动效 180ms）+ 按钮变「已读」disabled（现状不回归）
7. 印章含「已阅」+ 当日 `MM/DD`，rotation -12°，封面右上角
8. 已读状态刷新页面 → 印章仍在，**不重播**动效
9. 另一 tab 标记已读 → 本 tab 印章同步出现（onStorageChange）
10. 老数据（无 read-at 记录）已读书 → 印章降级显示「已阅」无日期，不报错
11. 印章不遮挡封面点击放大（lightbox 正常）

**通用**
12. `pnpm build` 通过；现有 27 项 P0 验收点不回归（重点：书架已读 tab、金句本、期号）

## 6. 任务拆分建议

| 任务 | 内容 | 工作量 |
|---|---|---|
| T1 | BookSchema + yaml 两期样张 + BookCard editorNote 区块（含视觉） | S |
| T2 | read-at 双写 + 印章组件 + 动效 + onStorageChange 订阅 | S |

T1/T2 无依赖，可并行；建议一个 PR 两 commit（参照 P1-1 #413 模式）。

## 7. Out of scope

- RSS 注入 editorNote（刊物派送感的合理延伸，挂 backlog 待评）
- HistoryGrid / 书架卡的印章显示（先验证详情页仪式成立，再谈扩散）
- 老书回填 editorNote（卢曼只供新期）
- 取消已读交互（需连同书架管理一起设计，不单开）
- i18n（中文站，沿用 P0-1 裁定）

---

_v1.0 2026-07-25 @Steven。事实基线：BookSchema（zod, src/schemas）/ books.yaml / BookCard.astro / storage.ts markAsRead（reads 无时间戳一手核实）/ P0-0 事件层 onStorageChange。_
