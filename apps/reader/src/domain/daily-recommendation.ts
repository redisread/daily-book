import { env } from 'cloudflare:workers';
import { libraryJoin, publicBookProjection, type PublicBook } from './book-library';

const BEIJING_OFFSET = 8 * 60 * 60 * 1000;
export const beijingDay = (now = Date.now()) => new Date(now + BEIJING_OFFSET).toISOString().slice(0, 10);

function pickEligible(day: '?1' | 'day') {
  return `(SELECT book_id FROM book_content WHERE status='published' AND eligible_on<=${day}
    ORDER BY randomblob(16) LIMIT 1)`;
}

// D1 serializes writes to the primary. Each statement both checks the incumbent
// and picks from the same eligible snapshot. A concurrent request can only
// replace the incumbent after the chosen book becomes ineligible.
const draw = `INSERT INTO daily_recommendations(day,book_id)
  SELECT ?1, ${pickEligible('?1')}
  WHERE NOT EXISTS (SELECT 1 FROM daily_recommendations r JOIN book_content c ON c.book_id=r.book_id
    WHERE r.day=?1 AND c.status='published' AND c.eligible_on<=?1)
  ON CONFLICT(day) DO UPDATE SET book_id=excluded.book_id`;

export function replaceWithdrawnRecommendation(operationId: string, id: string): D1PreparedStatement {
  // Run after the visibility change in the same admin batch.
  return env.DB.prepare(`UPDATE daily_recommendations SET book_id=${pickEligible('day')}
    WHERE day=(SELECT date(started_at,'+8 hours') FROM admin_write_receipts WHERE operation_id=?)
      AND book_id=?`).bind(operationId, id);
}

export async function ensureRecommendation(day = beijingDay()) {
  await drawFor(day).run();
}

function drawFor(day: string) {
  return env.DB.prepare(draw).bind(day);
}

export async function readWithRecommendation<T>(day: string, read: D1PreparedStatement): Promise<D1Result<T>> {
  const [, result] = await env.DB.batch<T>([drawFor(day), read]);
  return result;
}

export async function dailyBook(day = beijingDay()): Promise<PublicBook | null> {
  const read = env.DB.prepare(`SELECT ${publicBookProjection} FROM daily_recommendations r
    JOIN (${libraryJoin}) ON b.id=r.book_id
    WHERE r.day=? AND c.status='published' AND c.eligible_on<=r.day`).bind(day);
  const current = await read.first<string>('book_json');
  if (current !== null) return JSON.parse(current) as PublicBook;
  const result = await readWithRecommendation<{book_json: string}>(day, read);
  const row = result.results[0];
  return row ? JSON.parse(row.book_json) as PublicBook : null;
}
