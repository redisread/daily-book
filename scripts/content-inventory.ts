/** Read-only candidate mapping. No D1 client, SQL, content edits or import behavior. */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, mkdirSync, writeFileSync, existsSync, realpathSync } from "node:fs";
import { resolve, basename, dirname, relative, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { load } from "js-yaml";
import { createRequire } from "node:module";
import { bookFromFile } from "../src/data/book-file";
import { buildIssueNumberIndex } from "../src/utils/issue-number";
import type { Book } from "../src/schemas/book";

const BOOK_FIELDS = ["id", "title", "author", "category", "year", "pages", "rating", "desc", "coverTitle", "coverAuthor"] as const;
const LEGACY_FIELDS = [...BOOK_FIELDS, "publishedDate", "editorNote", "body", "quotes"];
const KNOWN = new Set(LEGACY_FIELDS);
export const sha256 = (value: string | Buffer): string => createHash("sha256").update(value).digest("hex");
export function canonical(value: unknown): string {
  if (value === undefined) return '{"$type":"undefined"}';
  if (value instanceof Date) return JSON.stringify({ $type: "Date", value: value.toISOString() });
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }
  if (typeof value === "number" && !Number.isFinite(value)) return JSON.stringify({ $type: "number", value: String(value) });
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new Error("Unsupported non-JSON value");
  return encoded;
}
const fieldHash = (object: object, key: string) => {
  const present = Object.hasOwn(object, key);
  return { present, sha256: sha256(canonical({ present, ...(present ? { value: (object as Record<string, unknown>)[key] } : {}) })) };
};
const hashes = (object: object, fields = Object.keys(object)) => Object.fromEntries(fields.map((key) => [key, fieldHash(object, key)]));
const normalize = (value: string) => value.normalize("NFKC").trim().replace(/\s+/gu, "").toLowerCase();
const markdown = (value: unknown) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replace(/[|`]/g, "\\$&").replace(/\r?\n/g, " ");

export interface SourceFile { path: string; raw: string; blobId?: string }
interface CandidateBook {
  id: string; title: string; author: string; category: string;
  year: number; pages: number; rating: number; description: string; coverTitle: string; coverAuthor: string;
}
interface CandidateIssue {
  id: string; bookId: string; status: "published" | "draft";
  publicationDate: string | null; issueNumber: number | null; editorNote?: string; body: string;
}
interface CandidateQuote { id: string; issueId: string; text: string; sourceLabel: string; position: number }
export interface Entry {
  source: SourceFile & { sha256: string; rawBody: string; frontmatter: Record<string, unknown>; legacyBodyPresent: boolean; bodyOrigin: "markdown" | "frontmatter" | "empty" };
  candidate: { book: CandidateBook; issue: CandidateIssue; quotes: CandidateQuote[] };
  hashes: { frontmatter: ReturnType<typeof hashes>; legacy: ReturnType<typeof hashes>; book: ReturnType<typeof hashes>; issue: ReturnType<typeof hashes>; quotes: ReturnType<typeof hashes>[]; sourceQuotes: ReturnType<typeof hashes>[]; rawBodySHA256: string };
  deficiencies: string[];
  unmappedFrontmatterKeys: string[];
}

function parse(source: SourceFile) {
  const match = source.raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) throw new Error("Missing frontmatter");
  const value = load(match[1]);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Frontmatter is not an object");
  return { legacy: bookFromFile(source.raw, basename(source.path)), frontmatter: value as Record<string, unknown>, rawBody: source.raw.slice(match[0].length) };
}

export function createInventory(files: SourceFile[]) {
  const parsed: { source: SourceFile; legacy: Book; frontmatter: Record<string, unknown>; rawBody: string }[] = [];
  const invalidSources: { path: string; sha256: string; raw: string; error: string }[] = [];
  for (const source of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    try { parsed.push({ source, ...parse(source) }); }
    catch (error) { invalidSources.push({ path: source.path, sha256: sha256(source.raw), raw: source.raw, error: String(error) }); }
  }
  const numberIndex = buildIssueNumberIndex(parsed.map((row) => row.legacy));
  const entries: Entry[] = parsed.map(({ source, legacy, frontmatter, rawBody }) => {
    const issueId = `legacy-${legacy.id}`;
    const bodyOrigin = rawBody.trim() ? "markdown" : Object.hasOwn(frontmatter, "body") ? "frontmatter" : "empty";
    // Preserve the source's exact body, including whitespace; retain both inputs if frontmatter also supplied body.
    const body = bodyOrigin === "frontmatter" ? legacy.body ?? "" : rawBody;
    const book: CandidateBook = {
      id: legacy.id, title: legacy.title, author: legacy.author, category: legacy.category,
      year: legacy.year, pages: legacy.pages, rating: legacy.rating, description: legacy.desc,
      coverTitle: legacy.coverTitle, coverAuthor: legacy.coverAuthor,
    };
    const issue: CandidateIssue = {
      id: issueId, bookId: book.id, status: legacy.publishedDate == null ? "draft" : "published",
      publicationDate: legacy.publishedDate ?? null, issueNumber: numberIndex.bookIdToIssue.get(book.id) ?? null,
      ...(Object.hasOwn(legacy, "editorNote") ? { editorNote: legacy.editorNote } : {}), body,
    };
    const quotes = legacy.quotes.map((quote, position) => ({ id: `${issueId}-quote-${position + 1}`, issueId, text: quote.text, sourceLabel: quote.page, position }));
    const deficiencies: string[] = [];
    if (!Object.hasOwn(legacy, "editorNote")) deficiencies.push("missing-editorNote");
    else if ([...legacy.editorNote!].length < 40 || [...legacy.editorNote!].length > 100) deficiencies.push("editorNote-outside-new-40-100-codepoints");
    if (!rawBody.trim() && !legacy.body) deficiencies.push("no-body-content (preserved; not a publication blocker)");
    quotes.forEach((quote) => {
      if (!quote.sourceLabel.trim() || /^(?:[-—–]+|待补|待核实|未知|无|暂无)$/u.test(quote.sourceLabel.trim())) deficiencies.push(`quote-${quote.position + 1}-source-needs-review`);
    });
    if (Object.hasOwn(frontmatter, "body") && rawBody.trim()) deficiencies.push("frontmatter-body-shadowed-by-markdown (both retained)");
    const unmappedFrontmatterKeys = Object.keys(frontmatter).filter((key) => !KNOWN.has(key));
    return {
      source: { ...source, sha256: sha256(source.raw), rawBody, frontmatter, legacyBodyPresent: Object.hasOwn(legacy, "body"), bodyOrigin },
      candidate: { book, issue, quotes },
      hashes: { frontmatter: hashes(frontmatter), legacy: hashes(legacy, LEGACY_FIELDS), book: hashes(book), issue: hashes(issue), quotes: quotes.map((q) => hashes(q)), sourceQuotes: legacy.quotes.map((q) => hashes(q)), rawBodySHA256: sha256(rawBody) },
      deficiencies, unmappedFrontmatterKeys,
    };
  });
  const dateGroups = new Map<string, string[]>();
  const titleGroups = new Map<string, Entry[]>();
  const quoteGroups = new Map<string, { bookId: string; position: number; text: string; sourceLabel: string }[]>();
  for (const entry of entries) {
    const { book, issue, quotes } = entry.candidate;
    if (issue.publicationDate !== null) dateGroups.set(issue.publicationDate, [...dateGroups.get(issue.publicationDate) ?? [], book.id]);
    const titleKey = normalize(book.title);
    titleGroups.set(titleKey, [...titleGroups.get(titleKey) ?? [], entry]);
    for (const quote of quotes) {
      const key = normalize(quote.text);
      quoteGroups.set(key, [...quoteGroups.get(key) ?? [], { bookId: book.id, position: quote.position, text: quote.text, sourceLabel: quote.sourceLabel }]);
    }
  }
  const duplicateDates = [...dateGroups].filter(([, ids]) => ids.length > 1).map(([date, ids]) => ({ date, ids }));
  const invalidDates = [...dateGroups.keys()].filter((date) => {
    const parsed = new Date(`${date}T00:00:00Z`);
    return !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date;
  });
  const suspectedReRecommendations = [...titleGroups.values()].filter((rows) => rows.length > 1).map((rows) => ({
    title: rows[0].candidate.book.title,
    reason: new Set(rows.map((row) => normalize(row.candidate.book.author))).size === 1 ? "same-normalized-title-and-author; manual identity review required" : "same-normalized-title-different-author-labels; manual review required",
    members: rows.map((row) => ({ sourcePath: row.source.path, bookId: row.candidate.book.id, author: row.candidate.book.author, publicationDate: row.candidate.issue.publicationDate, issueNumber: row.candidate.issue.issueNumber })),
  }));
  const revisitIdSignals = entries.filter((row) => row.candidate.book.id.endsWith("-revisit")).map((row) => ({ id: row.candidate.book.id, baseId: row.candidate.book.id.replace(/-revisit$/, ""), baseExists: entries.some((other) => other.candidate.book.id === row.candidate.book.id.replace(/-revisit$/, "")) }));
  const duplicateQuoteTexts = [...quoteGroups.values()].filter((rows) => rows.length > 1);
  const summary = {
    sourceFiles: files.length, validSources: entries.length, invalidSources: invalidSources.length,
    candidateBooks: entries.length, candidateIssues: entries.length,
    published: entries.filter((row) => row.candidate.issue.status === "published").length,
    drafts: entries.filter((row) => row.candidate.issue.status === "draft").length,
    withdrawn: 0,
    quotes: entries.reduce((total, row) => total + row.candidate.quotes.length, 0),
    rawBodiesWithContent: entries.filter((row) => row.source.rawBody.trim()).length,
    missingEditorNote: entries.filter((row) => row.deficiencies.includes("missing-editorNote")).length,
    existingEditorNoteOutsideNewLength: entries.filter((row) => row.deficiencies.includes("editorNote-outside-new-40-100-codepoints")).length,
    quoteSourcesNeedingReview: entries.reduce((total, row) => total + row.deficiencies.filter((item) => item.includes("source-needs-review")).length, 0),
    suspectedReRecommendationGroups: suspectedReRecommendations.length,
    firstPublicationDate: [...dateGroups.keys()].sort()[0] ?? null,
    lastPublicationDate: [...dateGroups.keys()].sort().at(-1) ?? null,
    maxHistoricalIssueNumber: Math.max(0, ...numberIndex.issueToBookId.keys()),
    nextIssueNumber: Math.max(0, ...numberIndex.issueToBookId.keys()) + 1,
  };
  return { formatVersion: 1, summary, duplicateDates, invalidDates, suspectedReRecommendations, revisitIdSignals, duplicateQuoteTexts, invalidSources, entries };
}
export type Inventory = ReturnType<typeof createInventory>;

/** Independent inverse projection against the existing loader, including missing-vs-null and quote order. */
export function verifyInventory(inventory: Inventory, expectedSources?: SourceFile[]) {
  const errors: string[] = [];
  let fieldChecks = 0;
  const sources = inventory.entries.map((row) => parse(row.source).legacy);
  const index = buildIssueNumberIndex(sources);
  const dates = sources.flatMap((book) => book.publishedDate == null ? [] : [book.publishedDate]);
  if (new Set(dates).size !== dates.length) errors.push("duplicate-publication-dates");
  if (dates.some((date) => { const value = new Date(`${date}T00:00:00Z`); return !Number.isFinite(value.getTime()) || value.toISOString().slice(0, 10) !== date; })) errors.push("invalid-calendar-dates");
  const maxIssue = Math.max(0, ...index.issueToBookId.keys());
  const expectedCounts = {
    sourceFiles: inventory.entries.length + inventory.invalidSources.length,
    validSources: inventory.entries.length, invalidSources: inventory.invalidSources.length,
    candidateBooks: sources.length, candidateIssues: sources.length,
    published: dates.length, drafts: sources.length - dates.length, withdrawn: 0,
    quotes: sources.reduce((sum, book) => sum + book.quotes.length, 0),
    maxHistoricalIssueNumber: maxIssue, nextIssueNumber: maxIssue + 1,
    firstPublicationDate: [...dates].sort()[0] ?? null, lastPublicationDate: [...dates].sort().at(-1) ?? null,
  };
  for (const [key, value] of Object.entries(expectedCounts)) if (canonical(inventory.summary[key as keyof typeof inventory.summary]) !== canonical(value)) errors.push(`summary:${key}:mismatch`);
  if (expectedSources) {
    const expected = expectedSources.map((row) => ({ path: row.path, sha256: sha256(row.raw) })).sort((a, b) => a.path.localeCompare(b.path));
    const actual = [...inventory.entries.map((row) => row.source), ...inventory.invalidSources].map((row) => ({ path: row.path, sha256: sha256(row.raw) })).sort((a, b) => a.path.localeCompare(b.path));
    if (canonical(expected) !== canonical(actual)) errors.push("source-file-coverage-mismatch");
  }
  for (const entry of inventory.entries) {
    const { legacy, rawBody, frontmatter } = parse(entry.source);
    const { book, issue, quotes } = entry.candidate;
    const reconstructed: Record<string, unknown> = {
      id: book.id, title: book.title, author: book.author, category: book.category,
      year: book.year, pages: book.pages, rating: book.rating, desc: book.description,
      coverTitle: book.coverTitle, coverAuthor: book.coverAuthor,
      quotes: quotes.map((quote) => ({ text: quote.text, page: quote.sourceLabel })),
    };
    if (Object.hasOwn(frontmatter, "publishedDate")) reconstructed.publishedDate = issue.publicationDate;
    if (Object.hasOwn(issue, "editorNote")) reconstructed.editorNote = issue.editorNote;
    if (Object.hasOwn(legacy, "body")) reconstructed.body = entry.source.bodyOrigin === "markdown" ? issue.body.trim() : issue.body;
    for (const field of LEGACY_FIELDS) {
      fieldChecks++;
      if (canonical(fieldHash(legacy, field)) !== canonical(fieldHash(reconstructed, field))) errors.push(`${book.id}:${field}:legacy-field-mismatch`);
      if (canonical(fieldHash(legacy, field)) !== canonical(entry.hashes.legacy[field])) errors.push(`${book.id}:${field}:recorded-hash-mismatch`);
    }
    quotes.forEach((quote, i) => {
      fieldChecks += 2;
      if (quote.text !== legacy.quotes[i]?.text || quote.sourceLabel !== legacy.quotes[i]?.page || quote.position !== i || quote.issueId !== issue.id || quote.id !== `${issue.id}-quote-${i + 1}`) errors.push(`${book.id}:quote-${i}:mapping-mismatch`);
    });
    if (quotes.length !== legacy.quotes.length) errors.push(`${book.id}:quote-count`);
    if (sha256(entry.source.raw) !== entry.source.sha256 || rawBody !== entry.source.rawBody || sha256(rawBody) !== entry.hashes.rawBodySHA256) errors.push(`${book.id}:source-body-byte-mismatch`);
    const expectedBody = rawBody.trim() || !Object.hasOwn(frontmatter, "body") ? rawBody : legacy.body ?? "";
    if (issue.body !== expectedBody) errors.push(`${book.id}:raw-body-mapping-mismatch`);
    if (issue.id !== `legacy-${legacy.id}` || issue.bookId !== legacy.id || issue.issueNumber !== (index.bookIdToIssue.get(legacy.id) ?? null) || issue.publicationDate !== (legacy.publishedDate ?? null) || issue.status !== (legacy.publishedDate == null ? "draft" : "published")) errors.push(`${book.id}:issue-identity-or-publication-mismatch`);
    for (const [value, recorded] of [[book, entry.hashes.book], [issue, entry.hashes.issue]] as const) {
      if (canonical(hashes(value)) !== canonical(recorded)) errors.push(`${book.id}:candidate-hash-mismatch`);
    }
    if (canonical(hashes(frontmatter)) !== canonical(entry.hashes.frontmatter) || canonical(frontmatter) !== canonical(entry.source.frontmatter) || canonical(quotes.map((q) => hashes(q))) !== canonical(entry.hashes.quotes) || canonical(legacy.quotes.map((q) => hashes(q))) !== canonical(entry.hashes.sourceQuotes)) errors.push(`${book.id}:frontmatter-or-quote-hash-mismatch`);
  }
  if (inventory.invalidSources.length) errors.push("invalid-source-files");
  if (inventory.duplicateDates.length) errors.push("duplicate-publication-dates");
  if (inventory.invalidDates.length) errors.push("invalid-calendar-dates");
  const ids = inventory.entries.flatMap((row) => [row.candidate.book.id]);
  if (new Set(ids).size !== ids.length) errors.push("duplicate-source-book-ids");
  return { passed: errors.length === 0, fieldChecks, verifiedFiles: inventory.entries.length, errors };
}

export function renderReport(inventory: Inventory, sourceSha: string, verification: ReturnType<typeof verifyInventory>): string {
  const s = inventory.summary;
  const groups = inventory.suspectedReRecommendations.map((group) => `- ${markdown(group.title)}：${group.members.map((m) => `\`${m.bookId}\`（${markdown(m.author)}，${m.publicationDate ?? "draft"}，第${m.issueNumber ?? "—"}期）`).join("；")}。${group.reason}`).join("\n") || "- 无规则命中的疑似组；这不是外部书目身份审计。";
  const noteRows = inventory.entries.filter((row) => row.deficiencies.some((flag) => flag === "missing-editorNote" || flag.includes("40-100"))).map((row) => `| ${row.candidate.book.id} | ${markdown(row.candidate.book.title)} | ${row.candidate.issue.editorNote === undefined ? "缺失，保持缺失" : `${[...row.candidate.issue.editorNote].length} code points / ${row.candidate.issue.editorNote.length} UTF-16`} |`).join("\n");
  return `# Daily Book 历史内容只读盘点与候选映射\n\n**只读报告，不是可执行导入数据或书目合并批准。** 来源SHA：\`${sourceSha}\`。源码内容、原schema及任何数据库均未改动。\n\n## 数量与校验\n\n| 项目 | 数量 |\n|---|---:|\n| 当前loader直接读取的Markdown源记录 | ${s.sourceFiles} |\n| 候选Book / Issue（每源记录一对，未自动合书） | ${s.candidateBooks} / ${s.candidateIssues} |\n| published / draft / withdrawn（按源发布日期推导） | ${s.published} / ${s.drafts} / ${s.withdrawn} |\n| Quote（顺序和出处全部保留） | ${s.quotes} |\n| 有实质Markdown正文的源文件 | ${s.rawBodiesWithContent} |\n| 缺失editorNote / 现有note不满足新40–100码点门槛 | ${s.missingEditorNote} / ${s.existingEditorNoteOutsideNewLength} |\n| 空白/明显占位来源字段（启发式，非出处认证） | ${s.quoteSourcesNeedingReview} |\n| 疑似重荐或同名组 | ${s.suspectedReRecommendationGroups} |\n\n源日期范围${s.firstPublicationDate ?? "—"}至${s.lastPublicationDate ?? "—"}；重复日期${inventory.duplicateDates.length}组，非法日历日期${inventory.invalidDates.length}个。现行buildIssueNumberIndex按日期ASC、同日id排序，保留全部历史期号，max=${s.maxHistoricalIssueNumber}，将来接续值=${s.nextIssueNumber}；草稿保持null，不能在将来导入时重新按全量内容排序挪动历史期号。\n\n逐字段逆向投影校验：**${verification.passed ? "通过" : "未通过"}**，${verification.verifiedFiles}个源文件、${verification.fieldChecks}项字段核对；详见verification.json。未知frontmatter字段、源文本与哈希均保留在inventory.json。全量候选映射不根据标题自动合并；候选Book数量不等于已确认的独立作品数。\n\n## 映射与保留规则\n\n- Book保留原id、title、author、category、year/pages/rating的**数值类型**、coverTitle及coverAuthor；desc逐字映射description。没有新造封面地址/alt、出版信息或元数据。\n- 每源记录候选Issue ID为legacy-原id，bookId保持原id；有publishedDate映射published，无日期/null映射draft。该ID只是待Steven审查的确定性候选，不是导入批准。\n- editorNote缺失保持缺失，不补文本，不把缺失伪装为空字符串。未来发布规则的缺项单列，不回写历史。\n- Markdown正文保留分隔符后**原始文本（含空白和换行）**，同时保留旧loader的trim后字段哈希；若只有frontmatter.body则沿用它，两者都有时原始文本和frontmatter内容都留档。新应用仍不新增正文展示功能。\n- Quote ID为legacy-原id-quote-原位置(1起)，position为0起；text逐字保留，quotes.page逐字映射sourceLabel；未删除重复引文，也未核实引文真实性。\n- 每个源文件含Git blob ID、原文SHA256；每个字段含present标记及规范JSON值的SHA256，区分缺失/null/空串；另有原始正文UTF-8哈希。候选字段与原字段名称变化也可对照。\n- 不生成createdAt/updatedAt/version等非源系统字段，不产生SQL、D1调用或任何导入动作。确认身份、处理缺项和导入另立任务。\n\n## 疑似同书/重荐（仅线索）\n\n${groups}\n\n附加线索：-revisit ID ${inventory.revisitIdSignals.length}条；重复标准化引文文本${inventory.duplicateQuoteTexts.length}组，详见inventory.json。这些规则不覆盖所有别名/版本/译名，不是已完成全库书目去重。\n\n## 历史编辑话缺项/新门槛差异\n\n新门槛按Unicode码点计数，同时列UTF-16长度；旧schema仅要求现有note非空且最多100 UTF-16，不以新门槛抹掉旧内容。无正文是保留性信息，不当成新发布阻塞条件。\n\n| 原id | 书名 | editorNote情况 |\n|---|---|---|\n${noteRows || "| — | — | 无 |"}\n\n## 复现与边界\n\n在包含这份工具的独立分支，先按原lockfile安装（不升级依赖），再运行：\n\n\`\`\`sh\nnpm ci --ignore-scripts\nnpx --no-install tsx scripts/content-inventory.ts --source-ref ${sourceSha} --out ../daily-book-inventory-output\nnpx --no-install vitest run tests/unit/content-inventory.test.ts\n\`\`\`\n\n工具从Git对象读取固定SHA下src/data/books/*.md，并检查现行loader/schema/期号代码与该SHA逐字相同，拒绝混用另一版本解析规则；不依赖未提交内容、网络资料、线上API或数据库。结果不含时钟随机数，固定来源SHA、工具提交和依赖环境可重复产出相同字节。输出目录只能在仓库外，拒绝覆盖不同内容的既有文件。\n\n**下一步：Steven审查候选身份映射、缺项保留与历史期号；本报告不授权后续导入、业务写接口或生产切换。**\n`;
}

export function outsideRepository(root: string, requested: string): string {
  const canonicalRoot = realpathSync(root);
  let parent = resolve(requested);
  const missing: string[] = [];
  while (!existsSync(parent)) { missing.unshift(basename(parent)); parent = dirname(parent); }
  const destination = resolve(realpathSync(parent), ...missing);
  const rel = relative(canonicalRoot, destination);
  if (!rel.startsWith(`..${sep}`) && rel !== "..") throw new Error("Output must be outside the repository, including symlinks; content/schema are read-only");
  return destination;
}

function main() {
  const args = process.argv.slice(2);
  const option = (key: string) => { const i = args.indexOf(key); return i < 0 ? undefined : args[i + 1]; };
  if (args.length !== 4 || args[0] !== "--source-ref" || args[2] !== "--out" || !option("--source-ref") || !option("--out")) throw new Error("Usage: tsx scripts/content-inventory.ts --source-ref <git-ref> --out <outside-repository-dir>");
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const git = (...argv: string[]) => execFileSync("git", ["-C", root, ...argv]);
  const sourceSha = git("rev-parse", "--verify", "--end-of-options", `${option("--source-ref")}^{commit}`).toString().trim();
  if (!/^[a-f0-9]{40}$/.test(sourceSha)) throw new Error("Not an exact Git commit");
  const out = outsideRepository(root, option("--out")!);
  const readerPaths = ["package.json", "package-lock.json", "src/data/book-file.ts", "src/data/books.ts", "src/schemas/book.ts", "src/utils/issue-number.ts"];
  const readerCode = readerPaths.map((path) => {
    const data = git("show", `${sourceSha}:${path}`);
    if (!data.equals(readFileSync(resolve(root, path)))) throw new Error(`Checked-out parser differs from source snapshot: ${path}. Use a fresh worktree at the source ref.`);
    return { path, sha256: sha256(data), blobId: git("rev-parse", `${sourceSha}:${path}`).toString().trim() };
  });
  const tree = git("ls-tree", "-r", "-z", sourceSha, "--", "src/data/books").toString().split("\0").filter(Boolean).map((line) => {
    const match = /^\d+ blob ([a-f0-9]{40})\t([\s\S]+)$/.exec(line);
    if (!match) throw new Error("Unexpected source tree entry");
    return { blobId: match[1], path: match[2] };
  }).filter((row) => /^src\/data\/books\/[^/]+\.md$/.test(row.path)).sort((a, b) => a.path.localeCompare(b.path));
  // Read immutable blobs in one process, rather than spawning Git for every file and hash.
  const batch = execFileSync("git", ["-C", root, "cat-file", "--batch"], {
    input: tree.map((row) => row.blobId + "\n").join(""), maxBuffer: 32 * 1024 * 1024,
  });
  let offset = 0;
  const files = tree.map((row) => {
    const end = batch.indexOf(10, offset);
    const header = /^([a-f0-9]{40}) blob (\d+)$/.exec(batch.subarray(offset, end).toString());
    if (!header || header[1] !== row.blobId) throw new Error("Invalid Git batch header");
    const start = end + 1;
    const finish = start + Number(header[2]);
    if (batch[finish] !== 10) throw new Error("Invalid Git batch delimiter");
    const raw = batch.subarray(start, finish); offset = finish + 1;
    if (!Buffer.from(raw.toString("utf8"), "utf8").equals(raw)) throw new Error(`Non-UTF8 source requires manual handling: ${row.path}`);
    return { ...row, raw: raw.toString("utf8") };
  });
  if (offset !== batch.length) throw new Error("Extra Git batch bytes");
  if (!files.length) throw new Error("No canonical source files");
  const inventory = createInventory(files);
  const verification = verifyInventory(inventory, files);
  const require = createRequire(import.meta.url);
  const lock = JSON.parse(readFileSync(resolve(root, "package-lock.json"), "utf8"));
  const runtimePackages = Object.fromEntries(["js-yaml", "zod", "tsx"].map((name) => {
    const version = (require(`${name}/package.json`) as { version: string }).version;
    if (version !== lock.packages[`node_modules/${name}`].version) throw new Error(`Installed parser package differs from lockfile: ${name}`);
    return [name, version];
  }));
  const metadata = { sourceSha, node: process.version, runtimePackages, sourceTree: git("rev-parse", `${sourceSha}^{tree}`).toString().trim(), toolHead: git("rev-parse", "HEAD").toString().trim(), toolSHA256: sha256(readFileSync(fileURLToPath(import.meta.url))), readerCode };
  const outputs: Record<string, string> = {
    "inventory.json": JSON.stringify({ ...metadata, ...inventory }, null, 2) + "\n",
    "verification.json": JSON.stringify({ ...metadata, ...verification }, null, 2) + "\n",
    "report.md": renderReport(inventory, sourceSha, verification),
  };
  // Preflight every path before writing; never overwrite source or another report.
  for (const [name, data] of Object.entries(outputs)) if (existsSync(resolve(out, name)) && readFileSync(resolve(out, name), "utf8") !== data) throw new Error(`Refusing to replace different existing output: ${resolve(out, name)}`);
  mkdirSync(out, { recursive: true });
  for (const [name, data] of Object.entries(outputs)) writeFileSync(resolve(out, name), data);
  process.stdout.write(JSON.stringify({ sourceSha, summary: inventory.summary, verification, output: out }, null, 2) + "\n");
  if (!verification.passed) process.exitCode = 2;
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) main();
