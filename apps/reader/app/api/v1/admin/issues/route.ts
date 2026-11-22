import { listAdminIssues } from '../../../../../src/admin/issues';
import { parseAdminPageInput } from '../../../../../src/admin/pagination';
import { adminRead } from '../../../../../src/admin/http';
export const dynamic = 'force-dynamic';
export async function GET(request: Request): Promise<Response> {
  return adminRead(request,async()=>Response.json(await listAdminIssues(parseAdminPageInput(new URL(request.url).searchParams))));
}
