import { Buffer } from 'node:buffer';
import { InvalidRequest, validId } from '../domain/pagination';

export type IssueStatus = 'draft' | 'published' | 'withdrawn';
export interface AdminCursor { v: 1; scope: 'admin-issues'; status: IssueStatus | null; publicationDate: string | null; id: string }
export interface AdminPageInput { limit: number; status: IssueStatus | null; cursor: AdminCursor | null }
const statuses = new Set<string>(['draft','published','withdrawn']);
const badCursor = () => new InvalidRequest('INVALID_CURSOR', '游标无效。');
function validDate(value: unknown): value is string | null {
  if (value === null) return true;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === value;
}
export function decodeAdminCursor(value: string, status: IssueStatus | null): AdminCursor {
  if (!value || value.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(value)) throw badCursor();
  const bytes = Buffer.from(value, 'base64url');
  if (bytes.toString('base64url') !== value) throw badCursor();
  let parsed: unknown;
  try { parsed = JSON.parse(bytes.toString('utf8')); } catch { throw badCursor(); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw badCursor();
  const row = parsed as Record<string, unknown>;
  if (Object.keys(row).sort().join(',') !== 'id,publicationDate,scope,status,v' || row.v !== 1 || row.scope !== 'admin-issues'
    || row.status !== status || typeof row.id !== 'string' || !validId(row.id) || !validDate(row.publicationDate)
    || (status === 'draft' && row.publicationDate !== null) || ((status === 'published' || status === 'withdrawn') && row.publicationDate === null)) throw badCursor();
  return { v:1,scope:'admin-issues',status,publicationDate:row.publicationDate,id:row.id };
}
export function encodeAdminCursor(row: { publicationDate: string | null; id: string }, status: IssueStatus | null): string {
  return Buffer.from(JSON.stringify({ v:1,scope:'admin-issues',status,publicationDate:row.publicationDate,id:row.id })).toString('base64url');
}
export function parseAdminPageInput(params: URLSearchParams): AdminPageInput {
  for (const key of params.keys()) if (!['limit','cursor','status'].includes(key) || params.getAll(key).length !== 1)
    throw new InvalidRequest('INVALID_QUERY', '仅接受单个limit、cursor与status参数。');
  const rawLimit = params.get('limit');
  if (rawLimit !== null && !/^[1-9]\d{0,2}$/.test(rawLimit)) throw new InvalidRequest('INVALID_LIMIT', 'limit必须是1至100的整数。');
  const limit = rawLimit === null ? 20 : Number(rawLimit);
  if (limit < 1 || limit > 100) throw new InvalidRequest('INVALID_LIMIT', 'limit必须是1至100的整数。');
  const rawStatus = params.get('status');
  if (rawStatus !== null && !statuses.has(rawStatus)) throw new InvalidRequest('INVALID_STATUS', 'status无效。');
  const status = rawStatus as IssueStatus | null;
  return { limit,status,cursor:params.has('cursor') ? decodeAdminCursor(params.get('cursor')!,status) : null };
}
export function noDetailQuery(params: URLSearchParams): void {
  if (params.size !== 0) throw new InvalidRequest('INVALID_QUERY', '详情接口不接受查询参数。');
}
