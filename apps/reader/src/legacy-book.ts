import { readPublishedIssueIdByDate } from './domain/issues';
import { unavailablePage } from './http';

export async function legacyBookDateResponse(request: Request, date: string): Promise<Response> {
  const headers = { 'Cache-Control': 'no-store' };
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response(null, { status: 405, headers: { ...headers, Allow: 'GET, HEAD' } });
  }

  const errorPage = (status: 404 | 503) => {
    const page = unavailablePage(status, request.headers.get('RSC') === '1');
    return request.method === 'HEAD' ? new Response(null, { status, headers: page.headers }) : page;
  };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return errorPage(404);

  try {
    const id = await readPublishedIssueIdByDate(date);
    if (!id) return errorPage(404);
    return new Response(null, { status: 307, headers: { ...headers, Location: `/issues/${encodeURIComponent(id)}` } });
  } catch {
    return errorPage(503);
  }
}
