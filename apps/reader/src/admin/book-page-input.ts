import { Buffer } from 'node:buffer';
import { InvalidRequest,validId } from '../domain/pagination';

interface BookCursor { v:1; scope:'admin-books'; id:string }
interface HistoryCursor { v:1; scope:'admin-history'; resourceType:'book'; resourceId:string; createdAt:string; eventId:string }
const bad=()=>new InvalidRequest('INVALID_CURSOR','游标无效。');
function unpack(value: string): Record<string,unknown> {
  if (!value || value.length>1024 || !/^[A-Za-z0-9_-]+$/.test(value)) throw bad();
  const bytes=Buffer.from(value,'base64url');if (bytes.toString('base64url')!==value) throw bad();
  let parsed: unknown;
  try { parsed=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)); } catch { throw bad(); }
  if (!parsed || typeof parsed!=='object' || Array.isArray(parsed)) throw bad();
  return parsed as Record<string,unknown>;
}
function common(params: URLSearchParams): {limit:number; cursor:string|null} {
  for (const key of params.keys()) if (!['limit','cursor'].includes(key) || params.getAll(key).length!==1) throw new InvalidRequest('INVALID_QUERY','仅接受单个limit与cursor参数。');
  const raw=params.get('limit');
  if (raw!==null && (!/^[1-9]\d{0,2}$/.test(raw) || Number(raw)>100)) throw new InvalidRequest('INVALID_LIMIT','limit必须是1至100的整数。');
  return {limit:raw===null?20:Number(raw),cursor:params.get('cursor')};
}
export function parseBookPage(params: URLSearchParams): {limit:number; cursor:BookCursor|null} {
  const page=common(params);if (page.cursor===null) return {...page,cursor:null};
  const cursor=unpack(page.cursor);
  if (Object.keys(cursor).sort().join(',')!=='id,scope,v' || cursor.v!==1 || cursor.scope!=='admin-books' || typeof cursor.id!=='string' || !validId(cursor.id)) throw bad();
  return {limit:page.limit,cursor:{v:1,scope:'admin-books',id:cursor.id}};
}
export function parseBookHistoryPage(params: URLSearchParams,id:string): {limit:number; cursor:HistoryCursor|null} {
  const page=common(params);if (page.cursor===null) return {...page,cursor:null};
  const cursor=unpack(page.cursor);
  if (Object.keys(cursor).sort().join(',')!=='createdAt,eventId,resourceId,resourceType,scope,v' || cursor.v!==1 || cursor.scope!=='admin-history'
    || cursor.resourceType!=='book' || cursor.resourceId!==id || typeof cursor.eventId!=='string' || !validId(cursor.eventId)
    || typeof cursor.createdAt!=='string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(cursor.createdAt)
    || !Number.isFinite(Date.parse(cursor.createdAt)) || new Date(cursor.createdAt).toISOString()!==cursor.createdAt) throw bad();
  return {limit:page.limit,cursor:{v:1,scope:'admin-history',resourceType:'book',resourceId:id,createdAt:cursor.createdAt,eventId:cursor.eventId}};
}
