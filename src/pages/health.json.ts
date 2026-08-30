import type { APIRoute } from 'astro';

export const prerender = false;

export function createHealthResponse(request: Request, now = new Date()): Response {
  return Response.json(
    {
      status: 'healthy',
      service: 'daily-book',
      runtime: 'cloudflare-workers',
      timestamp: now.toISOString(),
      requestId: request.headers.get('cf-ray'),
    },
    {
      status: 200,
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  );
}

export const GET: APIRoute = ({ request }) => {
  return createHealthResponse(request);
};
