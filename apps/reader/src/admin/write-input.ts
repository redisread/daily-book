import { validId } from '../domain/pagination';

export class WriteError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) { super(message); }
}
export const invalidValue = () => new WriteError(422,'INVALID_VALUE','字段类型或取值无效。');
export const MAX_REQUEST_BYTES = 256*1024;
export function jsonObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value!=='object' || Array.isArray(value)) throw invalidValue();
  return value as Record<string,unknown>;
}
export function allowKeys(value: Record<string,unknown>, keys: readonly string[]): void {
  if (Object.keys(value).some(key=>!keys.includes(key))) throw new WriteError(400,'UNKNOWN_FIELD','请求包含不允许的字段。');
}
export function text(value: unknown, max: number, nullable=false): string | null {
  if (nullable && value===null) return null;
  if (typeof value!=='string' || [...value].length>max) throw invalidValue();
  return value;
}
export function inputId(value: unknown): string {
  if (typeof value!=='string' || !validId(value)) throw invalidValue();
  return value;
}
export function idempotencyKey(headers: Headers): string {
  const key=headers.get('Idempotency-Key')??'';
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(key)) throw new WriteError(400,'INVALID_IDEMPOTENCY_KEY','需要有效的Idempotency-Key。');
  return key;
}
export function bookIfMatch(headers: Headers): string {
  const tag=headers.get('If-Match');
  if (tag===null) throw new WriteError(428,'PRECONDITION_REQUIRED','需要单个强If-Match。');
  const match=/^"b:([A-Za-z0-9][A-Za-z0-9_-]{0,127}):([1-9]\d*)"$/.exec(tag);
  if (!match || !Number.isSafeInteger(Number(match[2]))) throw new WriteError(400,'INVALID_IF_MATCH','If-Match必须为单个有效强标签。');
  return tag; // Syntax validation only; raw equality is checked in the D1 batch.
}
export function issueIfMatch(headers: Headers): string {
  const tag=headers.get('If-Match');
  if (tag===null) throw new WriteError(428,'PRECONDITION_REQUIRED','需要单个强If-Match。');
  const match=/^"i:([A-Za-z0-9_-]+)-([0-9]{16})-([0-9]{16})"$/.exec(tag);
  if (tag.length>512 || !match || !Number.isSafeInteger(Number(match[2])) || Number(match[2])<1
    || !Number.isSafeInteger(Number(match[3])) || Number(match[3])<1) throw new WriteError(400,'INVALID_IF_MATCH','If-Match必须为单个有效强标签。');
  return tag; // The opaque token is compared byte-for-byte inside the D1 batch.
}
export async function readJSON(request: Request): Promise<Record<string,unknown>> {
  if (request.headers.get('Content-Type')?.split(';',1)[0].trim().toLowerCase()!=='application/json')
    throw new WriteError(415,'UNSUPPORTED_MEDIA_TYPE','仅接受application/json。');
  const reader=request.body?.getReader();
  if (!reader) throw new WriteError(400,'INVALID_JSON','JSON语法无效。');
  const chunks: Uint8Array[]=[];let size=0;
  try {
    while (true) {
      const part=await reader.read();if (part.done) break;
      size+=part.value.byteLength;
      if (size>MAX_REQUEST_BYTES) { await reader.cancel();throw new WriteError(413,'PAYLOAD_TOO_LARGE','请求体超过256KiB。'); }
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  const bytes=new Uint8Array(size);let offset=0;
  for (const chunk of chunks) { bytes.set(chunk,offset);offset+=chunk.byteLength; }
  let value: unknown;
  try { value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)); }
  catch { throw new WriteError(400,'INVALID_JSON','JSON语法无效。'); }
  return jsonObject(value);
}
// JSON semantics, not input byte formatting. Arrays keep order; absent fields
// stay absent. Values have already passed finite-number and field validation.
export function canonicalJSON(value: unknown): string {
  if (Array.isArray(value)) return '['+value.map(canonicalJSON).join(',')+']';
  if (value && typeof value==='object') return '{'+Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([key,item])=>JSON.stringify(key)+':'+canonicalJSON(item)).join(',')+'}';
  const encoded=JSON.stringify(value);
  if (encoded===undefined) throw new Error('Non-JSON internal value');
  return encoded;
}
export async function requestDigest(method: string, path: string, body: Record<string,unknown>, ifMatch: string | null): Promise<string> {
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonicalJSON({method,path,body,ifMatch})));
  return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}
