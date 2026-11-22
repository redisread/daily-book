import {Buffer} from 'node:buffer';
import {InvalidRequest,parsePageInput,validId} from './pagination';
export interface SearchCursor {v:1;scope:'public-search';q:string;publicationDate:string;id:string}
export interface SearchInput {q:string;normalizedQ:string;limit:number;cursor:SearchCursor|null}
export function normalizeSearchQuery(value:string):string{return value.trim().replace(/[A-Z]/g,char=>char.toLowerCase());}
const badCursor=()=>new InvalidRequest('INVALID_CURSOR','搜索游标无效或不属于当前关键词。');
function decodeSearchCursor(value:string,query:string):SearchCursor {
  if(!value||value.length>2048||!/^[A-Za-z0-9_-]+$/.test(value))throw badCursor();
  const bytes=Buffer.from(value,'base64url');const text=bytes.toString('utf8');if(bytes.toString('base64url')!==value||!Buffer.from(text).equals(bytes))throw badCursor();
  let parsed:unknown;try{parsed=JSON.parse(text);}catch{throw badCursor();}
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw badCursor();const cursor=parsed as Record<string,unknown>;
  if(Object.keys(cursor).sort().join(',')!=='id,publicationDate,q,scope,v'||cursor.v!==1||cursor.scope!=='public-search'||cursor.q!==query||typeof cursor.id!=='string'||!validId(cursor.id)||typeof cursor.publicationDate!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(cursor.publicationDate))throw badCursor();
  const date=new Date(cursor.publicationDate+'T00:00:00Z');if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==cursor.publicationDate)throw badCursor();
  return {v:1,scope:'public-search',q:query,publicationDate:cursor.publicationDate,id:cursor.id};
}
export function encodeSearchCursor(row:{id:string;date:string},normalizedQ:string):string {
  return Buffer.from(JSON.stringify({v:1,scope:'public-search',q:normalizedQ,publicationDate:row.date,id:row.id})).toString('base64url');
}
export function parseSearchInput(params:URLSearchParams,page:false):SearchInput;
export function parseSearchInput(params:URLSearchParams,page:true):SearchInput|null;
export function parseSearchInput(params:URLSearchParams,page:boolean):SearchInput|null {
  const allowed=page?['q','cursor','limit','_rsc']:['q','cursor','limit'];
  for(const key of params.keys())if(!allowed.includes(key)||params.getAll(key).length!==1)throw new InvalidRequest('INVALID_QUERY','搜索参数未知或重复。');
  if(page&&params.has('_rsc')){const token=params.get('_rsc')!;if(token.length>128||!/^[A-Za-z0-9_-]*$/.test(token))throw new InvalidRequest('INVALID_QUERY','搜索传输参数无效。');}
  const limitOnly=new URLSearchParams();if(params.has('limit'))limitOnly.set('limit',params.get('limit')!);const {limit}=parsePageInput(limitOnly);
  if(!params.has('q')){if(page&&!params.has('cursor'))return null;throw new InvalidRequest('INVALID_QUERY','请提供搜索关键词。');}
  const q=params.get('q')!.trim();if([...q].length<1||[...q].length>100)throw new InvalidRequest('INVALID_QUERY','关键词须为1至100个Unicode码点。');
  const normalizedQ=normalizeSearchQuery(q);const cursor=params.has('cursor')?decodeSearchCursor(params.get('cursor')!,normalizedQ):null;
  return {q,normalizedQ,limit,cursor};
}
