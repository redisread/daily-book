# Daily Book - 每日之书

一个基于 Astro 构建的 Cloudflare-native 全栈阅读应用。页面与内容接口优先预渲染为 Workers Static Assets，运行时端点由同一个 Cloudflare Worker 按需处理。

## ✨ 功能特点

- 📚 **阅读记录管理** - 记录每日阅读内容
- 🔍 **全文搜索** - 快速检索阅读历史
- 📱 **响应式设计** - 适配各种设备
- 🌐 **RSS 订阅** - 支持内容订阅
- ⚡ **混合渲染** - 内容页使用 SSG，动态能力使用 Worker SSR/API
- 🏥 **运行时健康检查** - `/health.json` 直接验证 Astro Worker

## 🏗️ 项目结构

```text
/
├── public/              # 静态资源
├── src/
│   ├── components/      # Astro 组件
│   ├── data/
│   │   ├── books/       # 每本书一个 Markdown 文件（唯一数据源）
│   │   └── books.ts     # 数据加载层
│   ├── layouts/         # 页面布局
│   └── pages/           # 页面路由
├── .github/workflows/   # CI/CD 配置
├── wrangler.jsonc       # 生产 Worker、Static Assets 与域名配置
├── wrangler.preview.jsonc # PR 预览 Worker 配置
└── package.json
```

## 🚀 快速开始

### 环境要求

- Node.js 22+
- npm 或 pnpm

### 安装

```bash
# 克隆仓库
git clone https://github.com/redisread/daily-book.git
cd daily-book

# 安装依赖
npm install
```

### 本地开发

```bash
# 启动开发服务器
npm run dev

# 访问 http://localhost:5445
```

### 构建部署

```bash
# 构建生产版本
npm run build

# 本地预览构建结果
npm run preview
```

## 📋 可用命令

| 命令 | 说明 |
| :--- | :--- |
| `npm install` | 安装依赖 |
| `npm run dev` | 启动本地开发服务器 (`localhost:5445`) |
| `npm run build` | 构建生产版本到 `./dist/` |
| `npm run preview` | 本地预览构建结果 |
| `npm run cf:types` | 从 wrangler.jsonc 生成 Cloudflare 绑定类型 |
| `npm run cf:types:check` | 检查 Cloudflare 绑定类型是否最新 |
| `npm run deploy:dry-run` | 构建并执行 Wrangler 部署预检，不上传 |
| `npm run deploy` | 构建并部署生产 Worker |
| `npm run books:check` | 校验书籍 Markdown 数据完整性与唯一性 |
| `npm run typecheck` | TypeScript 类型检查 |
| `npm run lint` | ESLint 代码检查 |

## 📖 添加每日一书

每本书是一个 Markdown 文件：`src/data/books/<id>.md`，frontmatter 存放结构化字段，字段说明：

| 字段 | 说明 | 示例 |
| :--- | :--- | :--- |
| `id` | 唯一标识，kebab-case | `百年孤独` → `hundred-years-of-solitude` |
| `title` | 书名 | `百年孤独` |
| `author` | 作者 | `加西亚·马尔克斯` |
| `category` | 分类 | `魔幻现实主义` |
| `year` | 出版年份 | `1967` |
| `pages` | 页数 | `360` |
| `rating` | 评分（1-10） | `9.3` |
| `desc` | 简介 | `《百年孤独》...` |
| `coverTitle` | 封面显示的书名（可简化） | `百年孤独` |
| `coverAuthor` | 封面显示的作者（可简化） | `马尔克斯` |
| `publishedDate` | 发布日期 `YYYY-MM-DD`，未发布为 `null` | `2026-06-21` 或 `null` |
| `editorNote` | 编辑的话，40-100 字，新书必填 | `今天选这本书是因为...` |
| `quotes` | 金句列表，每条含 `text` 和 `page` | 至少 1 条，最多 10 条 |

### 添加新书

1. 新建 `src/data/books/<id>.md`，文件名必须等于 frontmatter 的 `id`：

```markdown
---
id: new-book-id
title: 书名
author: 作者
category: 分类
year: 2026
pages: 300
rating: 8.5
desc: 简介内容
coverTitle: 书名
coverAuthor: 作者简称
publishedDate: null
editorNote: 编辑的话，40-100 字
quotes:
  - text: 金句内容
    page: 第10页
---
```

2. 运行质量检查：

```bash
npm run books:check
npm run typecheck
npm test
```

3. 提交并推送，发布 PR。

### 发布书籍

新书 `publishedDate` 两种取法：

- `publishedDate: null` —— 待发布，稍后由人工定日期。
- 北京时间当前日期 —— 直接发布。取值用 `TZ=Asia/Shanghai date +%Y-%m-%d`，勿用 `new Date()`（构建环境 UTC 会差一天）。`npm run books:check` 会拦截重复日期。

将文件里的 `publishedDate: null` 改为实际日期（如 `2026-06-21`），运行 `npm run books:check` 确认无重复后推送，自动部署。

## 🔄 CI/CD

项目配置了两套 GitHub Actions 工作流：

### Preview 部署（PR 触发）
- 代码质量检查（typecheck + lint）
- 安全扫描（npm audit）
- 无凭据构建并校验 preview Worker，产物保留 1 天
- 配置预览凭据与开关后，将已验证产物部署到预览环境
- 自动评论预览 URL
- PR 关闭后自动清理对应的 `daily-book-pr<number>` Worker

### Production 部署（push main 触发）
- 质量门禁（书籍数据、类型、Wrangler 类型、lint、单元测试）
- 安全门禁（security job）
- Chromium 端到端测试（含 Worker 运行时健康检查）
- Bundle 大小检查（warn: 5MB, fail: 10MB）
- Wrangler dry-run 通过后部署到生产环境

仓库 Actions Secrets 需要配置 `CLOUDFLARE_ACCOUNT_ID`、生产专用的 `CLOUDFLARE_API_TOKEN`，以及仅能管理预览 Worker 的 `CLOUDFLARE_PREVIEW_API_TOKEN`。PR 预览默认关闭；只有将仓库 Actions Variable `CLOUDFLARE_PREVIEW_ENABLED` 设置为 `true` 后才会部署和清理预览 Worker。合并 PR 到 `main` 后，`push` 事件会自动触发生产部署；如需恢复旧版本，可从 `main` 手动运行 `Rollback Production` 工作流并填写 Cloudflare Worker version ID。

## 🛠️ 技术栈

- **框架**: [Astro](https://astro.build) 7.x（Cloudflare adapter）
- **部署**: [Cloudflare Workers](https://workers.cloudflare.com)
- **CI/CD**: GitHub Actions
- **语言**: TypeScript

## 📄 许可证

MIT
