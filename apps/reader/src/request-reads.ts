import { AsyncLocalStorage } from 'node:async_hooks';
import type { IssueLookup } from './domain/types';

export interface VisibilityDecision {
  requestId: string;
  issueId: string;
  kind: IssueLookup['kind'];
  physicalReads: number;
}
export type DecisionObserver = (decision: VisibilityDecision) => Promise<void>;
interface RequestReads {
  id: string;
  issues: Map<string, Promise<IssueLookup>>;
  physicalReads: number;
  observer?: DecisionObserver;
}

// Only the context manager is shared. Every fetch creates its own map; no body,
// promise, identifier, or visibility result is stored in module-level variables.
const requests = new AsyncLocalStorage<RequestReads>();
export function withRequestReads<T>(run: () => T, observer?: DecisionObserver): T {
  return requests.run({ id: crypto.randomUUID(), issues: new Map(), physicalReads: 0, observer }, run);
}
function current(): RequestReads {
  const context = requests.getStore();
  // Do not silently fall back to a second, potentially inconsistent DB read.
  if (!context) throw new Error('Issue read outside a server request context');
  return context;
}
export function readIssueOnce(id: string, read: () => Promise<IssueLookup>): Promise<IssueLookup> {
  const context = current();
  let result = context.issues.get(id);
  if (!result) {
    context.physicalReads++;
    result = Promise.resolve().then(read);
    context.issues.set(id, result);
  }
  return result;
}

// A server-side assembly seam. The ordinary entry has no observer; the isolated
// race-test entry can pause after the visibility decision, before page rendering.
// No request header can select an observer or supply a cached decision.
export async function afterVisibilityDecision(issueId: string, kind: IssueLookup['kind']): Promise<void> {
  const context = current();
  await context.observer?.({ requestId: context.id, issueId, kind, physicalReads: context.physicalReads });
}
