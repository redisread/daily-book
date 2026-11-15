import { listPublishedIssues } from '../../../../src/domain/issues';
import { parsePageInput } from '../../../../src/domain/pagination';
import { failedRead } from '../../../../src/http';
export const dynamic = 'force-dynamic';
export async function GET(request: Request): Promise<Response> {
  try {
    const result = await listPublishedIssues(parsePageInput(new URL(request.url).searchParams));
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return failedRead(error); }
}
