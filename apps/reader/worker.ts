import vinext from 'vinext/server/fetch-handler';
import type appRouter from 'vinext/server/app-router-entry';
import { privateResponse,rejectAdminMethod } from './src/admin/http';
import { withRequestReads, type DecisionObserver } from './src/request-reads';

// Keep the public entry selector. Its generated virtual-module declaration is
// opaque to standalone tsc; the pinned App Router export supplies its public type.
const framework: typeof appRouter = vinext;
export function createReaderWorker(observer?: DecisionObserver) {
  return {
    ...framework,
    fetch(...args: Parameters<typeof framework.fetch>): Promise<Response> {
      return withRequestReads(async () => {
        const management = new URL(args[0].url).pathname.startsWith('/api/v1/admin/');
        // This phase has no management write surface. Reject every other method
        // at the Worker boundary, with the same auth/error policy as GET routes.
        if (management && !['GET','HEAD'].includes(args[0].method)) return rejectAdminMethod(args[0]);
        const response = await framework.fetch(...args);
        // Also keep framework-generated management 404/405/HEAD responses
        // private/no-store. Authentication stays inside each registered route.
        return management ? privateResponse(response) : response;
      }, observer);
    },
  };
}
export default createReaderWorker();
export * from 'vinext/server/fetch-handler';
