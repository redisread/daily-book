import { readAdminBook } from '../../../../../../src/admin/issues';
import { bookETag } from '../../../../../../src/admin/etag';
import { noDetailQuery } from '../../../../../../src/admin/pagination';
import { adminRead } from '../../../../../../src/admin/http';
import { apiError } from '../../../../../../src/http';
export const dynamic = 'force-dynamic';
export async function GET(request: Request,context: { params: Promise<{ id: string }> }): Promise<Response> {
  return adminRead(request,async()=>{
    noDetailQuery(new URL(request.url).searchParams);
    const data = await readAdminBook((await context.params).id);
    if (!data) return apiError(404,'BOOK_NOT_FOUND','书目不存在。');
    return Response.json({ data },{ headers:{ ETag:bookETag(data) } });
  });
}
