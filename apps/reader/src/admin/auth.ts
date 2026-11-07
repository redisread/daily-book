import { env } from 'cloudflare:workers';
import { timingSafeEqual } from 'node:crypto';
import { apiError } from '../http';

// Only the Worker secret is authoritative. No query, cookie or state header is
// consulted, and no token/request headers are logged or reflected in errors.
export async function requireAdmin(request: Request): Promise<Response | null> {
  const expected = env.CONTENT_API_KEY;
  if (!expected) return apiError(503, 'ADMIN_UNAVAILABLE', '管理读取暂不可用。');
  const provided = /^Bearer ([^\s,]+)$/i.exec(request.headers.get('Authorization') ?? '')?.[1];
  if (!provided || provided.length > 4096) return apiError(401, 'UNAUTHORIZED', '未授权。');
  const encoder = new TextEncoder();
  const [actualHash, expectedHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(provided)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ]);
  if (!timingSafeEqual(new Uint8Array(actualHash), new Uint8Array(expectedHash))) return apiError(401, 'UNAUTHORIZED', '未授权。');
  return null;
}
