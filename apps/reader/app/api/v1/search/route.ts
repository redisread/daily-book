import {parseSearchInput} from '../../../../src/domain/search-input';
import {searchPublishedIssues} from '../../../../src/domain/search';
import {failedRead} from '../../../../src/http';
export async function GET(request:Request):Promise<Response> {
  try{return Response.json(await searchPublishedIssues(parseSearchInput(new URL(request.url).searchParams,false)),{headers:{'Cache-Control':'no-store'}});}
  catch(error){return failedRead(error);}
}
