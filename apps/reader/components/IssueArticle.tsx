import type { PublicIssue } from '../src/domain/types';
import { BookCover } from './BookCover';
import { QuoteReader } from './QuoteReader';
export type DisplayedIssue=Pick<PublicIssue,'id'|'book'|'quotes'|'publicationDate'|'issueNumber'|'editorNote'>;
// React Flight's development diagnostics can serialize Server Component props
// too. Select the display DTO before crossing ANY component boundary.
export function displayIssue(issue:PublicIssue):DisplayedIssue {
  return {id:issue.id,book:issue.book,quotes:issue.quotes,publicationDate:issue.publicationDate,issueNumber:issue.issueNumber,editorNote:issue.editorNote};
}
const weekdays=['日','一','二','三','四','五','六'];
function dateLabel(value:string) {
  const date=new Date(`${value}T00:00:00Z`);
  return `${date.getUTCFullYear()}年${date.getUTCMonth()+1}月${date.getUTCDate()}日 星期${weekdays[date.getUTCDay()]}`;
}
export function IssueArticle({issue,home=false}:{issue:DisplayedIssue;home?:boolean}) {
  const book=issue.book;const href=`/issues/${encodeURIComponent(issue.id)}`;
  const meta=[book.year!==null?String(book.year):null,book.pages!==null?`${book.pages}页`:null,book.rating!==null?`评分 ${book.rating}`:null].filter(value=>value!==null);
  return <article data-issue-id={issue.id}>
    <div className="date-bar"><div className="date-info">
      {home?<a className="date-issue issue-link" href={href} aria-label={`阅读第 ${issue.issueNumber} 期详情`}>第 {issue.issueNumber} 期</a>:<div className="date-issue">第 {issue.issueNumber} 期</div>}
      <time className="date-main" dateTime={issue.publicationDate}>{dateLabel(issue.publicationDate)}</time>
      <div className="date-reading-day">{home?'最新已发布刊期':'本期推荐'}</div>
    </div>{!home&&<a className="date-arrow" href="/" title="回到最新推荐" aria-label="回到最新推荐">今</a>}</div>
    <div className="hero-card"><div className="hero-content"><div className="book-cover-section"><BookCover title={book.title} coverTitle={book.coverTitle} coverAuthor={book.coverAuthor}/></div>
      <div className="book-info-section">
        {book.category&&<div className="book-category">{book.category}</div>}
        <h1 className="book-title" data-long-title={book.title.length>24||undefined}>{book.title}</h1>
        {book.author&&<p className="book-author"><span>{book.author}</span></p>}
        {book.description&&<p className="book-desc">{book.description}</p>}
        {issue.editorNote?.trim()&&<aside className="editor-note" aria-label="编辑的话"><h2 className="editor-note-label">—— 编辑的话</h2><p className="editor-note-text">{issue.editorNote}</p></aside>}
        {meta.length>0&&<div className="book-meta-inline">{meta.map((value,index)=><span key={index}>{index>0&&<span className="meta-dot" aria-hidden="true">· </span>}{value}</span>)}</div>}
      </div>
    </div></div>
    <QuoteReader quotes={issue.quotes} title={book.title} author={book.author}/>
  </article>;
}
