import {CANONICAL_ORIGIN} from './site';
export interface RssEntry {id:string;date:string;title:string;author:string;description:string|null}
export function xmlText(value:string):string {
  // XML1.0 cannot represent NUL/control characters, even as numeric entities.
  const clean=[...value].map(char=>{const cp=char.codePointAt(0)!;return cp===9||cp===10||cp===13||(cp>=32&&cp<=0xD7FF)||(cp>=0xE000&&cp<=0xFFFD)||(cp>=0x10000&&cp<=0x10FFFF)?char:'\uFFFD';}).join('');
  return clean.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;');
}
export function publicationDate822(value:string):string {
  const date=new Date(`${value}T00:00:00Z`);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==value)throw new Error('Invalid stored publication date');
  const weekdays=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${weekdays[date.getUTCDay()]}, ${value.slice(8)} ${months[date.getUTCMonth()]} ${value.slice(0,4)} 00:00:00 +0800`;
}
export function formatRss(entries:readonly RssEntry[]):string {
  const items=entries.map(entry=>{const link=`${CANONICAL_ORIGIN}/issues/${encodeURIComponent(entry.id)}`;return `<item><title>${xmlText(entry.title)}</title><link>${xmlText(link)}</link><guid isPermaLink="true">${xmlText(link)}</guid><pubDate>${publicationDate822(entry.date)}</pubDate><description>${xmlText(`作者：${entry.author}${entry.description?'\n'+entry.description:''}`)}</description></item>`;}).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>每日一书</title><link>${CANONICAL_ORIGIN}/</link><description>每天推荐一本好书。刊期日期采用北京时间当天00:00，不代表精确发布时间。</description><language>zh-CN</language><atom:link href="${CANONICAL_ORIGIN}/rss.xml" rel="self" type="application/rss+xml"/>\n${items}\n</channel></rss>`;
}
