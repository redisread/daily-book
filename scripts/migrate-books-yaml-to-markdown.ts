// 一次性迁移：books.yaml -> src/data/books/<id>.md
// 输入 books.yaml 已删除；如需复现迁移，先从 git 历史恢复该文件再运行。
import { dump, load } from "js-yaml";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BookSchema } from "../src/schemas/book";
import { bookFromFile, compareBooks } from "../src/data/book-file";
import type { Book } from "../src/schemas/book";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");
const yamlPath = join(rootDir, "src/data/books.yaml");
const outputDir = join(rootDir, "src/data/books");
const legacyBooksDir = join(rootDir, "books");

const rawYaml = readFileSync(yamlPath, "utf8");
const parsed = load(rawYaml);
const books = BookSchema.array().parse(parsed);

const ids = new Set<string>();
const dates = new Set<string>();
for (const book of books) {
  if (ids.has(book.id)) {
    throw new Error(`重复 id: ${book.id}`);
  }
  ids.add(book.id);

  if (book.publishedDate != null) {
    if (dates.has(book.publishedDate)) {
      throw new Error(`重复 publishedDate: ${book.publishedDate}`);
    }
    dates.add(book.publishedDate);
  }
}

const legacyBodyMap = new Map<string, string>();
if (existsSync(legacyBooksDir)) {
  const legacyToId: Record<string, string> = {
    "2026-07-03": "island-bookstore",
    "2026-07-04": "cognitive-awakening-revisit",
  };
  const legacyFiles = readdirSync(legacyBooksDir).filter((file) => file.endsWith(".md"));
  for (const file of legacyFiles) {
    const key = file.replace(/\.md$/, "");
    const id = legacyToId[key];
    if (!id) {
      throw new Error(`未知的旧 books/${file}，无法迁移`);
    }
    legacyBodyMap.set(id, readFileSync(join(legacyBooksDir, file), "utf8").trim());
  }
}

const FIELD_ORDER = [
  "id",
  "title",
  "author",
  "category",
  "year",
  "pages",
  "rating",
  "desc",
  "coverTitle",
  "coverAuthor",
  "publishedDate",
  "editorNote",
  "quotes",
] as const;

function toFrontmatter(book: Book): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of FIELD_ORDER) {
    if (book[key] !== undefined) {
      result[key] = book[key];
    }
  }
  return result;
}

rmSync(outputDir, { recursive: true, force: true });
mkdirSync(outputDir, { recursive: true });

for (const book of [...books].sort(compareBooks)) {
  const frontmatterText = dump(toFrontmatter(book), {
    lineWidth: -1,
    noRefs: true,
    sortKeys: false,
  }).trimEnd();
  const body = legacyBodyMap.get(book.id) ?? "";
  const content = `---\n${frontmatterText}\n---\n${body ? `\n${body}\n` : ""}`;
  writeFileSync(join(outputDir, `${book.id}.md`), content, "utf8");
}

const generatedFiles = readdirSync(outputDir).filter((file) => file.endsWith(".md")).sort();
const generatedBooks = generatedFiles
  .map((file) => bookFromFile(readFileSync(join(outputDir, file), "utf8"), file))
  .sort(compareBooks);

const expectedBooks = books
  .map((book) => {
    const body = legacyBodyMap.get(book.id);
    return body ? { ...book, body } : book;
  })
  .sort(compareBooks);

if (JSON.stringify(generatedBooks) !== JSON.stringify(expectedBooks)) {
  console.error("迁移结果与 books.yaml 不一致");
  process.exit(1);
}

console.log(`✅ 已生成 ${generatedFiles.length} 个 Markdown 文件到 ${outputDir}`);
console.log(`   已发布 ${dates.size} 期，id 唯一 ${ids.size} 个，含正文 ${legacyBodyMap.size} 个`);
