import { env } from 'cloudflare:workers';
import { BOOK_JSON, ISSUE_JSON } from '../domain/issue-projection';
import { validId } from '../domain/pagination';
import type { Book, PublicIssue } from '../domain/types';
import { apiError } from '../http';
import { encodeAdminCursor, type AdminPageInput, type IssueStatus } from './pagination';
import { encodeIssueHistoryCursor, parseIssueHistoryPage } from './issue-history-input';

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

interface IssueEventRow {
  event_id:string;resource_type:'issue';resource_id:string;operation:string;before_version:number|null;after_version:number;
  before_json:string|null;after_json:string;created_at:string;request_id:string;actor:string;
}
export async function issueHistory(id:string,params:URLSearchParams):Promise<Response> {
  if(!validId(id))return apiError(404,'ISSUE_NOT_FOUND','刊期不存在。');
  const {limit,cursor}=parseIssueHistoryPage(params,id);
  const exists=await env.DB.prepare('SELECT id FROM issues WHERE id=?').bind(id).first();
  if(!exists)return apiError(404,'ISSUE_NOT_FOUND','刊期不存在。');
  const rows=(await env.DB.prepare(`SELECT event_id,resource_type,resource_id,operation,before_version,after_version,before_json,after_json,created_at,request_id,actor
    FROM admin_audit_events WHERE resource_type='issue' AND resource_id=?
    ${cursor?'AND (created_at<? OR (created_at=? AND event_id<?))':''} ORDER BY created_at DESC,event_id DESC LIMIT ?`)
    .bind(id,...(cursor?[cursor.createdAt,cursor.createdAt,cursor.eventId]:[]),limit+1).all<IssueEventRow>()).results;
  const selected=rows.slice(0,limit);const items=selected.map(row=>({id:row.event_id,resourceType:row.resource_type,resourceId:row.resource_id,operation:row.operation,
    beforeVersion:row.before_version,afterVersion:row.after_version,before:row.before_json===null?null:JSON.parse(row.before_json),after:JSON.parse(row.after_json),
    createdAt:row.created_at,requestId:row.request_id,actor:row.actor}));
  const last=selected.at(-1);
  return Response.json({items,nextCursor:rows.length>limit?encodeIssueHistoryCursor(last!.created_at,last!.event_id,id):null});
}
