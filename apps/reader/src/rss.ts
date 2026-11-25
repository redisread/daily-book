import {env} from 'cloudflare:workers';
import {formatRss,type RssEntry} from './rss-format';
import { libraryReady } from './domain/book-library';
import { beijingDay, readWithRecommendation } from './domain/daily-recommendation';
export async function publicRssResponse():Promise<Response> {
  if (await libraryReady()) {
    const day = beijingDay();
    const read = env.DB.prepare(`SELECT b.id,r.day AS date,b.title,b.author,b.description
      FROM daily_recommendations r JOIN books b ON b.id=r.book_id JOIN book_content c ON c.book_id=b.id
      WHERE c.status='published' AND r.day<=? AND (r.day<? OR c.eligible_on<=r.day)
      ORDER BY r.day DESC LIMIT 20`).bind(day, day);
    const result = await readWithRecommendation<RssEntry>(day, read);
    return new Response(formatRss(result.results, true),{headers:{'Content-Type':'application/rss+xml; charset=utf-8','Cache-Control':'no-store'}});
  }
  // One native public snapshot; body/quotes/private rows never enter projection.
  const result=await env.DB.prepare(`SELECT i.id,i.publication_date AS date,b.title,b.author,b.description
    FROM issues i JOIN books b ON b.id=i.book_id WHERE i.status='published'
    ORDER BY i.publication_date DESC,i.id DESC LIMIT 20`).all<RssEntry>();
  return new Response(formatRss(result.results),{headers:{'Content-Type':'application/rss+xml; charset=utf-8','Cache-Control':'no-store'}});
}
