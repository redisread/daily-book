import { Buffer } from 'node:buffer';

export class InvalidRequest extends Error {
  constructor(public readonly code: string, message: string) { super(message); }
}
export interface Cursor { v: 1; publicationDate: string; id: string }
export interface PageInput { limit: number; cursor: Cursor | null }
export const validId = (id: string): boolean => /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(id);
const badCursor = () => new InvalidRequest('INVALID_CURSOR', '游标无效。');
export function decodeCursor(value: string): Cursor {
  if (!value || value.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(value)) throw badCursor();
  const bytes = Buffer.from(value, 'base64url');
  if (bytes.toString('base64url') !== value) throw badCursor();
  let parsed: unknown;
  try { parsed = JSON.parse(bytes.toString('utf8')); } catch { throw badCursor(); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw badCursor();
  const cursor = parsed as Record<string, unknown>;
  if (Object.keys(cursor).sort().join(',') !== 'id,publicationDate,v' || cursor.v !== 1 || typeof cursor.id !== 'string' || !validId(cursor.id)
    || typeof cursor.publicationDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(cursor.publicationDate)) throw badCursor();
  const date = new Date(`${cursor.publicationDate}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== cursor.publicationDate) throw badCursor();
  return { v: 1, publicationDate: cursor.publicationDate, id: cursor.id };
}
export function encodeCursor(row: { publicationDate: string; id: string }): string {
  return Buffer.from(JSON.stringify({ v: 1, publicationDate: row.publicationDate, id: row.id })).toString('base64url');
}
export function parsePageInput(params: URLSearchParams): PageInput {
  for (const key of params.keys()) if (!['limit', 'cursor'].includes(key) || params.getAll(key).length !== 1) {
    throw new InvalidRequest('INVALID_QUERY', '仅接受单个limit与cursor参数。');
  }
  const rawLimit = params.get('limit');
  if (rawLimit !== null && !/^[1-9]\d{0,2}$/.test(rawLimit)) throw new InvalidRequest('INVALID_LIMIT', 'limit必须是1至100的整数。');
  const limit = rawLimit === null ? 20 : Number(rawLimit);
  if (limit < 1 || limit > 100) throw new InvalidRequest('INVALID_LIMIT', 'limit必须是1至100的整数。');
  return { limit, cursor: params.has('cursor') ? decodeCursor(params.get('cursor')!) : null };
}
