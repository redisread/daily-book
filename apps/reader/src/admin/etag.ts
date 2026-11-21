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
  // Length-delimited version suffixes keep the opaque token collision-free,
  // while SQL can capture the same strong tag atomically in a write receipt.
  const identity = issueIdentity(issue.id,issue.book.id);
  return `"i:${identity}-${versionPart(issue.version)}-${versionPart(issue.book.version)}"`;
}
export function issueIdentity(issueId:string,bookId:string): string {
  return Buffer.from(JSON.stringify([issueId,bookId])).toString('base64url');
}
function versionPart(value:number): string { return String(checkedVersion(value)).padStart(16,'0'); }
export function issueETagFromRowSQL(issueId:string,bookId:string,issueAlias='i',bookAlias='b'):string {
  const identity=issueIdentity(issueId,bookId);
  return `char(34)||'i:${identity}-'||printf('%016d',${issueAlias}.version)||'-'||printf('%016d',${bookAlias}.version)||char(34)`;
}
export function issueETagFromAuditSQL(issueId:string,bookId:string): string {
  const identity=issueIdentity(issueId,bookId);
  return `char(34)||'i:${identity}-'||printf('%016d',json_extract(a.after_json,'$.version'))||'-'||printf('%016d',json_extract(a.after_json,'$.book.version'))||char(34)`;
}
