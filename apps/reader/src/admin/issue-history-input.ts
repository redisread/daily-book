import { Buffer } from 'node:buffer';
import { InvalidRequest, validId } from '../domain/pagination';

export interface IssueHistoryCursor {
  v:1; scope:'admin-history'; resourceType:'issue'; resourceId:string; createdAt:string; eventId:string;
}
export interface IssueHistoryPage { limit:number; cursor:IssueHistoryCursor|null }
const bad=()=>new InvalidRequest('INVALID_CURSOR','游标无效。');
function unpack(value:string):Record<string,unknown> {
  if(!value||value.length>1024||!/^[A-Za-z0-9_-]+$/.test(value))throw bad();
  const bytes=Buffer.from(value,'base64url');if(bytes.toString('base64url')!==value)throw bad();
  let parsed:unknown;
  try{parsed=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw bad();}
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw bad();
  return parsed as Record<string,unknown>;
}
export function parseIssueHistoryPage(params:URLSearchParams,id:string):IssueHistoryPage {
  for(const key of params.keys())if(!['limit','cursor'].includes(key)||params.getAll(key).length!==1)throw new InvalidRequest('INVALID_QUERY','仅接受单个limit与cursor参数。');
  const raw=params.get('limit');
  if(raw!==null&&(!/^[1-9]\d{0,2}$/.test(raw)||Number(raw)>100))throw new InvalidRequest('INVALID_LIMIT','limit必须是1至100的整数。');
  const limit=raw===null?20:Number(raw);const encoded=params.get('cursor');
  if(encoded===null)return{limit,cursor:null};
  const row=unpack(encoded);
  if(Object.keys(row).sort().join(',')!=='createdAt,eventId,resourceId,resourceType,scope,v'||row.v!==1||row.scope!=='admin-history'
    ||row.resourceType!=='issue'||row.resourceId!==id||typeof row.eventId!=='string'||!validId(row.eventId)
    ||typeof row.createdAt!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(row.createdAt)
    ||!Number.isFinite(Date.parse(row.createdAt))||new Date(row.createdAt).toISOString()!==row.createdAt)throw bad();
  return{limit,cursor:{v:1,scope:'admin-history',resourceType:'issue',resourceId:id,createdAt:row.createdAt,eventId:row.eventId}};
}
export function encodeIssueHistoryCursor(createdAt:string,eventId:string,id:string):string {
  return Buffer.from(JSON.stringify({v:1,scope:'admin-history',resourceType:'issue',resourceId:id,createdAt,eventId})).toString('base64url');
}
