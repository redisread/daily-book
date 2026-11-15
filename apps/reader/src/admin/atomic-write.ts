import { env } from 'cloudflare:workers';
import { WriteError } from './write-input';

export const MANAGEMENT_ACTOR='content-api'; // Logical identity, not a person or a hash of the rotating secret.
type BindValue = string|number|null;
export interface SqlValue { sql: string; values: BindValue[] }
export interface WriteIntent {
  key: string; digest: string; resourceType: 'book'|'issue'; resourceId: string;
  operation: string; method: 'POST'|'PATCH'; path: string;
}
export interface AtomicPlan {
  before: SqlValue; condition: SqlValue; mutationWitness: SqlValue; after: SqlValue;
  mutations: D1PreparedStatement[];
  // Trusted SQL expression over a.after_json. Never an expression from a client.
  etagFromAuditSQL: string; status: 200|201; location: string|null;
  classifyFailure: () => Promise<never>;
}
export interface WriteReceipt {
  idempotency_key: string; request_hash: string; operation_id: string; request_id: string;
  completed: number; response_status: number|null; response_body: string|null;
  response_etag: string|null; response_location: string|null;
}
export type WriteObserver = (committed: {operationId: string; key: string; resourceId: string}) => Promise<void>;
const receiptColumns='idempotency_key,request_hash,operation_id,request_id,completed,response_status,response_body,response_etag,response_location';
const unavailable=()=>new WriteError(503,'WRITE_UNAVAILABLE','管理写入暂不可用。请保留原请求信息。');
async function storedReceipt(key: string): Promise<WriteReceipt|null> {
  return env.DB.prepare(`SELECT ${receiptColumns} FROM admin_write_receipts WHERE idempotency_key=?`).bind(key).first<WriteReceipt>();
}
function replay(receipt: WriteReceipt, digest: string): WriteReceipt {
  if (receipt.request_hash!==digest) throw new WriteError(409,'IDEMPOTENCY_CONFLICT','幂等键已用于不同请求。');
  if (receipt.completed!==1) throw new WriteError(409,'IDEMPOTENCY_IN_PROGRESS','原请求结果尚未确定。请保留原请求信息。');
  if (![200,201].includes(receipt.response_status??0) || !receipt.response_body || !receipt.response_etag) throw unavailable();
  return receipt;
}
export function receiptResponse(receipt: WriteReceipt): Response {
  const headers=new Headers({'Content-Type':'application/json; charset=utf-8','ETag':receipt.response_etag!,'X-Request-ID':receipt.request_id});
  if (receipt.response_location!==null) headers.set('Location',receipt.response_location);
  return new Response(receipt.response_body,{status:receipt.response_status!,headers});
}
export async function atomicWrite(intent: WriteIntent, planFor: (operationId:string)=>AtomicPlan|Promise<AtomicPlan>, observer?: WriteObserver): Promise<Response> {
  // This is a replay optimization, NOT the concurrency guard. A miss never grants
  // permission to mutate: the unique INSERT and every precondition are in batch.
  const previous=await storedReceipt(intent.key);
  if (previous) return receiptResponse(replay(previous,intent.digest));
  const operationId=crypto.randomUUID();const requestId=crypto.randomUUID();const plan=await planFor(operationId);
  const statements=[
    env.DB.prepare(`INSERT INTO admin_write_receipts
      (idempotency_key,request_hash,operation_id,resource_type,resource_id,operation,method,canonical_path,actor,request_id,before_json,condition_ok)
      VALUES(?,?,?,?,?,?,?,?,?,?,(${plan.before.sql}),(${plan.condition.sql}))`)
      .bind(intent.key,intent.digest,operationId,intent.resourceType,intent.resourceId,intent.operation,intent.method,intent.path,MANAGEMENT_ACTOR,requestId,...plan.before.values,...plan.condition.values),
    ...plan.mutations,
    env.DB.prepare(`UPDATE admin_write_receipts AS r SET mutation_ok=(${plan.mutationWitness.sql}) WHERE operation_id=?`)
      .bind(...plan.mutationWitness.values,operationId),
    env.DB.prepare(`INSERT INTO admin_audit_events
      (event_id,resource_type,resource_id,operation,before_version,after_version,before_json,after_json,created_at,request_id,actor)
      SELECT r.operation_id,r.resource_type,r.resource_id,r.operation,json_extract(r.before_json,'$.version'),
        json_extract((${plan.after.sql}),'$.version'),r.before_json,(${plan.after.sql}),r.started_at,r.request_id,r.actor
      FROM admin_write_receipts r WHERE r.operation_id=? AND r.mutation_ok IS 1`)
      .bind(...plan.after.values,...plan.after.values,operationId),
    env.DB.prepare(`UPDATE admin_write_receipts AS r SET audit_ok=EXISTS(SELECT 1 FROM admin_audit_events a WHERE a.event_id=r.operation_id) WHERE operation_id=?`).bind(operationId),
    env.DB.prepare(`UPDATE admin_write_receipts AS r SET completed=1,response_status=?,
      response_body=(SELECT json_object('data',json(a.after_json)) FROM admin_audit_events a WHERE a.event_id=r.operation_id),
      response_etag=(SELECT ${plan.etagFromAuditSQL} FROM admin_audit_events a WHERE a.event_id=r.operation_id),response_location=?
      WHERE operation_id=? AND mutation_ok IS 1 AND audit_ok IS 1`).bind(plan.status,plan.location,operationId),
    env.DB.prepare(`SELECT ${receiptColumns} FROM admin_write_receipts WHERE operation_id=?`).bind(operationId),
  ];
  let receipt: WriteReceipt;
  try {
    // Both deferred foreign keys are checked at this transaction's commit: a
    // receipt needs its audit, and an audit needs the completed response receipt.
    const result=await env.DB.batch<WriteReceipt>(statements);
    const captured=result.at(-1)?.results[0];
    if (!captured) throw unavailable();
    receipt=replay(captured,intent.digest);
  } catch {
    // Includes a uniqueness loser OR an uncertain acknowledgement. Observe the
    // original key first, never rerun a batch or claim a lease. Same-key retries
    // can succeed even after their old If-Match has ceased to match live state.
    const observed=await storedReceipt(intent.key);
    if (observed) return receiptResponse(replay(observed,intent.digest));
    return plan.classifyFailure();
  }
  // Only a test assembly supplies this observer. Not an HTTP-selected delay.
  // It runs after commit but outside failure classification/replay optimization.
  await observer?.({operationId,key:intent.key,resourceId:intent.resourceId});
  return receiptResponse(receipt);
}
