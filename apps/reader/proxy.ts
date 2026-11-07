import { NextResponse, type NextRequest } from 'next/server';
import { readIssueVisibility } from './src/domain/issues';
import { unavailablePage } from './src/http';

// Enforce real HTTP status before HTML or RSC streaming begins. Never render private entities.
export async function proxy(request: NextRequest): Promise<Response> {
  const match = /^\/issues\/([^/]+)\/?$/.exec(new URL(request.url).pathname);
  if (!match) return NextResponse.next();
  let id: string;
  try { id = decodeURIComponent(match[1]); } catch { return unavailablePage(404, request.headers.get('RSC') === '1'); }
  try {
    const visibility = await readIssueVisibility(id);
    if (visibility === 'not-found') return unavailablePage(404, request.headers.get('RSC') === '1');
    if (visibility === 'withdrawn') return unavailablePage(410, request.headers.get('RSC') === '1');
    return NextResponse.next();
  } catch { return unavailablePage(503, request.headers.get('RSC') === '1'); }
}
export const config = { matcher: ['/issues/:path*'] };
