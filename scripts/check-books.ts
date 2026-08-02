import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { bookFromFile, compareBooks } from "../src/data/book-file";
import { buildIssueNumberIndex } from "../src/utils/issue-number";

const __dirname = dirname(fileURLToPath(import.meta.url));
const booksDir = join(__dirname, "..", "src/data/books");

const files = readdirSync(booksDir).filter((file) => file.endsWith(".md")).sort();
const books = files
  .map((file) => bookFromFile(readFileSync(join(booksDir, file), "utf8"), file))
  .sort(compareBooks);

const ids = new Set<string>();
const dates = new Set<string>();
let errors = 0;

for (const book of books) {
  if (ids.has(book.id)) {
    console.error(`❌ 重复 id: ${book.id}`);
    errors++;
  }
  ids.add(book.id);

  if (book.publishedDate != null) {
    if (dates.has(book.publishedDate)) {
      console.error(`❌ 重复 publishedDate: ${book.publishedDate}`);
      errors++;
    }
    dates.add(book.publishedDate);
  }
}

const index = buildIssueNumberIndex(books);
if (index.totalIssues !== dates.size) {
  console.error(`❌ 期号总数 ${index.totalIssues} 与已发布数 ${dates.size} 不一致`);
  errors++;
}

if (errors > 0) {
  process.exit(1);
}

console.log(`✅ books:check 通过 — ${books.length} 本书，${dates.size} 期，${index.totalIssues} 期号`);
