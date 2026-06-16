# Daily Book - 每日之书

一个基于 Astro 构建的静态阅读记录网站，部署在 Cloudflare Workers 上。

## ✨ 功能特点

- 📚 **阅读记录管理** - 记录每日阅读内容
- 🔍 **全文搜索** - 快速检索阅读历史
- 📱 **响应式设计** - 适配各种设备
- 🌐 **RSS 订阅** - 支持内容订阅
- ⚡ **极速加载** - 静态生成 + Cloudflare 边缘部署
- 🏥 **健康检查** - `/health.json` 端点监控服务状态

## 🏗️ 项目结构

```text
/
├── public/              # 静态资源
├── src/
│   ├── components/      # Astro 组件
│   ├── data/            # 数据文件
│   ├── layouts/         # 页面布局
│   └── pages/           # 页面路由
├── .github/workflows/   # CI/CD 配置
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

# 访问 http://localhost:4321
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
| `npm run dev` | 启动本地开发服务器 (`localhost:4321`) |
| `npm run build` | 构建生产版本到 `./dist/` |
| `npm run preview` | 本地预览构建结果 |
| `npm run typecheck` | TypeScript 类型检查 |
| `npm run lint` | ESLint 代码检查 |

## 🔄 CI/CD

项目配置了两套 GitHub Actions 工作流：

### Preview 部署（PR 触发）
- 代码质量检查（typecheck + lint）
- 安全扫描（npm audit）
- 部署到预览环境
- 自动评论预览 URL

### Production 部署（push main 触发）
- 质量门禁（quality job）
- 安全门禁（security job）
- Bundle 大小检查（warn: 5MB, fail: 10MB）
- 部署到生产环境

## 🛠️ 技术栈

- **框架**: [Astro](https://astro.build) 6.x
- **部署**: [Cloudflare Workers](https://workers.cloudflare.com)
- **CI/CD**: GitHub Actions
- **语言**: TypeScript

## 📄 许可证

MIT
# CI Test
