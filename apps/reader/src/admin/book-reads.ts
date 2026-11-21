import { env } from 'cloudflare:workers';
import { Buffer } from 'node:buffer';
import { BOOK_JSON } from '../domain/issue-projection';
import { validId } from '../domain/pagination';
import type { Book } from '../domain/types';
import { apiError } from '../http';
import { adminRead } from './http';
import { parseBookPage,parseBookHistoryPage } from './book-page-input';

const encode=(value: object)=>Buffer.from(JSON.stringify(value)).toString('base64url');
export async function listBooks(params: URLSearchParams): Promise<Response> {
  const {limit,cursor}=parseBookPage(params);
  const result=await env.DB.prepare(`SELECT ${BOOK_JSON} AS book_json FROM books b ${cursor?'WHERE b.id>?':''} ORDER BY b.id ASC LIMIT ?`)
    .bind(...(cursor?[cursor.id]:[]),limit+1).all<{book_json:string}>();
  const rows=result.results.map(row=>JSON.parse(row.book_json) as Book);const items=rows.slice(0,limit);
  return Response.json({items,nextCursor:rows.length>limit?encode({v:1,scope:'admin-books',id:items.at(-1)!.id}):null});
}
interface EventRow {
  event_id:string; resource_type:'book'; resource_id:string; operation:string;
  before_version:number|null;after_version:number;before_json:string|null;after_json:string;created_at:string;request_id:string;actor:string;
}
export async function bookHistory(id:string,params:URLSearchParams): Promise<Response> {
  if (!validId(id)) return apiError(404,'BOOK_NOT_FOUND','书目不存在。');
  const {limit,cursor}=parseBookHistoryPage(params,id);
  const exists=await env.DB.prepare('SELECT id FROM books WHERE id=?').bind(id).first();
  if (!exists) return apiError(404,'BOOK_NOT_FOUND','书目不存在。');
  const rows=(await env.DB.prepare(`SELECT event_id,resource_type,resource_id,operation,before_version,after_version,before_json,after_json,created_at,request_id,actor
    FROM admin_audit_events WHERE resource_type='book' AND resource_id=?
    ${cursor?'AND (created_at<? OR (created_at=? AND event_id<?))':''} ORDER BY created_at DESC,event_id DESC LIMIT ?`)
    .bind(id,...(cursor?[cursor.createdAt,cursor.createdAt,cursor.eventId]:[]),limit+1).all<EventRow>()).results;
  const selected=rows.slice(0,limit);const items=selected.map(row=>({id:row.event_id,resourceType:row.resource_type,resourceId:row.resource_id,operation:row.operation,
    beforeVersion:row.before_version,afterVersion:row.after_version,before:row.before_json===null?null:JSON.parse(row.before_json),after:JSON.parse(row.after_json),
    createdAt:row.created_at,requestId:row.request_id,actor:row.actor}));
  const last=selected.at(-1);
  return Response.json({items,nextCursor:rows.length>limit?encode({v:1,scope:'admin-history',resourceType:'book',resourceId:id,createdAt:last!.created_at,eventId:last!.event_id}):null});
}
// Kept at the raw Worker boundary: framework RSC query consumption cannot turn
// unknown/duplicate management parameters into a different accepted request.
export async function bookReadRoute(request:Request,id:string|null):Promise<Response> {
  const response=await adminRead(request,()=>id===null?listBooks(new URL(request.url).searchParams):bookHistory(id,new URL(request.url).searchParams));
  return request.method==='HEAD'?new Response(null,{status:response.status,headers:response.headers}):response;
}
