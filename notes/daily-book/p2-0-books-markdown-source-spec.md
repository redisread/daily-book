# daily-book P2-0：书籍数据源迁移 books.yaml → 每书一个 Markdown spec v0.1

> 状态：v0.1 草案，待评审
> 动机：Victor 提出「为什么加一本书不是加 markdown，而是在 yaml 中修改」
> 范围：数据源形态迁移；页面行为保持不变（除下述重复 id 修正和确定性排序）
> 设计：Codex

---

## 0. 一句话

**把唯一数据源从单一 `src/data/books.yaml` 改为 `src/data/books/<id>.md`：frontmatter 承载现有全部结构化字段，Markdown 正文预留为每日推荐内容。**

加载层 `src/data/books.ts` 对外 API 不变，首页 / 详情页 / 搜索 / Archive / RSS / 期号系统消费方式不动。

---

## 1. 现状与事实

- `src/data/books.yaml` 当前 124 条，124 条均已发布，123 个唯一 id、124 个唯一 `publishedDate`。
- [src/data/books.ts](/Users/victor/Desktop/project/github/daily-book/src/data/books.ts:4) 用 `books.yaml?raw` 加载，经过 `BookSchema` 校验后导出 `books`、`publishedHistory`、期号索引。
- [README.md](/Users/victor/Desktop/project/github/daily-book/README.md:78) 已明确“所有书籍数据集中在 `books.yaml`”，当前添加书籍的操作入口就是追加 YAML 条目。
- `books/*.md` 目前只有两期（07-03 / 07-04），全项目无代码引用，是历史发布物的副本，不是站点数据源。
- 现有数据已有一个真实 bug：`cognitive-awakening` id 被用了两次（05-02 与 07-04）。当前 `getBookById` 和期号索引都会先取/覆盖到 05-02，07-04 详情页实际展示的是 05-02 的内容。
- [AGENT_GUIDE.md](/Users/victor/Desktop/project/github/daily-book/AGENT_GUIDE.md:17) 仍停留在 `books.ts` 手写数组时代，与当前 YAML 流程已不一致。

---

## 2. 目标与边界

### 目标

1. 加一本书 = 新增一个 Markdown 文件，不再改共享 YAML。
2. 单数据源原则不变，不引入第二份可编辑数据。
3. 机器可读字段（发布历史、期号、金句）仍由 frontmatter 提供，并通过现有 Zod schema 卡口。
4. 迁移后 `npm run build`、`npm test`、`npm run typecheck` 全部通过，页面输出与迁移前一致（除下文明确列出的差异）。

### 不做什么

- ❌ 不改推荐算法、`publishedDate` 语义、期号派生规则。
- ❌ 不改 `BookCard` / `QuoteCard` / Archive / RSS / 搜索页的展示结构。
- ❌ 不做“每本书正文渲染”（见 §10 后续阶段）。
- ❌ 不清理 `the-storied-life-2026` 这类历史命名问题；它唯一且不破坏数据契约。
- ❌ 不处理用户未跟踪的 `scripts/validate-backfill.ts`。
- ❌ 不新增外部服务、不碰生产环境变量、不碰 Cloudflare 配置。

---

## 3. 目标文件规范

### 位置与命名

- 目录：`src/data/books/`
- 文件名：`<id>.md`
- 硬约束：**文件名必须等于 frontmatter 的 `id`**，加载时校验，防止“文件里写的是 A，文件名是 B”的漂移。
- 重复推荐同一本书时，按现有 `the-mythical-man-month-revisit` 惯例使用新 id，而不是重复旧 id。

### frontmatter 字段

字段与 `BookSchema` 对齐，新增可选 `body` 字段用于承载正文：

```yaml
---
id: new-book-id
title: "书名"
author: "作者"
category: "分类"
year: 2026
pages: 300
rating: 8.5
desc: "简介"
coverTitle: "书名"
coverAuthor: "作者简称"
publishedDate: null
editorNote: "编辑的话，40-100 字；老书可省略"
quotes:
  - text: "金句"
    page: "第10页"
---

## 推荐语

（Phase 2 渲染；Phase 1 仅保留，不进页面）
```

要点：

- `publishedDate` 为 `YYYY-MM-DD` 或 `null`，与现在完全一致。
- `quotes` 保持 `{ text, page }` 结构，1-10 条。
- `body` 为可选字符串，Phase 1 不渲染；两个存量 `books/*.md` 的推荐内容迁入对应文件 body。
- 新书必须写 `editorNote`；老书保留缺省。

---

## 4. 加载层设计

### 4.1 解析与校验

不新增依赖：项目已有 `js-yaml`，frontmatter 由迁移脚本生成 + `books:check` 卡口，用小型解析器即可。

```ts
function parseBookFile(raw: string, fileName: string): { book: Book; body: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) throw new Error(`缺少 frontmatter: ${fileName}`);

  const frontmatter = load(match[1]);
  const parsed = BookSchema.parse(frontmatter);
  if (fileName !== `${parsed.id}.md`) {
    throw new Error(`文件名与 id 不一致: ${fileName} !== ${parsed.id}.md`);
  }

  return { book: parsed, body: raw.slice(match[0].length).trim() };
}
```

### 4.2 批量加载

`src/data/books.ts` 从 `books.yaml?raw` 改为 Vite glob：

```ts
const bookModules = import.meta.glob<{ default: string }>("./books/*.md", {
  eager: true,
  query: "?raw",
  import: "default",
});

const bookFiles = Object.entries(bookModules).map(([key, raw]) =>
  parseBookFile(raw, key.split("/").pop()!)
);

export const books: Book[] = bookFiles
  .map(({ book, body }) => (body ? { ...book, body } : book))
  .sort(compareBooks);
```

### 4.3 排序规则

`books` 数组改为确定性排序：

1. `publishedDate` 非空优先；
2. `publishedDate` 按日期降序；
3. `null` 排最后；
4. 同日期按 `id` 字典序。

这是有意为之的行为变化：搜索页结果顺序从 YAML 手写顺序变为按日期/ id 的确定性顺序；未发布日期的 fallback 推荐输入顺序也会变化，但当前没有任何公开页面直接暴露 fallback 日期。

---

## 5. Schema 变更

`src/schemas/book.ts` 只加一个可选字段：

```ts
body: z.string().optional(),
```

理由：

- 现有数据全部合法，老书不写 body 也能过校验；
- 消费方（BookCard / RSS / searchBooks / books.json）不读取 body，Phase 1 零 UI 影响；
- Phase 2 渲染正文时无需再改加载层。

---

## 6. 迁移方案

### 6.1 前置数据修复

把 07-04 的重复 `cognitive-awakening` 改名为 `cognitive-awakening-revisit`（沿用 `the-mythical-man-month-revisit` 命名惯例）。

影响说明：

- 07-04 详情页从“错误展示 05-02 内容”变为“展示 07-04 自己的内容”，属于修 bug；
- 05-02 与 07-04 各自的期号从“被覆盖成同一个号”恢复为各自期号；
- 无 URL 变更（URL 按日期，不按 id）；当前代码已无 localStorage 消费 id。

### 6.2 迁移脚本

新增 `scripts/migrate-books-yaml-to-markdown.mjs`：

1. 读取 `src/data/books.yaml`；
2. `BookSchema.array()` 全量校验；
3. 校验 id 唯一、`publishedDate` 唯一；
4. 按 §3 规范生成 `src/data/books/<id>.md`，frontmatter 用 `js-yaml` dump，字段顺序与现在 YAML 一致；
5. 把 `books/2026-07-03.md` 内容写入 `island-bookstore.md` body，`books/2026-07-04.md` 内容写入 `cognitive-awakening-revisit.md` body；
6. 重新加载生成结果，断言与 YAML 输入解析出的 `books` 完全一致，输出迁移前后对比摘要；
7. 校验通过后才允许删除旧文件。

### 6.3 清理清单

迁移成功后删除/替换：

- `src/data/books.yaml`
- 根目录 `books/`（内容已迁入 body）
- `scripts/migrate-books.mjs`、`scripts/migrate-published-date.mjs`（旧迁移脚本已失效）
- `package.json` 的 `yaml-check`
- CI 两个 workflow 的 `npm run yaml-check`
- `vitest.config.ts` 里的 `yamlRawPlugin`（若 Markdown glob 在 Vitest 下原生可用；不可用则改为等价 md 插件）

> 删除文件属于本方案明确列出的范围，实施前按现有授权门禁确认。

---

## 7. 校验与 CI

### 7.1 新脚本

`package.json` 新增：

```json
"books:check": "tsx scripts/check-books.ts"
```

`scripts/check-books.ts` 检查：

- 每个 Markdown 能被解析并通过 `BookSchema`；
- 文件名 === id；
- id 全局唯一；
- `publishedDate` 非空值全局唯一；
- 期号索引与 `publishedHistory` 可构建。

### 7.2 CI 改动

`deploy.yml` 与 `deploy-preview.yml` 的 `YAML validation` 步骤改为 `npm run books:check`。

### 7.3 本地验证清单

```bash
npm run books:check
npm run typecheck
npm run lint
npm test
npm run build
```

构建后人工/自动化验证：

- `/` 显示最新发布《纹身人》（2026-08-02）；
- `/book/2026-07-04` 显示 07-04 的《认知觉醒》数据（重复 id 修复点）；
- `/archive`、`/search`、`/books.json`、`/rss.xml` 正常；
- 期号列表与迁移前一致（仅重复 id 修复导致的 05-02 / 07-04 期号变化）。

---

## 8. 风险与回滚

| 风险 | 等级 | 对策 |
| --- | --- | --- |
| `import.meta.glob` 在 Astro / Vitest 行为不一致 | 中 | 实施第一步先做 3 文件最小样例验证；失败则回退到显式 id 清单或 Astro Content Collections |
| frontmatter 转义问题（desc / quotes 含引号、冒号、换行） | 中 | 全部文件由脚本生成；`books:check` + 单测覆盖真实 124 条数据 |
| `books` 数组顺序变化 | 低 | §4.3 已明确为预期行为；验证搜索页与 fallback 不炸 |
| 重复 id 修复改变 07-04 展示 | 低 | 这是修 bug，验收清单显式覆盖该日期 |
| 删除 `books.yaml` 后手工备份丢失 | 低 | git 历史保留旧文件；回滚 = revert 合并 commit |

回滚路径：

- 未合并：关掉 PR，不产生生产影响；
- 已合并但未部署成功：生产仍是上一个 build；
- 已部署：revert PR commit，重新走 CI 部署；无数据库、无云资源、无环境变量变更。

---

## 9. 实施顺序

1. 数据修复：重命名重复 id，更新对应断言/验收基线；
2. 加载层最小验证：glob + frontmatter 解析 + 单测；
3. 迁移脚本生成 124 个 Markdown，数据 parity 断言；
4. 切换 `books.ts`，删除 YAML 与旧迁移脚本；
5. 更新 schema、CI、README、AGENT_GUIDE；
6. 全量验证 + 线上回归。

建议收敛为单个可审查 PR：数据源切换是原子变更，拆分两个 PR 会导致中间态双数据源漂移。

---

## 10. 后续阶段（不在本次范围）

Phase 2 可选：在 `/book/[date]` 渲染 `body` 为「推荐语」区块。

- 消费 `Book.body`；
- 引入 Markdown 渲染方案（如 `marked` + sanitize，或 Astro Markdown 组件）并补样式；
- 新书正文成为可运营内容，和 `editorNote` 分工：正文讲书，编辑的话讲“为什么今天选它”。

该阶段是否需要、何时做，由 Victor 单独拍板。
