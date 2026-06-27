// scripts/migrate-published-date.mjs
// 将 publishedDate 从 publishedHistory 迁移到 books.yaml 每本书中
// 并将 publishedDate 字段放在 coverAuthor 之后、quotes 之前
import { load, dump } from "js-yaml";
import { readFileSync, writeFileSync } from "fs";

const historyEntries = [
  { date: "2026-06-20", bookId: "tokio-2026" },
  { date: "2026-06-19", bookId: "brief-history-intelligence-2026" },
  { date: "2026-06-18", bookId: "hackers-and-painters" },
  { date: "2026-06-17", bookId: "the-road-less-traveled" },
  { date: "2026-06-16", bookId: "the-little-prince" },
  { date: "2026-06-15", bookId: "code-complete" },
  { date: "2026-06-14", bookId: "norwegian-wood" },
  { date: "2026-06-13", bookId: "the-structure-of-scientific-revolutions" },
  { date: "2026-06-12", bookId: "a-sand-county-almanac" },
  { date: "2026-06-11", bookId: "the-sovereign-individual" },
  { date: "2026-06-10", bookId: "the-little-book-of-stoicism" },
  { date: "2026-06-09", bookId: "crime-and-punishment" },
  { date: "2026-06-08", bookId: "hitchhikers-guide-to-the-galaxy" },
  { date: "2026-06-07", bookId: "the-consolation-of-philosophy" },
  { date: "2026-06-06", bookId: "influence" },
  { date: "2026-06-05", bookId: "silent-spring" },
  { date: "2026-06-04", bookId: "autumn-of-the-patriarch" },
  { date: "2026-06-03", bookId: "zen-and-minimalist-life" },
  { date: "2026-06-02", bookId: "the-godfather" },
  { date: "2026-06-01", bookId: "zen-and-motorcycle-maintenance" },
  { date: "2026-05-31", bookId: "walden" },
  { date: "2026-05-30", bookId: "fortress-besieged" },
  { date: "2026-05-29", bookId: "why-fish-dont-exist" },
  { date: "2026-05-28", bookId: "deep-learning" },
  { date: "2026-05-27", bookId: "meditations" },
  { date: "2026-05-26", bookId: "work-consumerism-new-poor" },
  { date: "2026-05-25", bookId: "the-metamorphosis" },
  { date: "2026-05-24", bookId: "the-four-agreements" },
  { date: "2026-05-23", bookId: "the-black-swan" },
  { date: "2026-05-22", bookId: "the-silmarillion" },
  { date: "2026-05-21", bookId: "love-in-cholera" },
  { date: "2026-05-20", bookId: "hundred-years-of-solitude" },
  { date: "2026-05-19", bookId: "small-is-beautiful" },
  { date: "2026-05-18", bookId: "steve-jobs" },
  { date: "2026-05-17", bookId: "sophies-world" },
  { date: "2026-05-16", bookId: "noise" },
  { date: "2026-05-15", bookId: "the-crowd" },
  { date: "2026-05-14", bookId: "the-mythical-man-month" },
  { date: "2026-05-13", bookId: "flow" },
  { date: "2026-05-12", bookId: "how-to-read-a-book" },
  { date: "2026-05-11", bookId: "the-catcher-in-the-rye" },
  { date: "2026-05-10", bookId: "civil-disobedience" },
  { date: "2026-05-09", bookId: "the-republic" },
  { date: "2026-05-08", bookId: "the-lean-startup" },
  { date: "2026-05-07", bookId: "the-second-sex" },
  { date: "2026-05-06", bookId: "the-brothers-karamazov" },
  { date: "2026-05-05", bookId: "the-master-and-margarita" },
  { date: "2026-05-04", bookId: "1984" },
  { date: "2026-05-03", bookId: "the-selfish-gene" },
  { date: "2026-05-02", bookId: "cognitive-awakening" },
  { date: "2026-05-01", bookId: "introduction-to-algorithms" },
  { date: "2026-04-30", bookId: "the-stranger" },
  { date: "2026-04-29", bookId: "atomic-habits" },
  { date: "2026-04-28", bookId: "the-power-of-now" },
  { date: "2026-04-27", bookId: "no-longer-human" },
  { date: "2026-04-26", bookId: "moments-of-human-glory" },
  { date: "2026-04-25", bookId: "the-moon-and-sixpence" },
  { date: "2026-04-24", bookId: "the-psychology-of-money" },
  { date: "2026-04-23", bookId: "the-phantom-tollbooth" },
  { date: "2026-04-22", bookId: "guns-germs-and-steel" },
  { date: "2026-04-21", bookId: "the-kite-runner" },
  { date: "2026-04-20", bookId: "mans-search-for-meaning" },
  { date: "2026-04-19", bookId: "the-art-of-war" },
  { date: "2026-04-18", bookId: "dune" },
  { date: "2026-04-17", bookId: "the-tao-te-ching" },
  { date: "2026-04-16", bookId: "the-myth-of-sisyphus" },
  { date: "2026-04-15", bookId: "good-to-great" },
  { date: "2026-04-14", bookId: "the-great-gatsby" },
  { date: "2026-04-13", bookId: "zero-to-one" },
  { date: "2026-04-12", bookId: "three-body" },
  { date: "2026-04-11", bookId: "thinking-fast-and-slow" },
  { date: "2026-04-10", bookId: "the-almanack-of-naval-ravikant" },
  { date: "2026-04-09", bookId: "rework" },
  { date: "2026-04-08", bookId: "the-innovators-dilemma" },
  { date: "2026-04-07", bookId: "life-3-0" },
  { date: "2026-04-06", bookId: "to-live" },
  { date: "2026-04-05", bookId: "animal-farm" },
  { date: "2026-04-04", bookId: "the-design-of-everyday-things" },
  { date: "2026-04-03", bookId: "poor-charlies-almanack" },
  { date: "2026-04-02", bookId: "the-old-man-and-the-sea" },
  { date: "2026-04-01", bookId: "in-search-of-lost-time" },
  { date: "2026-03-31", bookId: "the-art-of-thought" },
  { date: "2026-03-30", bookId: "the-ethics" },
  { date: "2026-03-29", bookId: "sapiens" },
  { date: "2026-03-28", bookId: "principles" },
  { date: "2026-03-27", bookId: "the-art-of-thinking" },
  { date: "2026-03-26", bookId: "brave-new-world" },
  { date: "2026-03-25", bookId: "siddhartha" },
  { date: "2026-03-24", bookId: "the-pragmatic-programmer" },
];

const dateMap = new Map(historyEntries.map(e => [e.bookId, e.date]));
console.log(`Parsed ${historyEntries.length} history entries`);

const yamlPath = new URL("../src/data/books.yaml", import.meta.url);
const yamlContent = readFileSync(yamlPath, "utf-8");

// Skip existing header comment
const yamlBody = yamlContent.replace(/^#.*\n/, "");
const books = load(yamlBody);

for (const book of books) {
  if (dateMap.has(book.id)) {
    book.publishedDate = dateMap.get(book.id);
  } else {
    book.publishedDate = null;
  }
}

// Reorder fields: publishedDate should appear after coverAuthor, before quotes
// js-yaml dump respects property insertion order, so we rebuild each book object
const FIELD_ORDER = [
  "id", "title", "author", "category", "year", "pages", "rating",
  "desc", "coverBg", "coverTitle", "coverAuthor", "publishedDate", "quotes"
];

const reordered = books.map(book => {
  const result = {};
  for (const key of FIELD_ORDER) {
    if (book[key] !== undefined) {
      result[key] = book[key];
    }
  }
  return result;
});

const yamlOutput = dump(reordered, {
  indent: 2,
  lineWidth: -1,
  noRefs: true,
  sortKeys: false,
});

const header = `# 每日一书书籍数据
# 由 scripts/migrate-published-date.mjs 迁移生成
# 新增/修改书籍后，运行 npm run validate:books 校验
# publishedDate 格式为 YYYY-MM-DD，未发布为 null
`;
writeFileSync(yamlPath, header + yamlOutput);
console.log("Written to books.yaml");
