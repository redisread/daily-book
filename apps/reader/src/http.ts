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
export function unavailablePage(status: 400 | 404 | 410 | 503, rsc: boolean, context: 'archive' | 'search' | 'book' = 'archive'): Response {
  const message = status === 400 ? (context==='search'?'搜索参数无效。':context==='book'?'书籍库参数无效。':'归档参数无效。') : status === 410 ? '此刊期已撤回。' : status === 404 ? (context==='book'?'页面不存在。':'刊期不存在。') : (context==='book'?'暂时无法读取书籍。':'暂时无法读取刊期。');
  // Fixed theme/error copy only: never interpolate a requested ID or DB fields.
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>每日一书</title><style>
    *{box-sizing:border-box}body{margin:0;background:#F2F0EA;color:#0A0A0A;font-family:Inter,"Noto Sans SC","PingFang SC","Microsoft YaHei",sans-serif;line-height:1.7}
    main{max-width:44rem;margin:12vh auto;padding:2rem;border:2px solid #0A0A0A;background:#fff;box-shadow:6px 6px 0 rgb(10 10 10/.18)}h1{font-size:clamp(1.5rem,4vw,2.25rem);line-height:1.4;overflow-wrap:anywhere}a{display:inline-flex;padding:.75rem 1.25rem;border:2px solid #0A0A0A;background:#FFCE00;color:#0A0A0A;text-decoration:none;font-weight:700}a:focus-visible{outline:2px solid #C03A00;outline-offset:3px}@media(max-width:768px){main{margin:3rem 1rem;padding:1.5rem}}
    </style></head><body><main><p>每日一书 · Daily Book</p><h1>${message}</h1><a href="${status===400?(context==='search'?'/search':context==='book'?'/books':'/archive'):'/'}">${status===400?(context==='search'?'回到搜索页':context==='book'?'回到书籍库':'回到归档首页'):'回到最新推荐'}</a></main></body></html>`;
  return new Response(rsc ? message : html, {
    status, headers: { 'Content-Type': rsc ? 'text/plain; charset=utf-8' : 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
