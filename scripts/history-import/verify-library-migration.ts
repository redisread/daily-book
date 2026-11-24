import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { ROOT, tableHash } from './model';
import { LocalManagementTarget } from './local-management-db';
import { loadManagementPlan } from './model-management';
import { applyManagementLocal, readManagementTablesForTest } from './apply-management';

async function verify() {
  assert(process.argv.length === 3, 'Usage: tsx scripts/history-import/verify-library-migration.ts <approved inventory>');
  const plan = loadManagementPlan(resolve(process.argv[2]));
  const local = new LocalManagementTarget('test-book-library-' + randomUUID());
  const imported = await applyManagementLocal(plan, local);
  assert.equal(imported.status, 'applied-local');
  const source = await readManagementTablesForTest(local);
  const hash = tableHash(source);
  const reader = resolve(ROOT, 'apps/reader');
  const apply = () => execFileSync(resolve(reader, 'node_modules/.bin/cf'), [
    'd1', 'migrations', 'apply', '00000000-0000-4000-8000-000000000072',
    '--local', '--mode', 'reader-admin-write-test', '--persist-to', local.persistPath,
    '--dir', resolve(reader, 'library-migrations'),
  ], { cwd: reader, encoding: 'utf8' });
  apply();

  const contents = await local.rows('SELECT * FROM book_content ORDER BY book_id');
  const excerpts = await local.rows('SELECT * FROM book_quotes ORDER BY book_id,position');
  const sourceByBook = new Map<string, typeof source.issues[number]>();
  for (const issue of [...source.issues].sort((a, b) => String(a.publication_date).localeCompare(String(b.publication_date)))) {
    assert.equal(issue.status, 'published');
    sourceByBook.set(String(issue.book_id), issue);
  }
  assert.equal(contents.length, 128);
  assert.equal(excerpts.length, source.quotes.filter(quote =>
    [...sourceByBook.values()].some(issue => issue.id === quote.issue_id)).length);
  const quoteGroups = new Map<string, typeof excerpts>();
  for (const quote of excerpts) {
    const id = String(quote.book_id);
    const group = quoteGroups.get(id) ?? [];
    group.push(quote);
    quoteGroups.set(id, group);
  }
  for (const row of contents) {
    const id = String(row.book_id);
    const issue = sourceByBook.get(id)!;
    assert.deepEqual(row, {
      book_id: id, status: 'published', editor_note: issue.editor_note, body: issue.body, eligible_on: '0001-01-01',
    });
    assert.deepEqual(quoteGroups.get(id) ?? [], source.quotes.filter(quote => quote.issue_id === issue.id)
      .sort((a, b) => Number(a.position) - Number(b.position))
      .map(({ id: quoteId, text, source_label, position }) => ({ book_id: id, id: quoteId, text, source_label, position })));
  }
  assert.deepEqual(JSON.parse(apply()), []);
  const appliedMigrations = await local.rows('SELECT name FROM d1_migrations ORDER BY id');
  assert.deepEqual(appliedMigrations.map(row => row.name), [
    '0001_initial.sql', '0002_management_writes.sql', '0003_management_rate_limits.sql', '0004_book_library.sql',
  ]);
  assert.equal(tableHash(await readManagementTablesForTest(local)), hash);
  assert.deepEqual(await local.rows('SELECT * FROM book_content ORDER BY book_id'), contents);
  assert.deepEqual(await local.rows('SELECT * FROM book_quotes ORDER BY book_id,position'), excerpts);
  assert.equal((await local.rows('SELECT day FROM daily_recommendations')).length, 0);
  console.log(JSON.stringify({
    status: 'passed', sourceBooks: source.books.length, sourceIssues: source.issues.length, sourceQuotes: source.quotes.length,
    libraryBooks: contents.length, libraryExcerpts: excerpts.length, sourceHash: hash, historicalImportFields: imported.fieldChecks,
    migrationSHA256: createHash('sha256').update(readFileSync(resolve(reader, 'library-migrations/0004_book_library.sql'))).digest('hex'),
    fieldDifferences: 0, legacyRowsUnchanged: true, repeatVerified: true,
    repeatedBookSourceIssueNumber: sourceByBook.get('the-mythical-man-month')?.issue_number,
  }, null, 2));
}
verify().catch(error => { console.error(error); process.exitCode = 1; });
