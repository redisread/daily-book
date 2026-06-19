import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { dump } from "js-yaml";
import { BookSchema } from "../src/schemas/book.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");

const srcPath = join(rootDir, "src/data/books.ts");
const src = readFileSync(srcPath, "utf8");

const startMarker = "export const books: Book[] = [";
const startIdx = src.indexOf(startMarker);
if (startIdx === -1) {
  throw new Error("在 src/data/books.ts 中未找到 books 数组起始标记");
}

const rest = src.slice(startIdx + startMarker.length);
const endMatch = rest.match(/\n\];/);
if (!endMatch) {
  throw new Error("在 src/data/books.ts 中未找到 books 数组结束标记");
}

const arrayLiteral = rest.slice(0, endMatch.index);

// 数组字面量仅包含字符串与对象，使用 new Function 安全求值
const books = new Function(`return [${arrayLiteral}]`)();

if (!Array.isArray(books)) {
  throw new Error("迁移失败：未能解析出 books 数组");
}

const validBooks = [];
for (const [index, book] of books.entries()) {
  const result = BookSchema.safeParse(book);
  if (!result.success) {
    console.error(`第 ${index + 1} 本书校验失败:`, result.error.issues);
    process.exit(1);
  }
  validBooks.push(result.data);
}

const yamlContent =
  "# 每日一书书籍数据\n" +
  "# 由 scripts/migrate-books.mjs 从 src/data/books.ts 迁移生成\n" +
  "# 新增/修改书籍后，运行 npm run validate:books 校验\n" +
  dump(validBooks, { lineWidth: -1, noRefs: true, quotingType: '"', forceQuotes: true });

const outPath = join(rootDir, "src/data/books.yaml");
writeFileSync(outPath, yamlContent, "utf8");

console.log(`✅ 已迁移 ${validBooks.length} 本书到 ${outPath}`);
