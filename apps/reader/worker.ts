import vinext from 'vinext/server/fetch-handler';
import type appRouter from 'vinext/server/app-router-entry';
import { privateResponse,rejectAdminMethod } from './src/admin/http';
import {parseArchiveInput} from './src/archive-input';
import {InvalidRequest} from './src/domain/pagination';
import {unavailablePage,failedRead} from './src/http';
import {parseSearchInput} from './src/domain/search-input';
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
        let decodedPath=pathname;try{decodedPath=decodeURIComponent(pathname);}catch{/* framework owns invalid path syntax */}
        const searchPage=/^\/search\/?$/.test(decodedPath);const searchApi=/^\/api\/v1\/search\/?$/.test(decodedPath);
        if(searchPage||searchApi){try{if(searchApi)parseSearchInput(url.searchParams,false);else parseSearchInput(url.searchParams,true);}
          catch(error){return searchApi?failedRead(error):unavailablePage(error instanceof InvalidRequest?400:503,args[0].headers.get('RSC')==='1','search');}}
        // Validate the original URL before framework normalization/streaming:
        // vinext consumes _rsc before proxy/page code, including duplicates.
        if(archive){try{parseArchiveInput(url.searchParams);}catch(error){return unavailablePage(error instanceof InvalidRequest?400:503,args[0].headers.get('RSC')==='1');}}
        const management = pathname.startsWith('/api/v1/admin/');
        // This phase has no management write surface. Reject every other method
        // at the Worker boundary, with the same auth/error policy as GET routes.
        if (management && !['GET','HEAD'].includes(args[0].method)) return rejectAdminMethod(args[0]);
        const response = await framework.fetch(...args);
        // Also keep framework-generated management 404/405/HEAD responses
        // private/no-store. Authentication stays inside each registered route.
        if(management)return privateResponse(response);
        if(archive||searchPage||searchApi){
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
