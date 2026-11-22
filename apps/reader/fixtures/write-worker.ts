// Selected only by reader-write-test. Never imported by the normal Worker.
// D1 control rows are owned by the native harness, not chosen by HTTP headers.
import { env } from 'cloudflare:workers';
import { createReaderWorker } from '../worker';
export default createReaderWorker(undefined,async committed=>{
  const claimed=await env.DB.prepare(`UPDATE admin_write_test_barrier SET arrived=1,operation_id=?
    WHERE id='current' AND idempotency_key=? AND armed=1 AND arrived=0 RETURNING id`).bind(committed.operationId,committed.key).first();
  if (!claimed) return;
  const deadline=Date.now()+15000;
  while (true) {
    if ((await env.DB.prepare("SELECT released FROM admin_write_test_barrier WHERE id='current'").first<{released:number}>())?.released===1) return;
    if (Date.now()>deadline) throw new Error('Local write-test barrier timed out');
    await new Promise<void>(resolve=>setTimeout(resolve,25));
  }
});
