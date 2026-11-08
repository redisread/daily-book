import { validId,InvalidRequest } from '../domain/pagination';
import { apiError } from '../http';
import { requireAdmin } from './auth';
import { privateResponse } from './http';
import { type WriteObserver } from './atomic-write';
import { parseBookInput } from './book-input';
import { writeBook } from './book-writes';
import { bookIfMatch,idempotencyKey,readJSON,requestDigest,WriteError } from './write-input';

export async function bookWriteRoute(request: Request,id: string|null,observer?: WriteObserver): Promise<Response> {
  try {
    const denied=await requireAdmin(request);if (denied) return privateResponse(denied);
    if (new URL(request.url).searchParams.size) throw new InvalidRequest('INVALID_QUERY','写入接口不接受查询参数。');
    if (id!==null && !validId(id)) return privateResponse(apiError(404,'BOOK_NOT_FOUND','书目不存在。'));
    const key=idempotencyKey(request.headers);const ifMatch=id===null?request.headers.get('If-Match'):bookIfMatch(request.headers);
    const body=await readJSON(request);
    const parsed=id===null?parseBookInput(body,true):parseBookInput(body,false);
    const {id:createdId,...fields}=parsed as typeof parsed & {id?:string};
    const resourceId=id??createdId!;const path='/api/v1/admin/books'+(id===null?'':'/'+encodeURIComponent(id));
    const digest=await requestDigest(request.method,path,body,ifMatch);
    return privateResponse(await writeBook({key,digest,resourceType:'book',resourceId,method:id===null?'POST':'PATCH',operation:id===null?'book.create':'book.patch',path},fields,ifMatch,observer));
  } catch (error) {
    const response=error instanceof WriteError?apiError(error.status,error.code,error.message)
      :error instanceof InvalidRequest?apiError(400,error.code,error.message):apiError(503,'WRITE_UNAVAILABLE','管理写入暂不可用。请保留原请求信息。');
    if (error instanceof WriteError && error.code==='IDEMPOTENCY_IN_PROGRESS') response.headers.set('Retry-After','1');
    return privateResponse(response);
  }
}
