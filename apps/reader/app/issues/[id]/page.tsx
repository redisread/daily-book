import { notFound } from 'next/navigation';
import { readIssue } from '../../../src/domain/issues';
import { IssueArticle,displayIssue } from '../../../components/IssueArticle';
export const dynamic='force-dynamic';
export async function generateMetadata({params}:{params:Promise<{id:string}>}) {
  const result=await readIssue((await params).id);
  return {title:result.kind==='published'?`${result.issue.book.title} · 每日一书`:'每日一书'};
}
export default async function Issue({params}:{params:Promise<{id:string}>}) {
  const result=await readIssue((await params).id);
  // Metadata, proxy and page consume one request-local visibility/projection.
  // Pass only displayed fields across every component boundary, never body.
  if(result.kind!=='published')notFound();
  return <IssueArticle issue={displayIssue(result.issue)}/>;
}
