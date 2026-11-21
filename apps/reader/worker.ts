import vinext from 'vinext/server/fetch-handler';
import type appRouter from 'vinext/server/app-router-entry';
import { privateResponse,rejectAdminMethod } from './src/admin/http';
import { bookWriteRoute } from './src/admin/book-routes';
import { bookReadRoute } from './src/admin/book-reads';
import { issueHistoryRoute, issueWriteRoute, rejectIssueMethod } from './src/admin/issue-routes';
import type { WriteObserver } from './src/admin/atomic-write';
import {parseArchiveInput} from './src/archive-input';
import {InvalidRequest} from './src/domain/pagination';
import {unavailablePage,failedRead,apiError} from './src/http';
import {publicRssResponse} from './src/rss';
import {legacyBookDateResponse} from './src/legacy-book';
import {parseSearchInput} from './src/domain/search-input';
import { withRequestReads, type DecisionObserver } from './src/request-reads';

// Keep the public entry selector. Its generated virtual-module declaration is
// opaque to standalone tsc; the pinned App Router export supplies its public type.
const framework: typeof appRouter = vinext;
export function createReaderWorker(observer?: DecisionObserver, writeObserver?: WriteObserver) {
  return {
    ...framework,
    fetch(...args: Parameters<typeof framework.fetch>): Promise<Response> {
      return withRequestReads(async () => {
        const url=new URL(args[0].url);const pathname=url.pathname;
        const legacyBook = /^\/book\/([^/]+)\/?$/.exec(pathname);
        if (legacyBook) return legacyBookDateResponse(args[0], legacyBook[1]);
        const archive=/^\/archive\/?$/.test(pathname);
        let decodedPath=pathname;try{decodedPath=decodeURIComponent(pathname);}catch{/* framework owns invalid path syntax */}
        const searchPage=/^\/search\/?$/.test(decodedPath);const searchApi=/^\/api\/v1\/search\/?$/.test(decodedPath);
        if(searchPage||searchApi){try{if(searchApi)parseSearchInput(url.searchParams,false);else parseSearchInput(url.searchParams,true);}
          catch(error){return searchApi?failedRead(error):unavailablePage(error instanceof InvalidRequest?400:503,args[0].headers.get('RSC')==='1','search');}}
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
        const management = decodedPath.startsWith('/api/v1/admin/');
        const bookCollection=/^\/api\/v1\/admin\/books\/?$/.test(decodedPath);
        const bookDetail=/^\/api\/v1\/admin\/books\/([^/]+)\/?$/.exec(decodedPath);
        const bookHistory=/^\/api\/v1\/admin\/books\/([^/]+)\/history\/?$/.exec(decodedPath);
        const issueCollection=/^\/api\/v1\/admin\/issues\/?$/.test(decodedPath);
        const issueAction=/^\/api\/v1\/admin\/issues\/([^/]+)\/(publish|withdraw|restore)\/?$/.exec(decodedPath);
        const issueHistory=/^\/api\/v1\/admin\/issues\/([^/]+)\/history\/?$/.exec(decodedPath);
        const issueDetail=/^\/api\/v1\/admin\/issues\/([^/]+)\/?$/.exec(decodedPath);
        // Stream and authenticate writes before framework buffering/normalization.
        if (bookCollection && args[0].method==='POST') return bookWriteRoute(args[0],null,writeObserver);
        if (bookDetail && args[0].method==='PATCH') return bookWriteRoute(args[0],bookDetail[1],writeObserver);
        if ((bookCollection||bookHistory) && ['GET','HEAD'].includes(args[0].method)) return bookReadRoute(args[0],bookHistory?.[1]??null);
        if (issueCollection && args[0].method==='POST') return issueWriteRoute(args[0],null,null,writeObserver);
        if (issueDetail && args[0].method==='PATCH') return issueWriteRoute(args[0],issueDetail[1],null,writeObserver);
        if (issueAction) {
          if(args[0].method==='POST')return issueWriteRoute(args[0],issueAction[1],issueAction[2] as 'publish'|'withdraw'|'restore',writeObserver);
          return rejectIssueMethod(args[0],'POST');
        }
        if(issueHistory){
          if(['GET','HEAD'].includes(args[0].method))return issueHistoryRoute(args[0],issueHistory[1]);
          return rejectIssueMethod(args[0],'GET, HEAD');
        }
        if (management && !['GET','HEAD'].includes(args[0].method)) return rejectAdminMethod(args[0],bookCollection?'GET, HEAD, POST':bookDetail?'GET, HEAD, PATCH':issueCollection?'GET, HEAD, POST':issueDetail?'GET, HEAD, PATCH':'GET, HEAD');
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
