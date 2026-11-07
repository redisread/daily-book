import { listPublishedIssues } from '../src/domain/issues';
import { IssueArticle,displayIssue } from '../components/IssueArticle';
export const dynamic='force-dynamic';
export default async function Home() {
  const {items}=await listPublishedIssues({limit:1,cursor:null});
  return items[0]?<IssueArticle issue={displayIssue(items[0])} home/>:<section className="empty-state" id="empty-state"><h1>每日一书</h1><p>暂无已发布刊期。</p></section>;
}
