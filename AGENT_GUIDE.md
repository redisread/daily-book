# 每日一书 —— Agent 新增书籍操作指南

## 项目概览

「每日一书」是一个基于 Astro 的静态网站，部署在 Cloudflare Pages 上。每天根据日期哈希自动推荐一本书籍，附带精选金句，并提供 RSS 订阅。

### 项目路径

```
/Users/victor/Desktop/Projects/catpaw-desk/test/daily-book/
```

### 关键文件

| 文件 | 用途 |
|------|------|
| `src/data/books.ts` | **唯一需要编辑的文件**。存放所有书籍数据和推荐算法 |
| `src/components/BookCard.astro` | 书籍主卡片组件（封面 + 信息 + 操作按钮） |
| `src/components/QuoteCard.astro` | 金句展示组件（主金句 + 更多金句网格） |
| `src/components/HistoryGrid.astro` | 往期推荐网格组件 |
| `src/pages/index.astro` | 首页 |
| `src/pages/archive.astro` | 往期回顾页（展示最近 30 天） |
| `src/pages/book/[date].astro` | 每日详情页（预生成最近 90 天） |
| `src/pages/rss.xml.ts` | RSS 订阅源（最近 30 天） |
| `src/layouts/Layout.astro` | 全局布局 |
| `src/styles/global.css` | 全局样式 |
| `astro.config.mjs` | Astro 配置 |

---

## 新增一本书的完整步骤

### 第 1 步：准备书籍信息

收集以下信息（所有字段均为必填）：

| 字段 | 说明 | 示例 |
|------|------|------|
| `id` | 英文短横线连接的唯一标识符 | `"brave-new-world"` |
| `title` | 书名 | `"美丽新世界"` |
| `author` | 作者全名 | `"阿道司·赫胥黎"` |
| `category` | 分类标签（2-5个字） | `"反乌托邦"` |
| `year` | 首次出版年份 | `"1932"` |
| `pages` | 页数 | `"288"` |
| `rating` | 豆瓣/Goodreads 评分 | `"9.1"` |
| `desc` | 一段话简介（50-100字） | `"赫胥黎描绘了一个..."` |
| `coverBg` | 封面渐变色 CSS | `"linear-gradient(145deg, #1a3a5a, #2a5a7a, #1a3a5a)"` |
| `coverTitle` | 封面显示的书名（可用 `\n` 换行） | `"美丽新世界"` |
| `coverAuthor` | 封面显示的作者简称 | `"赫胥黎"` |
| `quotes` | 5 条精选金句，每条含 `text` 和 `page` | 见下方模板 |

### 第 2 步：编辑 `src/data/books.ts`

打开文件 `src/data/books.ts`，找到 `books` 数组的末尾（`];` 之前），插入新的书籍对象。

**插入位置**：在数组最后一个 `},` 之后、`];` 之前。

**模板**：

```typescript
  {
    id: "brave-new-world",
    title: "美丽新世界",
    author: "阿道司·赫胥黎",
    category: "反乌托邦",
    year: "1932",
    pages: "288",
    rating: "9.1",
    desc: "赫胥黎描绘了一个科技高度发达的未来社会，人类被基因工程和条件反射训练分为五个等级，用索麻麻痹自己，在舒适中丧失了自由、情感和思考的能力。",
    coverBg: "linear-gradient(145deg, #3a1a5a, #5a2a7a, #3a1a5a)",
    coverTitle: "美丽新世界",
    coverAuthor: "赫胥黎",
    quotes: [
      { text: "人们感到痛苦的不是他们用笑声取代了思考，而是他们不知道自己为什么笑以及为什么不再思考。", page: "第三章" },
      { text: "一个人被真相伤害，总比被谎言安慰要好。", page: "第十五章" },
      { text: "最完美的社会控制，是让人们爱上自己的奴役。", page: "第一章" },
      { text: "稳定，是文明的首要需求。", page: "第二章" },
      { text: "但我不要舒适。我要上帝，我要诗歌，我要真正的危险，我要自由，我要善良，我要罪恶。", page: "第十七章" },
    ],
  },
```

### 第 3 步：验证

编辑完成后，执行以下命令验证：

```bash
cd /Users/victor/Desktop/Projects/catpaw-desk/test/daily-book
export PATH="/opt/homebrew/bin:$PATH"

# 构建项目（确认无编译错误）
npx astro build

# 本地预览（可选）
npx astro preview --port 4321
```

构建成功的标志是看到类似输出：

```
[build] 93 page(s) built in X.XXs
[build] Complete!
```

---

## 注意事项与约束

### 数据格式约束

1. **`id` 必须唯一**：使用英文小写 + 短横线格式，如 `"the-great-gatsby"`。不能与已有 id 重复。

2. **`desc` 中不能包含 ASCII 双引号 `"`**：如果简介中需要引用文字，使用中文引号「」或书名号《》代替。这是因为 `desc` 字段本身用双引号包裹，内嵌的 ASCII 双引号会导致 JavaScript 解析错误。
   - ❌ 错误：`desc: "她说"你好"然后离开了"`
   - ✅ 正确：`desc: "她说「你好」然后离开了"`

3. **`quotes` 中的 `text` 同样不能包含 ASCII 双引号**：同上规则。

4. **`quotes` 数组建议包含 5 条金句**：第 1 条会作为主金句展示在页面和 RSS 中，第 2-5 条展示在「更多金句」区域。最少 1 条，最多不限，但 5 条是最佳数量。

5. **所有字段均为 `string` 类型**：包括 `year`、`pages`、`rating`，都用引号包裹。

### 封面配色规则

`coverBg` 使用 CSS `linear-gradient` 语法，固定格式为：

```
linear-gradient(145deg, <暗色>, <亮色>, <暗色>)
```

三个颜色值形成「暗-亮-暗」的对称渐变，角度固定 `145deg`。颜色应根据书籍的气质选择：

| 书籍气质 | 推荐色系 | 示例 |
|---------|---------|------|
| 文学/古典 | 深蓝、靛蓝 | `#1a1a40, #2a2a60, #1a1a40` |
| 自然/田园 | 深绿、翠绿 | `#1a4a3a, #2a7a5a, #1a4a3a` |
| 热情/爱情 | 深红、玫红 | `#8a1a3a, #b52a4a, #8a1a3a` |
| 科幻/未来 | 深蓝、藏青 | `#0a1a3a, #1a3a6a, #0a1a3a` |
| 哲学/思辨 | 深紫、紫罗兰 | `#5a1a8a, #7a2ab0, #5a1a8a` |
| 历史/纪实 | 深红、砖红 | `#b52020, #d43d3d, #b52020` |
| 温暖/治愈 | 深棕、琥珀 | `#5a3a20, #8a5a30, #5a3a20` |
| 暗黑/沉重 | 深灰、炭灰 | `#2a2a2a, #4a4a4a, #2a2a2a` |
| 商业/科技 | 深青、蓝绿 | `#1a4a6a, #2a6a8a, #1a4a6a` |

**关键原则**：暗色值的 RGB 分量通常在 `0x0a-0x5a` 范围，亮色值比暗色值每个分量高 `0x10-0x30`。避免使用过亮的颜色（如 `#ffffff`），否则在深色背景上会刺眼。

### `coverTitle` 换行

如果书名较长（超过 5 个字），可以用 `\n` 手动换行以优化封面排版：

```typescript
coverTitle: "霍乱时期\n的爱情",  // 会在封面上分两行显示
```

### 推荐算法说明

系统使用日期字符串的哈希值对书籍总数取模来决定每天推荐哪本书。新增书籍会改变 `books.length`，从而**改变所有日期的推荐结果**。这是预期行为——因为是静态站点，每次构建都会重新生成所有页面。

---

## 批量新增书籍

如果需要一次性添加多本书，只需在 `books` 数组中连续追加多个对象即可。每个对象之间用逗号分隔。

添加完成后执行一次 `npx astro build` 即可。

---

## 构建与部署

```bash
cd /Users/victor/Desktop/Projects/catpaw-desk/test/daily-book
export PATH="/opt/homebrew/bin:$PATH"

# 本地开发
npx astro dev

# 构建生产版本
npx astro build

# 本地预览构建结果
npx astro preview --port 4321
```

部署到 Cloudflare Pages 时，构建命令为 `npm run build`，输出目录为 `dist`。

---

## 快速检查清单

新增书籍后，确认以下几点：

- [ ] `id` 在整个数组中唯一
- [ ] `desc` 和 `quotes[].text` 中没有 ASCII 双引号 `"`
- [ ] `quotes` 数组包含至少 1 条、建议 5 条金句
- [ ] `coverBg` 遵循 `linear-gradient(145deg, 暗, 亮, 暗)` 格式
- [ ] 所有字段都是字符串类型（用引号包裹）
- [ ] `npx astro build` 构建成功，无报错
