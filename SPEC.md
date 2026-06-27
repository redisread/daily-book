# Spec: 单源数据 — publishedDate 内嵌 books.yaml

## 背景

`books.yaml` 和 `publishedHistory.ts` 两份数据分离，人工维护容易漂移，导致书籍已入库但未发布的问题。

## 目标

将发布历史内嵌到 `books.yaml`，作为唯一数据源，从根本上消除漂移。

## 改动范围

### 1. Schema 变更 — `src/schemas/book.ts`

```typescript
// Book 接口中新增 publishedDate?: string | null
// publishedDate 格式: "YYYY-MM-DD" | null（null = 未发布）
```

### 2. 数据迁移

**步骤 A：补填历史书籍的 `publishedDate`**

从 `publishedHistory.ts`（现有 87 条）反向推导每本书的 `publishedDate`，填入对应书的 yaml 条目中。

示例（对应关系）：
```yaml
# publishedHistory 中的记录
{ date: "2026-06-18", bookId: "hackers-and-painters" }

# books.yaml 中对应书籍需添加：
- id: "hackers-and-painters"
  publishedDate: "2026-06-18"
  title: "黑客与画家"
  ...
```

**步骤 B：处理待发布书籍**

以下书籍当前 `publishedDate: null`（未发布或刚补录）：
- `tokio-2026` (时生) → `publishedDate: "2026-06-20"`
- `brief-history-intelligence-2026` (智能简史) → `publishedDate: "2026-06-19"`

**步骤 C：验证推导一致性**

迁移完成后，运行验证脚本确认从 yaml 推导出的 `publishedHistory` 与迁移前的数据一致（89 条，日期 2026-03-24 ~ 2026-06-20）。

```bash
# 验证命令（迁移脚本的一部分）
node -e "
const yaml = require('js-yaml');
const fs = require('fs');
const books = yaml.load(fs.readFileSync('src/data/books.yaml', 'utf8'));
const derived = books
  .filter(b => b.publishedDate != null)
  .sort((a, b) => b.publishedDate > a.publishedDate ? 1 : -1)
  .map(b => ({ date: b.publishedDate, bookId: b.id }));
console.log('Derived count:', derived.length);
console.log('First:', derived[0]);
console.log('Last:', derived[derived.length - 1]);
"

### 3. 数据层重构 — `src/data/books.ts`

- 删除 `import { publishedHistory } from "./publishedHistory"`
- `publishedHistory` 改为从 `books` 数组中推导：

```typescript
// publishedDate 非 null 的书，按日期降序排列
export const publishedHistory: PublishedEntry[] = books
  .filter(b => b.publishedDate != null)
  .sort((a, b) => (b.publishedDate! > a.publishedDate! ? 1 : -1))
  .map(b => ({ date: b.publishedDate!, bookId: b.id }));
```

`getBookForDate`、`getPublishedBooks`、`getLatestPublishedBook` 等函数逻辑**保持不变**（已有 fallback 逻辑）。

### 4. 删除文件

- `src/data/publishedHistory.ts` 删除

### 5. 测试调整 — `tests/unit/books.test.ts`

- `getPublishedDates` 测试：现在依赖 yaml 中的 `publishedDate`
- 新增测试：校验每本 `publishedDate !== null` 的书都在历史中

## 命令

```bash
npm test           # 单元测试
npm run typecheck # 类型检查
```

## 项目结构

```
src/data/
  books.yaml        # 唯一数据源（含 publishedDate）
  books.ts          # 从 yaml 加载，推导 publishedHistory
src/schemas/
  book.ts           # Book 类型定义（含 publishedDate）
tests/unit/
  books.test.ts     # 更新测试
```

## 边界

- **Always:** 新增书籍必须指定 `publishedDate: null`，由发布时填写实际日期
- **Ask first:** 修改 `publishedDate` 已有值的书籍
- **Never:** 不再创建独立的 `publishedHistory.ts` 文件

## 验收条件

1. `npm test` 全部通过
2. `npm run typecheck` 无错误
3. `publishedHistory` 推导结果与原来一致（89 条，日期 2026-03-24 ~ 2026-06-20）
4. 新增书籍 `publishedDate: null` 时，`getBookForDate` 走 fallback 洗牌逻辑
