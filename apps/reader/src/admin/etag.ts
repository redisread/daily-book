import { Buffer } from 'node:buffer';
import type { Book } from '../domain/types';
import type { AdminIssue } from './issues';
function checkedVersion(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error('Invalid representation version');
  return value;
}
export function bookETag(book: Book): string {
  return `"b:${encodeURIComponent(book.id)}:${checkedVersion(book.version)}"`;
}
export function issueETag(issue: AdminIssue): string {
  // The unambiguous encoded tuple covers the Issue (including its quote set)
  // and the current shared Book. Never strip W/ or turn an incoming tag strong.
  const tuple = [issue.id,checkedVersion(issue.version),issue.book.id,checkedVersion(issue.book.version)];
  return `"i:${Buffer.from(JSON.stringify(tuple)).toString('base64url')}"`;
}
