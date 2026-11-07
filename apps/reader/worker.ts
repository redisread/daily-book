import vinext from 'vinext/server/fetch-handler';
import type appRouter from 'vinext/server/app-router-entry';
import { withRequestReads, type DecisionObserver } from './src/request-reads';

// Keep the public entry selector. Its generated virtual-module declaration is
// opaque to standalone tsc; the pinned App Router export supplies its public type.
const framework: typeof appRouter = vinext;
export function createReaderWorker(observer?: DecisionObserver) {
  return {
    ...framework,
    fetch(...args: Parameters<typeof framework.fetch>): Promise<Response> {
      return withRequestReads(() => framework.fetch(...args), observer);
    },
  };
}
export default createReaderWorker();
export * from 'vinext/server/fetch-handler';
