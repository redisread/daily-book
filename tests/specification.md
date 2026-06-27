# daily-book 功能规范电子表格

> 真相来源：代码库功能发现结果
> 生成时间：2026-06-23

---

## F01 — 首页（今日推荐）

| 字段 | 内容 |
|---|---|
| **Feature ID** | F01 |
| **Feature Name** | 首页（今日推荐） |
| **文件** | `src/pages/index.astro` |
| **路由** | `/` |
| **User Story** | 作为访客，我想看到当日推荐的书籍，包括书籍封面、详情、金句和往期回顾，以便发现值得阅读的好书。 |
| **Expected Behaviour** | 展示最新发布的一本书（`getLatestPublishedBook()`），包含日期栏、BookCard、QuoteCard、HistoryGrid(6天) |
| **Edge Cases** | 1. publishedHistory 为空 → 回退到日期哈希轮播模式 (`getTodayBook()`) 2. 发布历史第一条的 bookId 无效 → 跳过并尝试下一条 3. 全部无效 → 回退到 getTodayBook() |
| **Validation Rules** | 1. publishedHistory 中每条记录 date 必须是 YYYY-MM-DD 格式 2. bookId 必须对应 books 中的有效 id |
| **Dependencies** | F13(publishedHistory), F14(books), F09(BookCard), F10(QuoteCard), F11(HistoryGrid), F12(Layout) |

---

## F02 — 往期归档

| 字段 | 内容 |
|---|---|
| **Feature ID** | F02 |
| **Feature Name** | 往期归档 |
| **文件** | `src/pages/archive.astro` |
| **路由** | `/archive` |
| **User Story** | 作为访客，我想查看近 30 天的发布历史，按日期倒序排列，以便回顾之前的推荐。 |
| **Expected Behaviour** | 展示 `getPublishedBooks(30)` 返回的 30 条最近发布记录，每张卡片显示日期、书名、作者、金句摘要 |
| **Edge Cases** | 1. publishedHistory 少于 30 条 → 显示全部已有记录（无空位） 2. publishedHistory 为空 → 回退到 `getRecentBooks(30)`（日期哈希轮播） |
| **Validation Rules** | - |
| **Dependencies** | F13(publishedHistory), F14(books), F12(Layout) |

---

## F03 — 搜索书籍

| 字段 | 内容 |
|---|---|
| **Feature ID** | F03 |
| **Feature Name** | 搜索书籍 |
| **文件** | `src/pages/search.astro` |
| **路由** | `/search` |
| **User Story** | 作为访客，我想按书名、作者搜索或按分类筛选书籍，以便快速找到感兴趣的书。 |
| **Expected Behaviour** | 1. 默认展示全部 87 本书的网格 2. 输入搜索关键词 → 实时过滤（匹配书名或作者） 3. 点击分类按钮 → 只显示该分类的书 4. 搜索 + 分类可组合过滤 5. 无匹配 → 显示空状态提示 |
| **Edge Cases** | 1. 搜索关键词为空 → 显示全部书籍 2. 关键词仅空格 → trim 后为空 → 显示全部 3. 大小写不敏感（toLowerCase 转换） 4. 搜索+分类组合后无结果 → 空状态 |
| **Validation Rules** | 搜索匹配：书名或作者包含关键词（case-insensitive） |
| **Dependencies** | F14(books), F15(分类), F12(Layout), F13(bookDateMap 用于生成链接) |

---

## F04 — 书籍详情页

| 字段 | 内容 |
|---|---|
| **Feature ID** | F04 |
| **Feature Name** | 书籍详情页 |
| **文件** | `src/pages/book/[date].astro` |
| **路由** | `/book/:date` |
| **User Story** | 作为访客，我想查看某一天推荐的具体书籍，包括完整卡片、金句和往期推荐。 |
| **Expected Behaviour** | 根据日期参数渲染该天的 BookCard + QuoteCard + HistoryGrid(6天)，包含 JSON-LD 结构化数据 |
| **Edge Cases** | 1. 无效日期参数 → 取决于 Astro 路由，无 getStaticPaths 覆盖的返回 404 2. getStaticPaths 只覆盖 publishedHistory 中的日期，不覆盖哈希生成的日期 |
| **Validation Rules** | 日期参数必须 YYYY-MM-DD 格式，且存在于 getStaticPaths 返回中 |
| **Dependencies** | F13, F14, F09, F10, F11, F12 |

---

## F05 — 404 页面

| 字段 | 内容 |
|---|---|
| **Feature ID** | F05 |
| **Feature Name** | 404 页面 |
| **文件** | `src/pages/404.astro` |
| **路由** | 任何未匹配路由 |
| **User Story** | 作为访客，当访问不存在的页面时，看到友好的 404 提示和首页链接。 |
| **Expected Behaviour** | 显示"页面未找到"提示 + 返回首页按钮 |
| **Edge Cases** | - |
| **Validation Rules** | - |
| **Dependencies** | F12(Layout) |

---

## F06 — RSS Feed

| 字段 | 内容 |
|---|---|
| **Feature ID** | F06 |
| **Feature Name** | RSS Feed |
| **文件** | `src/pages/rss.xml.ts` |
| **路由** | `/rss.xml` |
| **User Story** | 作为订阅者，我可以通过 RSS 阅读器订阅每日一书，获取最新 30 本书的更新。 |
| **Expected Behaviour** | 输出 RSS 2.0 XML，包含最近 30 条发布记录，每条含标题、发布日期、链接、描述（书名+作者+分类+金句）、分类标签 |
| **Edge Cases** | 1. publishedHistory 为空 → 回退到 getRecentBooks(30)（日期哈希轮播） 2. 发布不足 30 条 → 显示全部 |
| **Validation Rules** | site 必须为完整 URL |
| **Dependencies** | F13, F14 |

---

## F07 — 搜索数据 JSON

| 字段 | 内容 |
|---|---|
| **Feature ID** | F07 |
| **Feature Name** | 搜索数据 JSON |
| **文件** | `src/pages/books.json.ts` |
| **路由** | `/books.json` |
| **User Story** | 作为前端搜索功能，我可以通过 JSON 接口获取全部书籍数据（含日期映射），以实现客户端搜索过滤。 |
| **Expected Behaviour** | 输出 JSON 数组，每本书含 id/title/author/category/coverBg/coverTitle/coverAuthor/desc/date |
| **Edge Cases** | 1. 某本书未在 publishedHistory 中找到日期 → date 回退为 book.id |
| **Validation Rules** | 输出为 UTF-8 JSON，Cache-Control: public, max-age=3600 |
| **Dependencies** | F14(books), F13(bookDateMap) |

---

## F08 — Health Check

| 字段 | 内容 |
|---|---|
| **Feature ID** | F08 |
| **Feature Name** | Health Check |
| **文件** | `src/pages/health.json.ts` |
| **路由** | `/health.json` |
| **User Story** | 作为运维，我想检查站点是否正常部署。 |
| **Expected Behaviour** | 输出 JSON: `{"status":"healthy","service":"daily-book","buildTime":"...","version":"0.0.1"}` |
| **Edge Cases** | build 时执行一次，不动态探活 |
| **Validation Rules** | Cache-Control: no-store |
| **Dependencies** | - |

---

## F09 — BookCard

| 字段 | 内容 |
|---|---|
| **Feature ID** | F09 |
| **Feature Name** | BookCard（书籍详情卡片） |
| **文件** | `src/components/BookCard.astro` |
| **Description** | 展示书籍封面、详细信息（分类、书名、作者、简介、出版年、页数、评分）和操作按钮（标记已读、收藏、RSS） |
| **Expected Behaviour** | 1. 左侧显示书籍封面（CSS 生成，可点击放大） 2. 右侧显示分类/书名/作者/简介/meta/操作按钮 3. 点击封面打开 lightbox 4. "标记已读"按钮使用 localStorage 存储 5. "收藏"按钮使用 localStorage 存储 |
| **Edge Cases** | 1. coverBg 为空/无效 → 显示默认背景 2. rating 不存在 → meta 不显示评分行 3. pages 不存在 → meta 不显示页数行 |
| **Validation Rules** | coverTitle/coverAuthor 使用 `set:text`（已修复 XSS），lightbox 中内容相同 |
| **Dependencies** | F14(book 数据), F16(lightbox.ts), F18(storage.ts) |

---

## F10 — QuoteCard

| 字段 | 内容 |
|---|---|
| **Feature ID** | F10 |
| **Feature Name** | QuoteCard（金句轮播） |
| **文件** | `src/components/QuoteCard.astro` |
| **Description** | 展示书籍金句，支持左右滑动切换、点赞、复制分享、生成分享图片。底部显示"更多金句"网格（最多 4 条） |
| **Expected Behaviour** | 1. 显示全部金句，通过 swipe 切换 2. 触摸/鼠标拖拽可滑动 3. 点击指示点可跳转 4. 点赞按钮切换 ♡/♥ 5. 分享按钮复制金句到剪贴板 6. 图片按钮打开弹窗 → 生成 Canvas 图片下载 7. 底部"更多金句"网格点击可跳转到对应金句 |
| **Edge Cases** | 1. 只有 1 条金句 → swipe 仍然可用（循环滚动到自身） 2. 无 quotes → 卡片无内容 |
| **Validation Rules** | 每条金句 text 和 page 不可为空（Zod 校验） |
| **Dependencies** | F17(quote-swipe.ts), F14(book 数据) |

---

## F11 — HistoryGrid

| 字段 | 内容 |
|---|---|
| **Feature ID** | F11 |
| **Feature Name** | HistoryGrid（往期推荐网格） |
| **文件** | `src/components/HistoryGrid.astro` |
| **Description** | 显示近几天的推荐记录网格，默认显示 6 条（skipToday=true 排除今天） |
| **Expected Behaviour** | 1. 调用 getPublishedBooks(days+1) 2. skipToday=true 时跳过第一条（今天） 3. 每条卡片显示短日期、书名、作者、金句摘要 |
| **Edge Cases** | 1. publishedHistory 不足请求数 → 显示全部可用 2. days=0 → 不显示任何卡片 |
| **Dependencies** | F13, F14 |

---

## F12 — Layout

| 字段 | 内容 |
|---|---|
| **Feature ID** | F12 |
| **Feature Name** | Layout（全局布局） |
| **文件** | `src/layouts/Layout.astro` |
| **Description** | 全局 HTML 结构：head(SEO/OG/JSON-LD/预连接) + 背景动画 + Header(导航) + main + Footer + 移动底栏 + Toast |
| **Expected Behaviour** | 1. 自动设置 title/description/OG/Twitter Card 2. 注入 JSON-LD (WebSite schema + 页面自定义) 3. 导航高亮当前页面 4. 移动端显示底栏导航 5. Toast 组件可用 |
| **Edge Cases** | 1. 默认 title/image 用于首页 2. 无 image 参数 → 使用默认 /og-image.png 3. jsonLd 可以为单个对象或数组 |
| **Validation Rules** | OG image 宽高固定 1200×630 |
| **Dependencies** | global.css |

---

## F13 — 发布历史管理

| 字段 | 内容 |
|---|---|
| **Feature ID** | F13 |
| **Feature Name** | 发布历史管理 |
| **文件** | `src/data/publishedHistory.ts` |
| **Description** | 手动维护的发布记录数组，按日期降序排列。每条记录 date(YYYY-MM-DD) + bookId |
| **Expected Behaviour** | 提供 PublishedEntry[]，87 条记录覆盖 2026-03-24 ~ 2026-06-18 |
| **Edge Cases** | 1. 空数组 → 各功能回退到日期哈希轮播模式 2. 重复 date 或 bookId 未定义行为（当前未校验） 3. bookId 不存在于 books 中 → getBookById 返回 undefined，会被过滤 |
| **Validation Rules** | 无运行时校验，全靠人工维护时确保一致性 |

---

## F14 — 书籍数据加载与校验

| 字段 | 内容 |
|---|---|
| **Feature ID** | F14 |
| **Feature Name** | 书籍数据加载与校验 |
| **文件** | `src/data/books.ts` + `src/data/books.yaml` + `src/schemas/book.ts` |
| **Description** | 从 books.yaml 加载书籍数据，通过 Zod schema 校验（id/title/author/category/year/pages/rating/desc/coverBg/coverTitle/coverAuthor/quotes），导出供各组件使用 |
| **Expected Behaviour** | 1. 启动时从 YAML 解析并 Zod 校验 2. 校验失败直接抛出异常阻止构建 3. 提供 getPublishedBooks/getLatestPublishedBook/getRecentBooks/getBookForDate/getTodayBook 等查询函数 |
| **Edge Cases** | 1. YAML 格式错误 → js-yaml 解析失败 2. 校验失败 → throw error 阻止构建 3. 空书籍数组 → 各种查询返回空/undefined |
| **Validation Rules** | id: kebab-case, title/author/category/desc/coverBg/coverTitle/coverAuthor: min(1), year: integer, pages: positive int, rating: positive, quotes: 1~10 条 |

---

## F15 — 搜索/分类逻辑

| 字段 | 内容 |
|---|---|
| **Feature ID** | F15 |
| **Feature Name** | 搜索与分类逻辑 |
| **文件** | `src/data/books.ts` (searchBooks, getAllCategories) |
| **Description** | 服务端：`searchBooks(query)` 按书名/作者搜索；`getAllCategories()` 返回所有分类 |
| **Expected Behaviour** | searchBooks: 空查询返回全部；否则 filter title 或 author 包含 query(case-insensitive) getAllCategories: 返回去重排序的分类列表 |
| **Edge Cases** | 空 query → 全部；无匹配 → 空数组 |

---

## F16 — 封面 Lightbox

| 字段 | 内容 |
|---|---|
| **Feature ID** | F16 |
| **Feature Name** | 封面 Lightbox 交互 |
| **文件** | `src/scripts/lightbox.ts` |
| **Description** | 点击封面放大全屏查看，点击背景/ESC/关闭按钮退出 |
| **Expected Behaviour** | 1. 点击封面 → 添加 active class + body overflow hidden 2. 点击背景/关闭/ESC → 移除 active class |
| **Edge Cases** | 多个 lightbox 同时存在 → 最后一个覆盖（当前只有 1 个） |
| **Validation Rules** | - |
| **Dependencies** | F09(BookCard) |

---

## F17 — 金句轮播/分享/图片生成

| 字段 | 内容 |
|---|---|
| **Feature ID** | F17 |
| **Feature Name** | 金句交互（轮播/分享/图片生成） |
| **文件** | `src/scripts/quote-swipe.ts` |
| **Description** | 金句左右滑动切换 + 点赞 + 复制分享 + 图片生成下载 + 迷你金句跳转 |
| **Expected Behaviour** | 1. 触摸/鼠标拖拽滑动切换金句 2. 点赞 toggle ♡↔♥ 3. 复制按钮写入剪贴板 4. "生成图片"按钮打开 Canvas 预览并下载 1080×1080 PNG |
| **Edge Cases** | 1. 无金句 → initQuoteSwipe return 2. 拖拽距离 < 50px → 不切换 3. clipboard API 不可用 → 静默失败 4. Canvas 生成失败 → 静默失败 5. 图片弹窗 ESC 或点击背景关闭 |
| **Validation Rules** | - |
| **Dependencies** | F10(QuoteCard) |

---

## F18 — 已读/收藏本地存储

| 字段 | 内容 |
|---|---|
| **Feature ID** | F18 |
| **Feature Name** | 已读/收藏本地存储 |
| **文件** | `src/scripts/storage.ts` |
| **Description** | 使用 localStorage 存储"标记已读"和"收藏"状态 |
| **Expected Behaviour** | 1. markAsRead: 添加书名到 dailybook_read 数组，重复添加返回 false 2. toggleCollection: 切换 dailybook_collections 数组状态 3. initBookActions: 绑定按钮事件 + 初始化收藏按钮样式 |
| **Edge Cases** | 1. localStorage 满/禁用 → JSON.parse 异常 → 返回空数组 |
| **Validation Rules** | - |

---

## F19 — Astro 构建配置

| 字段 | 内容 |
|---|---|
| **Feature ID** | F19 |
| **Feature Name** | Astro 构建配置 |
| **文件** | `astro.config.mjs` |
| **Description** | Astro 配置：site URL + sitemap 集成 + 开发端口 5445 |
| **Expected Behaviour** | build 输出到 dist/，生成 sitemap.xml |
| **Edge Cases** | - |
| **Validation Rules** | - |

---

## F20 — Playwright E2E 测试

| 字段 | 内容 |
|---|---|
| **Feature ID** | F20 |
| **Feature Name** | Playwright E2E 测试 |
| **文件** | `playwright.config.ts`, `tests/` |
| **Description** | E2E 测试：首页/搜索/RSS+books.json/归档导航（9 个用例） |
| **Expected Behaviour** | `npm run test:e2e` → 9 passed |
| **Edge Cases** | - |
| **Validation Rules** | - |

---

## F21 — GitHub Actions CI/CD

| 字段 | 内容 |
|---|---|
| **Feature ID** | F21 |
| **Feature Name** | GitHub Actions CI/CD |
| **文件** | `.github/workflows/` |
| **Description** | CI pipeline: 构建 + 每日 cron 自动部署 |
| **Expected Behaviour** | push 触发构建，每天 UTC 16:00 (China 00:00) 自动构建部署 |
| **Edge Cases** | - |
| **Validation Rules** | - |

---

## F22 — Cloudflare Pages 部署

| 字段 | 内容 |
|---|---|
| **Feature ID** | F22 |
| **Feature Name** | Cloudflare Pages 部署 |
| **Description** | 通过 wrangler 部署到 Cloudflare Pages，域名 daily-book.jiahongw.com |
| **Edge Cases** | 预览部署因 API token 权限可能失败 |
| **Validation Rules** | - |

---

## F23 — wrangler 配置

| 字段 | 内容 |
|---|---|
| **Feature ID** | F23 |
| **Feature Name** | wrangler 配置 |
| **文件** | `wrangler.toml` |
| **Description** | Cloudflare Workers 部署配置：路由、assets 目录 |
| **Expected Behaviour** | 静态资产从 dist/ 部署，路由 daily-book.jiahongw.com |
| **Validation Rules** | - |

---

> 第一阶段结束：23 个功能点已识别并记录。
> 下一阶段：第二阶段 — 为每个功能生成测试场景。