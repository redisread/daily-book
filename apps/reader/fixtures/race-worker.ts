// Test-only entry: selected solely by the explicit reader-race-test build mode.
// The default build does not import this file. No HTTP control endpoint or
// client-selected delay/visibility header exists in either entry.
import { env } from 'cloudflare:workers';
import { createReaderWorker } from '../worker';

export default createReaderWorker(async (decision) => {
  const claimed = await env.DB.prepare(`UPDATE reader_test_barrier
    SET claimed=1,request_id=?,observed_kind=?,physical_reads=?
    WHERE id='current' AND issue_id=? AND armed=1 AND claimed=0 RETURNING id`)
    .bind(decision.requestId, decision.kind, decision.physicalReads, decision.issueId).first<{ id: string }>();
  if (!claimed) return;
  const deadline = Date.now() + 15000;
  while (true) {
    const row = await env.DB.prepare("SELECT released FROM reader_test_barrier WHERE id='current'").first<{ released: number }>();
    if (row?.released === 1) return;
    if (Date.now() > deadline) throw new Error('Local race-test barrier timed out');
    await new Promise<void>((resolve) => setTimeout(resolve, 25));
  }
});
