import { env } from 'cloudflare:workers';
import { BOOK_JSON, ISSUE_JSON } from '../domain/issue-projection';
import { validId } from '../domain/pagination';
import type { Book, PublicIssue } from '../domain/types';
import { encodeAdminCursor, type AdminPageInput, type IssueStatus } from './pagination';

export type AdminIssue = Omit<PublicIssue, 'status' | 'publicationDate' | 'issueNumber'> & {
  status: IssueStatus; publicationDate: string | null; issueNumber: number | null;
};
// These services are imported only by authenticated management route handlers.
// They never populate the public request-read cache, change visibility or write.
export async function readAdminIssue(id: string): Promise<AdminIssue | null> {
  if (!validId(id)) return null;
  const row = await env.DB.prepare(`SELECT ${ISSUE_JSON} AS issue_json FROM issues i JOIN books b ON b.id=i.book_id WHERE i.id=?`)
    .bind(id).first<{ issue_json: string }>();
  return row ? JSON.parse(row.issue_json) as AdminIssue : null;
}
export async function readAdminBook(id: string): Promise<Book | null> {
  if (!validId(id)) return null;
  const row = await env.DB.prepare(`SELECT ${BOOK_JSON} AS book_json FROM books b WHERE b.id=?`).bind(id).first<{ book_json: string }>();
  return row ? JSON.parse(row.book_json) as Book : null;
}
export async function listAdminIssues({ limit,status,cursor }: AdminPageInput): Promise<{ items: AdminIssue[]; nextCursor: string | null }> {
  const clauses: string[] = []; const values: (string | number | null)[] = [];
  if (status !== null) { clauses.push('i.status=?');values.push(status); }
  if (cursor) {
    if (cursor.publicationDate === null) { clauses.push('(i.publication_date IS NULL AND i.id<?)');values.push(cursor.id); }
    else { clauses.push('(i.publication_date IS NULL OR i.publication_date<? OR (i.publication_date=? AND i.id<?))');values.push(cursor.publicationDate,cursor.publicationDate,cursor.id); }
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  // SQLite DESC places NULL dates last. The null/non-null cursor branches must
  // match that order exactly, even when the boundary row is no longer present.
  const result = await env.DB.prepare(`SELECT ${ISSUE_JSON} AS issue_json FROM issues i JOIN books b ON b.id=i.book_id
    ${where} ORDER BY i.publication_date DESC,i.id DESC LIMIT ?`).bind(...values,limit+1).all<{ issue_json: string }>();
  const rows = result.results.map(row => JSON.parse(row.issue_json) as AdminIssue);
  const items = rows.slice(0,limit);
  return { items,nextCursor:rows.length > limit ? encodeAdminCursor(items.at(-1)!,status) : null };
}
