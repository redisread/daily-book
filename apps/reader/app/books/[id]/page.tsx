import { notFound } from 'next/navigation';
import { BookArticle } from '../../../components/BookArticle';
import { readPublicBook } from '../../../src/domain/book-library';

export const dynamic = 'force-dynamic';
type Props = { params: Promise<{ id: string }> };
export async function generateMetadata({ params }: Props) {
  const book = await readPublicBook((await params).id);
  return { title: book ? `${book.title} · 每日一书` : '每日一书' };
}
export default async function BookPage({ params }: Props) {
  const book = await readPublicBook((await params).id);
  if (!book) notFound();
  return <BookArticle book={book}/>;
}
