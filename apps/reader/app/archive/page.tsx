import {listPublishedIssues} from '../../src/domain/issues';
import {archiveSearchParams,parseArchiveInput} from '../../src/archive-input';
import type {PublicIssue} from '../../src/domain/types';
export const dynamic='force-dynamic';
export const metadata={title:'过往刊号 · 每日一书'};
interface Summary {id:string;date:string;number:number;title:string;author:string}
function summary(issue:PublicIssue):Summary {
  // Even Server Component props/debug data must never receive the raw body.
  return {id:issue.id,date:issue.publicationDate,number:issue.issueNumber,title:issue.book.title,author:issue.book.author};
}
export default async function Archive({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const input=parseArchiveInput(archiveSearchParams(await searchParams));
  const {items,nextCursor}=await listPublishedIssues(input);
  const groups:{key:string;entries:Summary[]}[]=[];
  for(const row of items.map(summary)){
    const key=row.date.slice(0,7);let group=groups.at(-1);
    if(!group||group.key!==key){group={key,entries:[]};groups.push(group);}group.entries.push(row);
  }
  return <section data-page="archive" className="archive-page">
    <header className="archive-heading"><h1 className="page-title">过往刊号</h1><p className="page-desc">按发布日期浏览已发布刊期，每页最多20期。</p></header>
    {groups.length?groups.map(group=><section className="archive-month-group" key={group.key} aria-label={`${group.key.slice(0,4)}年${Number(group.key.slice(5))}月`}><h2 className="archive-month-label">{group.key.slice(0,4)}年{Number(group.key.slice(5))}月</h2>
      <div className="archive-grid">{group.entries.map(row=><a href={`/issues/${encodeURIComponent(row.id)}`} className="history-card archive-entry" key={row.id} data-archive-issue-id={row.id} data-archive-issue-number={row.number} data-archive-date={row.date} aria-label={`阅读第 ${row.number} 期：${row.title}`}>
        <span className="archive-period">第 {row.number} 期</span><time className="history-date" dateTime={row.date}>{row.date}</time><h3 className="history-title">{row.title}</h3><p className="history-author">{row.author}</p>
      </a>)}</div>
    </section>):<div className="empty-state"><p>{input.cursor?'此页暂无刊期。':'暂无已发布刊期。'}</p>{input.cursor&&<a className="nav-btn" href="/archive">回到归档首页</a>}</div>}
    <nav className="archive-pagination" aria-label="归档翻页">
      {input.cursor&&<p>可使用浏览器返回查看上一页。</p>}
      {nextCursor!==null&&<a className="nav-btn" rel="next" href={`/archive?cursor=${encodeURIComponent(nextCursor)}`}>下一页</a>}
    </nav>
  </section>;
}
