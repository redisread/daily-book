import {describe,it,expect} from 'vitest';
import {formatRss,publicationDate822,xmlText} from '../../apps/reader/src/rss-format';
import {CANONICAL_ORIGIN} from '../../apps/reader/src/site';
const row={id:'issue-one',date:'2026-11-07',title:'书名<&>"\'',author:'作者<&>',description:'简介<&>'};
describe('public RSS format',()=>{
  it('uses the pinned canonical site, not an input host',()=>expect(CANONICAL_ORIGIN).toBe('https://daily-book.jiahongw.com'));
  it('escapes all XML delimiters',()=>expect(xmlText('<&>"\'')).toBe('&lt;&amp;&gt;&quot;&apos;'));
  it('preserves Unicode, whitespace and astral text',()=>expect(xmlText('中文😀\t\n\r')).toBe('中文😀\t\n\r'));
  it('replaces characters XML1.0 cannot represent',()=>expect(xmlText('a\0\v\uD800b')).toBe('a���b'));
  it('uses calendar-date midnight+0800 with the matching weekday',()=>{expect(publicationDate822('2026-11-07')).toBe('Sat, 07 Nov 2026 00:00:00 +0800');expect(Date.parse(publicationDate822('2026-11-07'))).toBe(Date.parse('2026-11-06T16:00:00Z'));});
  it('rejects an invalid stored calendar date',()=>expect(()=>publicationDate822('2026-02-30')).toThrow());
  it('produces an empty RSS2.0 channel',()=>{const text=formatRss([]);expect(text).toContain('<rss version="2.0"');expect(text).toContain('<channel>');expect(text).not.toContain('<item>');});
  it('uses the canonical issue permalink as stable guid',()=>{const text=formatRss([row]);expect(text).toContain(`<guid isPermaLink="true">${CANONICAL_ORIGIN}/issues/issue-one</guid>`);expect(formatRss([{...row,title:'changed',author:'changed'}])).toContain(`<guid isPermaLink="true">${CANONICAL_ORIGIN}/issues/issue-one</guid>`);});
  it('publishes title/author/description safely, not HTML',()=>{const text=formatRss([row]);expect(text).toContain('书名&lt;&amp;&gt;&quot;&apos;');expect(text).toContain('作者：作者&lt;&amp;&gt;');expect(text).toContain('简介&lt;&amp;&gt;');expect(text).not.toContain('<&>');});
});
