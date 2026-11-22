import {env} from 'cloudflare:workers';
import {formatRss,type RssEntry} from './rss-format';
export async function publicRssResponse():Promise<Response> {
  // One native public snapshot; body/quotes/private rows never enter projection.
  const result=await env.DB.prepare(`SELECT i.id,i.publication_date AS date,b.title,b.author,b.description
    FROM issues i JOIN books b ON b.id=i.book_id WHERE i.status='published'
    ORDER BY i.publication_date DESC,i.id DESC LIMIT 20`).all<RssEntry>();
  return new Response(formatRss(result.results),{headers:{'Content-Type':'application/rss+xml; charset=utf-8','Cache-Control':'no-store'}});
}
