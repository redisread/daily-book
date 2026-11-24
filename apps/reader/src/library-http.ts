import { listLibrary, readPublicBook } from './domain/book-library';
import { libraryPageSize, libraryQuery } from './domain/library-query';
import { apiError, failedRead } from './http';

export function bookNotFound() {
  return apiError(404, 'BOOK_NOT_FOUND', '书籍不存在。');
}
export function emptyBody(request: Request, response: Response): Response {
  return request.method === 'HEAD' ? new Response(null, response) : response;
}
export async function publicLibrary(request: Request, id?: string): Promise<Response> {
  let response: Response;
  try {
    const params = new URL(request.url).searchParams;
    if (!['GET', 'HEAD'].includes(request.method)) {
      response = apiError(405, 'METHOD_NOT_ALLOWED', '书籍接口仅支持 GET 和 HEAD。');
      response.headers.set('Allow', 'GET, HEAD');
    } else if (id !== undefined) {
      if (params.size) {
        response = apiError(400, 'INVALID_QUERY', '书籍详情不接受查询参数。');
      } else {
        const book = await readPublicBook(id);
        response = book ? Response.json({ data: book }) : bookNotFound();
      }
    } else {
      const { query, page, offset } = libraryQuery(params);
      const result = await listLibrary(query, libraryPageSize, offset);
      response = Response.json({ items: result.items, nextPage: result.hasMore ? page + 1 : null });
    }
  } catch (error) {
    response = failedRead(error);
  }
  response.headers.set('Cache-Control', 'no-store');
  return emptyBody(request, response);
}
