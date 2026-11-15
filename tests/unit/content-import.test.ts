import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInventory } from '../../scripts/content-inventory';
import { parseArguments } from '../../scripts/import-history';
import { projectEntries, materialize, compareTables, tableHash, ROOT, ImportError, loadPlan, type Overlay } from '../../scripts/history-import/model';
import { LocalTarget } from '../../scripts/history-import/local-db';
import { normalizeSQL, classifyDefinitions } from '../../scripts/history-import/schema';
const overlay = JSON.parse(readFileSync(resolve(ROOT, 'scripts/history-import/overlay.json'), 'utf8')) as Overlay;
function source(id: string, date: string, body = '\n  原始正文\n') {
  return { path:`src/data/books/${id}.md`, raw:`---\nid: ${id}\ntitle: 人月神话\nauthor: 测试作者\ncategory: 技术\nyear: 1975\npages: 322\nrating: 4.5\ndesc: 测试简介\ncoverTitle: "人月\\n神话"\ncoverAuthor: 测试作者\npublishedDate: '${date}'\nquotes:\n  - text: "同一句书摘，不能跨期删重。"\n    page: '1'\n  - text: "引号与换行原样。"\n    page: '第二章'\n---\n${body}` };
}
const entries = () => createInventory([source('the-mythical-man-month','2026-01-01'),source('the-mythical-man-month-revisit','2026-01-02')]).entries;
describe('reviewed history overlay and projection', () => {
  it('merges only Book identity and preserves both issues and every quote', () => {
    const data = projectEntries(entries(), overlay);
    expect(data.rows.books).toHaveLength(1); expect(data.rows.issues).toHaveLength(2); expect(data.rows.quotes).toHaveLength(4);
    expect(data.rows.issues.map(row => row.id)).toEqual(['legacy-the-mythical-man-month','legacy-the-mythical-man-month-revisit']);
    expect(data.rows.issues.every(row => row.book_id === 'the-mythical-man-month')).toBe(true);
    expect(data.mappings.map(row => row.originalBookId).sort()).toEqual(['the-mythical-man-month','the-mythical-man-month-revisit']);
  });
  it('does not merge another identical title without a reviewed identity', () => {
    const extra = createInventory([source('another-id','2026-01-03')]).entries;
    expect(projectEntries([...entries(),...extra], overlay).rows.books).toHaveLength(2);
  });
  it('keeps absent notes/image fields as explicit NULL, not fabricated content', () => {
    const data = projectEntries(entries(), overlay);
    expect(data.rows.issues.every(row => row.editor_note === null)).toBe(true);
    expect(data.rows.books[0].cover_url).toBeNull(); expect(data.rows.books[0].cover_alt).toBeNull();
  });
  it('preserves raw body, cover newline, numeric values, source text and order', () => {
    const original = entries(); const data = projectEntries(original, overlay);
    expect(data.rows.books[0]).toMatchObject({ year:1975,pages:322,rating:4.5,cover_title:'人月\n神话' });
    for (const entry of original) {
      expect(data.rows.issues.find(row => row.id === entry.candidate.issue.id)?.body).toBe(entry.candidate.issue.body);
      for (const quote of entry.candidate.quotes) expect(data.rows.quotes.find(row => row.id === quote.id)).toMatchObject({ text:quote.text,source_label:quote.sourceLabel,position:quote.position,issue_id:quote.issueId });
    }
  });
  it('stops if reviewed shared metadata now conflicts', () => {
    const data = entries(); data[1].candidate.book.pages++;
    expect(() => projectEntries(data, overlay)).toThrow(/fields no longer match/);
  });
  it('rejects any additional identity decision', () => {
    expect(() => projectEntries(entries(), { ...overlay, bookIdentities:[...overlay.bookIdentities,{ canonicalId:'other',sourceIds:['a','b'] }] })).toThrow(/Only the reviewed/);
  });
  it('requires both reviewed identities and rejects duplicate source IDs', () => {
    expect(() => projectEntries(entries().slice(0,1),overlay)).toThrow(/Both reviewed/);
    const data = entries(); expect(() => projectEntries([...data,data[0]],overlay)).toThrow(/Duplicate original/);
  });
  it('materializes system metadata only once and does not mutate semantic rows', () => {
    const data = projectEntries(entries(),overlay).rows; const before = tableHash(data);
    const result = materialize(data,'2026-11-07T12:00:00.000Z');
    expect(result.books[0]).toMatchObject({ version:1,created_at:'2026-11-07T12:00:00.000Z',updated_at:'2026-11-07T12:00:00.000Z' });
    expect(tableHash(data)).toBe(before); expect(data.books[0].created_at).toBeUndefined();
    expect(() => materialize(data,'2026-99-99T12:00:00.000Z')).toThrow(ImportError);
  });
  it('readback comparison checks values, types, missing fields and row coverage', () => {
    const expected = materialize(projectEntries(entries(),overlay).rows,'2026-11-07T12:00:00.000Z');
    expect(compareTables(expected,structuredClone(expected)).fields).toBe(15+20+20);
    for (const mutate of [
      (data:typeof expected) => { data.books[0].pages = '322'; },
      (data:typeof expected) => { data.issues[0].body = String(data.issues[0].body).trim(); },
      (data:typeof expected) => { delete data.books[0].cover_url; },
      (data:typeof expected) => { data.quotes.pop(); },
    ]) { const data = structuredClone(expected); mutate(data); expect(() => compareTables(expected,data)).toThrow(ImportError); }
  });
});
describe('local CLI boundary', () => {
  it('defaults to dry-run, requires explicit input and recognizes only local apply', () => {
    expect(parseArguments(['--input','sample.json']).apply).toBe(false);
    expect(parseArguments(['--input','sample.json','--apply-local']).apply).toBe(true);
    expect(() => parseArguments([])).toThrow(/required/);
  });
  for (const flag of ['--remote','--database-id','--target','--config','--reset','--force','--apply'])
    it(`rejects ${flag} instead of offering an unsafe alternate execution path`, () => expect(() => parseArguments(['--input','sample.json',flag])).toThrow(ImportError));
  it('rejects a non-regular inventory input before reading it', () => {
    expect(() => loadPlan(ROOT)).toThrow(/bounded regular file/);
  });
  it('rejects duplicate/missing-value flags', () => {
    for (const args of [['--input'],['--input','a','--input','b'],['--input','a','--apply-local','--apply-local'],['--input','a','--report']]) expect(() => parseArguments(args)).toThrow(ImportError);
  });
  it('rejects target namespace traversal/remote names before any IO', () => {
    for (const value of ['../outside','production','https://example.com','test-../x']) expect(() => new LocalTarget(value)).toThrow(ImportError);
  });
  it('normalizes only SQL whitespace, not whitespace inside quoted values', () => {
    expect(normalizeSQL("CREATE  TABLE\nx (v TEXT DEFAULT 'a  b')")).toBe("CREATE TABLE x (v TEXT DEFAULT 'a  b')");
    expect(normalizeSQL("CREATE TABLE x (v TEXT DEFAULT 'a b')")).not.toBe(normalizeSQL("CREATE TABLE x (v TEXT DEFAULT 'a  b')"));
  });
  it('does not whitelist an unknown table merely by its metadata-like name', () => {
    expect(() => classifyDefinitions([{ type:'table',name:'d1_migrations',tbl_name:'d1_migrations',sql:'CREATE TABLE d1_migrations(name TEXT,private_value TEXT)' }])).toThrow(/metadata schema/);
  });
  it('rejects unknown schema even when it has no rows', () => {
    expect(() => classifyDefinitions([{ type:'table',name:'sqlitex_unknown',tbl_name:'sqlitex_unknown',sql:'CREATE TABLE sqlitex_unknown(x)' }])).toThrow(/unknown or changed schema/);
  });
});
