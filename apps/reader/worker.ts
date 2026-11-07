import vinext from 'vinext/server/fetch-handler';
import type appRouter from 'vinext/server/app-router-entry';
import { privateResponse,rejectAdminMethod } from './src/admin/http';
import {parseArchiveInput} from './src/archive-input';
import {InvalidRequest} from './src/domain/pagination';
import {unavailablePage,apiError,failedRead} from './src/http';
import {publicRssResponse} from './src/rss';
import { withRequestReads, type DecisionObserver } from './src/request-reads';

// Keep the public entry selector. Its generated virtual-module declaration is
// opaque to standalone tsc; the pinned App Router export supplies its public type.
const framework: typeof appRouter = vinext;
export function createReaderWorker(observer?: DecisionObserver) {
  return {
    ...framework,
    fetch(...args: Parameters<typeof framework.fetch>): Promise<Response> {
      return withRequestReads(async () => {
        const url=new URL(args[0].url);const pathname=url.pathname;
        const archive=/^\/archive\/?$/.test(pathname);
        // Validate the original URL before framework normalization/streaming:
        // vinext consumes _rsc before proxy/page code, including duplicates.
        if(archive){try{parseArchiveInput(url.searchParams);}catch(error){return unavailablePage(error instanceof InvalidRequest?400:503,args[0].headers.get('RSC')==='1');}}
        if(pathname==='/rss.xml') {
          if(!['GET','HEAD'].includes(args[0].method)){
            const response=apiError(405,'METHOD_NOT_ALLOWED','RSS仅支持GET和HEAD。');response.headers.set('Allow','GET, HEAD');return response;
          }
          if(url.searchParams.size)return apiError(400,'INVALID_QUERY','RSS地址不接受查询参数。');
          try{const response=await publicRssResponse();return args[0].method==='HEAD'?new Response(null,{status:response.status,headers:response.headers}):response;}
          catch(error){return failedRead(error);}
        }
        const management = pathname.startsWith('/api/v1/admin/');
        // This phase has no management write surface. Reject every other method
        // at the Worker boundary, with the same auth/error policy as GET routes.
        if (management && !['GET','HEAD'].includes(args[0].method)) return rejectAdminMethod(args[0]);
        const response = await framework.fetch(...args);
        // Also keep framework-generated management 404/405/HEAD responses
        // private/no-store. Authentication stays inside each registered route.
        if(management)return privateResponse(response);
        if(archive){
          const headers=new Headers(response.headers);headers.set('Cache-Control','no-store');
          return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
        }
        return response;
      }, observer);
    },
  };
}
export default createReaderWorker();
export * from 'vinext/server/fetch-handler';
