import { InvalidRequest } from './domain/pagination';
export function apiError(status: number, code: string, message: string): Response {
  const requestId = crypto.randomUUID();
  return Response.json({ error: { code, message }, requestId }, {
    status, headers: { 'Cache-Control': 'no-store', 'X-Request-ID': requestId },
  });
}
export function failedRead(error: unknown): Response {
  if (error instanceof InvalidRequest) return apiError(400, error.code, error.message);
  return apiError(503, 'READ_UNAVAILABLE', '暂时无法读取刊期。');
}
export function unavailablePage(status: 404 | 410 | 503, rsc: boolean): Response {
  const message = status === 410 ? '此刊期已撤回。' : status === 404 ? '刊期不存在。' : '暂时无法读取刊期。';
  return new Response(rsc ? message : `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>每日一书</title></head><body><main><h1>${message}</h1></main></body></html>`, {
    status, headers: { 'Content-Type': rsc ? 'text/plain; charset=utf-8' : 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
