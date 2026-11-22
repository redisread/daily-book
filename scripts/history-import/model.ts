import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonical, sha256, verifyInventory, type Inventory, type Entry } from '../content-inventory';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const PINS = Object.freeze({
  sourceCommit: '8b991098f984a5f8870bd01741e3cb937b63d50d',
  inventoryCommit: '185d2a0438b73cd7432ee7baaf489e46e2ae564d',
  inventoryToolSHA256: 'be003c1a2099085db6667c83412bb0abc4ecefe03392d19badad8e3ed7f4c7db',
  inventorySHA256: '4918f76db3da19ba122ed01073b942551ed8e64d926a5c5ee8fb2d370879b5ad',
  schemaCommit: '98dfb5cfce872a54b28501c5aa2b73adc3f0703d',
  schemaSHA256: 'cbda5b150021955d388fe22984a3167f110aae1b953019295803e95362856e3b',
  overlaySHA256: '27f6e44aff5da93f9d3c64f087fcd8d4f748233421e35adaaa10e81880382bb8',
});
export type Scalar = string | number | null;
export type Row = Record<string, Scalar> & { id: string };
export interface Tables { books: Row[]; issues: Row[]; quotes: Row[] }
export interface Overlay { formatVersion: number; sourceCommit: string; bookIdentities: { canonicalId: string; sourceIds: string[] }[] }
interface Metadata {
  sourceSha: string; toolHead: string; toolSHA256: string;
  readerCode: { path: string; sha256: string; blobId: string }[];
}
export interface Mapping { sourcePath: string; sourceSHA256: string; originalBookId: string; bookId: string; issueId: string; issueNumber: number | null; publicationDate: string | null; quoteIds: string[] }
export interface Plan {
  formatVersion: 1; inputPath: string; inputFingerprint: string; semanticSHA256: string;
  provenance: typeof PINS & { importerSHA256: string };
  sourceFieldChecks: number; mappings: Mapping[]; rows: Tables;
  summary: { books: number; issues: number; quotes: number; missingEditorNote: number; rawBodiesWithContent: number; nextIssueNumber: number };
}
export class ImportError extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = 'ImportError'; }
}
export function ensure(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new ImportError(code, message);
}
const compareId = (a: Row, b: Row) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
export function ordered(tables: Tables): Tables {
  return { books: [...tables.books].sort(compareId), issues: [...tables.issues].sort(compareId), quotes: [...tables.quotes].sort(compareId) };
}
export const tableHash = (tables: Tables) => sha256(canonical(ordered(tables)));
export function materialize(tables: Tables, importedAt: string): Tables {
  ensure(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(importedAt) && Number.isFinite(Date.parse(importedAt)) && new Date(importedAt).toISOString() === importedAt, 'INVALID_CLOCK', 'Invalid receipt import timestamp');
  return ordered({
    books: tables.books.map(row => ({ ...row, version: 1, created_at: importedAt, updated_at: importedAt })),
    issues: tables.issues.map(row => ({ ...row, version: 1, created_at: importedAt, updated_at: importedAt })),
    quotes: tables.quotes.map(row => ({ ...row })),
  });
}
export function projectEntries(entries: Entry[], overlay: Overlay): { rows: Tables; mappings: Mapping[] } {
  ensure(overlay.formatVersion === 1 && overlay.sourceCommit === PINS.sourceCommit, 'OVERLAY_INVALID', 'Unsupported overlay source/version');
  ensure(canonical(overlay.bookIdentities) === canonical([{ canonicalId: 'the-mythical-man-month', sourceIds: ['the-mythical-man-month', 'the-mythical-man-month-revisit'] }]), 'OVERLAY_INVALID', 'Only the reviewed two-record Book identity mapping is permitted');
  const sourceIds = new Set<string>(); const books = new Map<string, Row>();
  const issues: Row[] = []; const quotes: Row[] = []; const mappings: Mapping[] = [];
  for (const entry of entries) {
    const { book, issue } = entry.candidate;
    ensure(!sourceIds.has(book.id), 'SOURCE_ID_CONFLICT', 'Duplicate original Book identity'); sourceIds.add(book.id);
    const id = book.id === 'the-mythical-man-month-revisit' ? 'the-mythical-man-month' : book.id;
    const row: Row = {
      id, title: book.title, author: book.author, category: book.category,
      year: book.year ?? null, pages: book.pages ?? null, rating: book.rating ?? null,
      description: book.description, cover_title: book.coverTitle, cover_author: book.coverAuthor,
      // The legacy schema has no image/alt fields. Do not invent either.
      cover_url: null, cover_alt: null,
    };
    const previous = books.get(id);
    ensure(!previous || canonical(previous) === canonical(row), 'BOOK_MAPPING_CONFLICT', 'Reviewed shared Book fields no longer match');
    if (!previous) books.set(id, row);
    issues.push({ id: issue.id, book_id: id, status: issue.status, publication_date: issue.publicationDate, issue_number: issue.issueNumber,
      editor_note: Object.hasOwn(issue, 'editorNote') ? issue.editorNote! : null, body: issue.body });
    quotes.push(...entry.candidate.quotes.map(quote => ({ id: quote.id, issue_id: quote.issueId, text: quote.text, source_label: quote.sourceLabel, position: quote.position })));
    mappings.push({ sourcePath: entry.source.path, sourceSHA256: entry.source.sha256, originalBookId: book.id, bookId: id,
      issueId: issue.id, issueNumber: issue.issueNumber, publicationDate: issue.publicationDate, quoteIds: entry.candidate.quotes.map(quote => quote.id) });
  }
  ensure(sourceIds.has('the-mythical-man-month') && sourceIds.has('the-mythical-man-month-revisit'), 'OVERLAY_INVALID', 'Both reviewed Book identities must exist');
  return { rows: ordered({ books: [...books.values()], issues, quotes }), mappings };
}
const importerFiles = [
  'scripts/import-history.ts', 'scripts/history-import/model.ts', 'scripts/history-import/schema.ts',
  'scripts/history-import/local-db.ts', 'scripts/history-import/apply.ts', 'scripts/history-import/overlay.json',
  'apps/reader/tools/history-import/cloudflare.config.ts',
];
function hashFile(path: string): string { return sha256(readFileSync(resolve(ROOT, path))); }
export function loadPlan(inputPath: string): Plan {
  const inputStat = statSync(inputPath);
  ensure(inputStat.isFile() && inputStat.size <= 8 * 1024 * 1024, 'INPUT_DRIFT', 'Inventory must be a bounded regular file');
  const raw = readFileSync(inputPath);
  ensure(raw.length <= 8 * 1024 * 1024 && sha256(raw) === PINS.inventorySHA256, 'INPUT_DRIFT', 'Inventory bytes differ from the approved immutable package');
  const inventory = JSON.parse(raw.toString('utf8')) as Inventory & Metadata;
  ensure(inventory.sourceSha === PINS.sourceCommit && inventory.toolHead === PINS.inventoryCommit && inventory.toolSHA256 === PINS.inventoryToolSHA256,
    'INPUT_DRIFT', 'Inventory provenance differs from the approved source/tool');
  ensure(hashFile('scripts/content-inventory.ts') === PINS.inventoryToolSHA256, 'TOOL_DRIFT', 'Pinned inventory implementation changed');
  for (const file of inventory.readerCode)
    ensure(hashFile(file.path) === file.sha256, 'READER_DRIFT', `Pinned legacy reader changed: ${file.path}`);
  ensure(canonical(readdirSync(resolve(ROOT, 'apps/reader/migrations')).sort()) === canonical(['0001_initial.sql']), 'SCHEMA_DRIFT', 'Unreviewed migration files exist');
  ensure(hashFile('apps/reader/migrations/0001_initial.sql') === PINS.schemaSHA256, 'SCHEMA_DRIFT', 'Formal schema differs from the reviewed schema');
  ensure(hashFile('scripts/history-import/overlay.json') === PINS.overlaySHA256, 'OVERLAY_DRIFT', 'Reviewed overlay bytes changed');
  const verification = verifyInventory(inventory);
  ensure(verification.passed && verification.fieldChecks === 3060, 'SOURCE_INVALID', 'Original field/hash/identity verification failed');
  const overlay = JSON.parse(readFileSync(resolve(ROOT, 'scripts/history-import/overlay.json'), 'utf8')) as Overlay;
  const { rows, mappings } = projectEntries(inventory.entries, overlay);
  ensure(rows.books.length === 128 && rows.issues.length === 129 && rows.quotes.length === 627, 'COUNT_MISMATCH', 'Unexpected mapped historical counts');
  ensure(rows.issues.every(row => row.status === 'published') && rows.issues.filter(row => row.editor_note === null).length === 98,
    'COUNT_MISMATCH', 'Historical publication/note deficiencies changed');
  ensure(canonical(rows.issues.map(row => row.issue_number).sort((a,b) => Number(a)-Number(b))) === canonical(Array.from({ length:129 }, (_, i) => i+1)),
    'IDENTITY_DRIFT', 'Historical issue numbers must remain exactly 1–129');
  const importerSHA256 = sha256(canonical(Object.fromEntries(importerFiles.map(path => [path, hashFile(path)]))));
  const provenance = { ...PINS, importerSHA256 };
  const semanticSHA256 = tableHash(rows);
  return { formatVersion: 1, inputPath: resolve(inputPath), provenance, semanticSHA256,
    inputFingerprint: sha256(canonical({ provenance, semanticSHA256 })), sourceFieldChecks: verification.fieldChecks, rows, mappings,
    summary: { books:128, issues:129, quotes:627, missingEditorNote:98, rawBodiesWithContent:2, nextIssueNumber:130 } };
}
export function assertPlanUnchanged(plan: Plan): void {
  const fresh = loadPlan(plan.inputPath);
  ensure(canonical(plan) === canonical(fresh), 'INPUT_DRIFT', 'Inputs/tool or in-memory plan changed after planning');
}
export function compareTables(expected: Tables, actual: Tables): { fields: number; sha256: string } {
  let fields = 0;
  const e = ordered(expected), a = ordered(actual);
  for (const table of ['books', 'issues', 'quotes'] as const) {
    ensure(e[table].length === a[table].length, 'TARGET_CONFLICT', `${table}: row count mismatch`);
    for (let i = 0; i < e[table].length; i++) {
      const left = e[table][i], right = a[table][i];
      ensure(canonical(Object.keys(left).sort()) === canonical(Object.keys(right).sort()), 'TARGET_CONFLICT', `${table}: unexpected columns`);
      for (const key of Object.keys(left)) {
        fields++;
        ensure(canonical(left[key]) === canonical(right[key]), 'TARGET_CONFLICT', `${table}/${left.id}/${key}: readback differs`);
      }
    }
  }
  return { fields, sha256: tableHash(a) };
}
