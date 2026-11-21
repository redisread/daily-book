import { env } from 'cloudflare:workers';
import { apiError } from '../http';
import { MANAGEMENT_ACTOR } from './atomic-write';
import { retryAfterSeconds, utcMinuteWindow } from './rate-limit-input';

type RateBucket = 'read'|'write';
const LIMITS: Record<RateBucket, number> = { read: 120, write: 30 };

function privateResponse(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('Cache-Control','no-store');
  if (!(headers.get('Vary') ?? '').split(',').some(value=>value.trim().toLowerCase()==='authorization')) headers.append('Vary','Authorization');
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}

export async function consumeAdminRateLimit(request: Request): Promise<Response|null> {
  const bucket: RateBucket = request.method === 'GET' || request.method === 'HEAD' ? 'read' : 'write';
  const limit = LIMITS[bucket];
  const now = Date.now();
  const windowStart = utcMinuteWindow(now);
  try {
    const result = await env.DB.prepare(`INSERT INTO admin_rate_limit_buckets(actor,bucket,window_start,request_count)
      VALUES(?,?,?,1)
      ON CONFLICT(actor,bucket,window_start) DO UPDATE SET request_count=min(request_count+1,?)
      RETURNING request_count`).bind(MANAGEMENT_ACTOR,bucket,windowStart,limit+1).all<{request_count:number}>();
    const count = result.results?.[0]?.request_count;
    if (typeof count !== 'number' || !Number.isInteger(count)) throw new Error('Invalid D1 rate-limit result');
    if (count===1) {
      // Pruning is housekeeping. Keep it off the hot counting statement and
      // never turn a committed counter into a misleading 503 if cleanup fails.
      try { await env.DB.prepare('DELETE FROM admin_rate_limit_buckets WHERE window_start < ?').bind(windowStart-2).run(); } catch { /* stale buckets are safe; a later window retries cleanup */ }
    }
    if (count <= limit) return null;
    const response = apiError(429,'RATE_LIMITED','管理请求过于频繁，请稍后重试。');
    response.headers.set('Retry-After',String(retryAfterSeconds(now)));
    return privateResponse(response);
  } catch {
    return privateResponse(apiError(503,'RATE_LIMIT_UNAVAILABLE','管理限流暂不可用。'));
  }
}
