import { listPublishedIssues } from '../src/domain/issues';
import { IssueArticle,displayIssue } from '../components/IssueArticle';
import { BookArticle } from '../components/BookArticle';
import { libraryReady } from '../src/domain/book-library';
import { beijingDay, dailyBook } from '../src/domain/daily-recommendation';
export const dynamic='force-dynamic';
export default async function Home() {
  if (await libraryReady()) {
    const day = beijingDay();
    const book = await dailyBook(day);
    return book ? <BookArticle book={book} day={day}/> : <section className="empty-state" id="empty-state"><h1>今日推荐</h1><p>暂无推荐。</p></section>;
  }
  const {items}=await listPublishedIssues({limit:1,cursor:null});
  return items[0]?<IssueArticle issue={displayIssue(items[0])} home/>:<section className="empty-state" id="empty-state"><h1>每日一书</h1><p>暂无已发布刊期。</p></section>;
}
