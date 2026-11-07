import { apiError } from '../http';
import { InvalidRequest } from '../domain/pagination';
import { requireAdmin } from './auth';

export function privateResponse(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('Cache-Control','no-store');
  if (!(headers.get('Vary') ?? '').split(',').some(value=>value.trim().toLowerCase()==='authorization')) headers.append('Vary','Authorization');
  return new Response(response.body,{ status:response.status,statusText:response.statusText,headers });
}
export async function adminRead(request: Request, read: () => Promise<Response>): Promise<Response> {
  try {
    const denied = await requireAdmin(request);
    return privateResponse(denied ?? await read());
  } catch (error) {
    return privateResponse(error instanceof InvalidRequest ? apiError(400,error.code,error.message) : apiError(503,'READ_UNAVAILABLE','管理读取暂不可用。'));
  }
}
export async function rejectAdminMethod(request: Request): Promise<Response> {
  return adminRead(request,async()=>{
    const response = apiError(405,'METHOD_NOT_ALLOWED','仅支持只读请求。');
    response.headers.set('Allow','GET, HEAD');
    return response;
  });
}
