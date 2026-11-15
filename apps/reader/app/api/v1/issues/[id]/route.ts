import { readIssue } from '../../../../../src/domain/issues';
import { apiError, failedRead } from '../../../../../src/http';
export const dynamic = 'force-dynamic';
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const result = await readIssue((await context.params).id);
    if (result.kind === 'not-found') return apiError(404, 'ISSUE_NOT_FOUND', '刊期不存在。');
    if (result.kind === 'withdrawn') return apiError(410, 'ISSUE_WITHDRAWN', '此刊期已撤回。');
    return Response.json({ data: result.issue }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return failedRead(error); }
}
