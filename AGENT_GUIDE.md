# 每日一书 —— Agent 新增书籍操作指南

## 项目概览

「每日一书」是一个基于 Astro 的静态网站，部署在 Cloudflare Pages 上。每天推荐一本书籍，附带精选金句，并提供 RSS 订阅。

### 项目路径

```
/Users/victor/Desktop/project/github/daily-book
```

### 关键文件

| 文件 | 用途 |
|------|------|
| `src/data/books/` | **唯一需要编辑的数据目录**。每本书一个 `<id>.md`，frontmatter 存放结构化字段，正文暂不渲染 |
| `src/data/books.ts` | 加载器，从 Markdown 文件读取并导出书籍数据；不要手工编辑 |
| `src/schemas/book.ts` | BookSchema 字段契约 |
| `scripts/check-books.ts` | 数据完整性检查（id / publishedDate 唯一、文件名匹配） |
| `src/components/BookCard.astro` | 书籍主卡片组件 |
| `src/components/QuoteCard.astro` | 金句展示组件 |
| `src/components/HistoryGrid.astro` | 往期推荐网格组件 |
| `src/pages/index.astro` | 首页 |
| `src/pages/archive.astro` | 往期回顾页 |
| `src/pages/book/[date].astro` | 每日详情页 |
| `src/pages/rss.xml.ts` | RSS 订阅源 |

---

## 新增一本书的完整步骤

### 第 1 步：准备书籍信息

| 字段 | 说明 | 示例 |
|------|------|------|
| `id` | 英文短横线连接的唯一标识符，必须与文件名一致 | `brave-new-world` |
| `title` | 书名 | `美丽新世界` |
| `author` | 作者全名 | `阿道司·赫胥黎` |
| `category` | 分类标签 | `反乌托邦` |
| `year` | 首次出版年份（数字） | `1932` |
| `pages` | 页数（数字） | `288` |
| `rating` | 评分（数字） | `9.1` |
| `desc` | 一段话简介 | `赫胥黎描绘了一个...` |
| `coverTitle` | 封面显示的书名 | `美丽新世界` |
| `coverAuthor` | 封面显示的作者简称 | `赫胥黎` |
| `publishedDate` | `YYYY-MM-DD` 或 `null` | `null` |
| `editorNote` | 编辑的话，40-100 字；新书必填 | 见下方模板 |
| `quotes` | 1-10 条金句，每条含 `text` 和 `page` | 见下方模板 |

### 第 2 步：新增 Markdown 文件

创建 `src/data/books/<id>.md`，文件名必须等于 frontmatter 的 `id`：

```markdown
---
id: brave-new-world
title: 美丽新世界
author: 阿道司·赫胥黎
category: 反乌托邦
year: 1932
pages: 288
rating: 9.1
desc: 赫胥黎描绘了一个科技高度发达的未来社会，人类被基因工程和条件反射训练分为五个等级，用索麻麻痹自己，在舒适中丧失了自由、情感和思考的能力。
coverTitle: 美丽新世界
coverAuthor: 赫胥黎
publishedDate: null
editorNote: 这句话用于说明今天为什么选这本书，长度 40-100 字。
quotes:
  - text: 人们感到痛苦的不是他们用笑声取代了思考，而是他们不知道自己为什么笑以及为什么不再思考。
    page: 第三章
  - text: 一个人被真相伤害，总比被谎言安慰要好。
    page: 第十五章
---
```

正文可以放在 frontmatter 之后的 Markdown 区域，当前不会渲染到页面。

### 第 3 步：验证

```bash
npm run books:check
npm run typecheck
npm test
npm run build
```

构建成功即代表数据通过加载和校验。

---

## 注意事项与约束

1. **`id` 必须全局唯一**，文件名必须等于 `id`。重复推荐同一本书时，使用 `-revisit` 后缀新建 id，例如 `cognitive-awakening-revisit`。
2. **`publishedDate` 非空值必须全局唯一**，同一日期不能有两本书。
3. **`desc` 和 `quotes[].text` 中不要使用 ASCII 双引号 `"`**，用中文引号「」或书名号《》代替。
4. **`quotes` 至少 1 条、最多 10 条**，建议 5 条；第 1 条作为主金句展示。
5. **`year`、`pages`、`rating` 是数字**，不要加引号。
6. **`editorNote` 40-100 字**，新书必填；老书缺省不渲染。
7. **`body` 暂不渲染**，Phase 2 再接入页面。

### 发布书籍

新书 `publishedDate` 两种取法：

- `null` —— 待发布，稍后由人工定日期。
- 北京时间当前日期 —— 直接发布。取值用 `TZ=Asia/Shanghai date +%Y-%m-%d`，勿用 `new Date()`（构建环境 UTC 会差一天）。填前 `npm run books:check` 会拦截重复日期。

### 推荐算法说明

系统根据日期与书籍数据派生每日推荐。新增书籍会改变 `books.length`，从而改变部分日期推荐结果；这是预期行为，静态站点每次构建都会重新生成所有页面。

---

## 快速检查清单

- [ ] 文件名与 `id` 一致
- [ ] `id` 全局唯一
- [ ] `publishedDate` 非空值唯一
- [ ] `desc` 和 `quotes[].text` 中没有 ASCII 双引号 `"`
- [ ] `quotes` 有 1-10 条
- [ ] `year` / `pages` / `rating` 是数字
- [ ] 新书有 40-100 字的 `editorNote`
- [ ] `npm run books:check`、`npm run typecheck`、`npm test`、`npm run build` 全部通过
