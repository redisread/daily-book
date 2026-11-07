import { listPublishedIssues } from '../src/domain/issues';
export const dynamic = 'force-dynamic';
export default async function Home() {
  const { items } = await listPublishedIssues({ limit: 1, cursor: null });
  const latest = items[0];
  return <main><h1>每日一书</h1><p>本地正式读取切片；完整主题在后续任务实现。</p>
    {latest ? <article data-issue-id={latest.id}>
      <p>第 {latest.issueNumber} 期 · {latest.publicationDate}</p>
      <h2><a href={`/issues/${encodeURIComponent(latest.id)}`}>{latest.book.title}</a></h2>
      <p>{latest.book.author}</p><p>{latest.book.description}</p>
    </article> : <p id="empty-state">暂无已发布刊期。</p>}
  </main>;
}
