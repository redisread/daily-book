import { notFound } from 'next/navigation';
import { readIssue } from '../../../src/domain/issues';
export const dynamic = 'force-dynamic';
export default async function Issue({ params }: { params: Promise<{ id: string }> }) {
  const result = await readIssue((await params).id);
  // Proxy handles exact private-resource status before streaming; this recheck prevents a visibility race from exposing content.
  if (result.kind !== 'published') notFound();
  const issue = result.issue;
  return <main data-issue-id={issue.id}>
    <a href="/">每日一书</a><p>第 {issue.issueNumber} 期 · {issue.publicationDate}</p>
    <h1>{issue.book.title}</h1><p>{issue.book.author}</p><p>{issue.book.description}</p>
    {issue.editorNote !== null && <section><h2>编辑的话</h2><p>{issue.editorNote}</p></section>}
    <section><h2>书摘</h2>{issue.quotes.map((quote) => <blockquote key={quote.id} data-quote-id={quote.id}>
      <p>{quote.text}</p><cite>{quote.sourceLabel}</cite>
    </blockquote>)}</section>
  </main>;
}
