import {archiveSearchParams as toQueryParams} from '../../src/archive-input';
import {parseSearchInput} from '../../src/domain/search-input';
import {searchPublishedIssues} from '../../src/domain/search';
export const dynamic='force-dynamic';
export const metadata={title:'搜索书籍 · 每日一书'};
export default async function Search({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const input=parseSearchInput(toQueryParams(await searchParams),true);
  const result=input?await searchPublishedIssues(input):null;
  const next=result?.nextCursor?'/search?'+new URLSearchParams({q:input!.q,limit:String(input!.limit),cursor:result.nextCursor}).toString():null;
  return <section className="public-search-page">
    <header className="search-page search-heading"><h1 className="page-title">搜索书籍</h1><p className="page-desc">搜索书名、作者、类别、简介或编辑话。</p></header>
    <div className="search-container"><form className="search-form" action="/search" method="get" role="search">
      <label htmlFor="search-query">关键词</label><div className="search-input-wrapper"><input className="search-input" id="search-query" type="search" name="q" defaultValue={input?.q??''} required aria-describedby="search-help" autoComplete="off"/><button type="submit" className="search-btn">搜索</button></div>
      <p id="search-help" className="search-help">输入1–100个Unicode码点，按字面子串搜索已发布刊期。</p>
      {input&&input.limit!==20&&<input type="hidden" name="limit" value={input.limit}/>}
    </form></div>
    {!input?<div className="empty-state"><p>输入关键词，搜索已发布刊期。</p></div>:<section className="results-container" aria-label="搜索结果">
      <div className="results-header"><p className="results-count">本页显示 {result!.items.length} 期 <span className="search-term">{input.q}</span></p></div>
      {result!.items.length?<div className="books-grid">{result!.items.map(row=><a className="book-card search-result" key={row.id} href={`/issues/${encodeURIComponent(row.id)}`} data-search-issue-id={row.id} data-search-issue-number={row.number} data-search-date={row.date} aria-label={`阅读第 ${row.number} 期：${row.title}`}><div className="book-info"><span className="archive-period">第 {row.number} 期</span><time className="history-date" dateTime={row.date}>{row.date}</time><h2 className="book-title">{row.title}</h2><p className="book-author">{row.author}</p></div></a>)}</div>:<div className="empty-state"><p>未找到相关刊期。</p><p className="empty-hint">尝试其他关键词。</p></div>}
      <div className="archive-pagination">{input.cursor&&<p>可使用浏览器返回查看上一页。</p>}{next&&<a className="nav-btn" rel="next" href={next}>下一页</a>}</div>
    </section>}
  </section>;
}
