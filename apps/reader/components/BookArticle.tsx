import { BookCover } from './BookCover';
import { dateLabel } from './IssueArticle';
import { QuoteReader } from './QuoteReader';
import type { PublicBook } from '../src/domain/book-library';

export function BookArticle({ book, day }: { book: PublicBook; day?: string }) {
  const href = '/books/' + encodeURIComponent(book.id);
  const meta = [
    book.year !== null ? String(book.year) : null,
    book.pages !== null ? `${book.pages}页` : null,
    book.rating !== null ? `评分 ${book.rating}` : null,
  ].filter(Boolean);
  return <article data-book-id={book.id}>
    {day && <div className="date-bar"><div className="date-info">
      <a href={href} className="date-issue issue-link">今日推荐</a>
      <time className="date-main" dateTime={day}>{dateLabel(day)}</time>
    </div></div>}
    <div className="hero-card"><div className="hero-content">
      <div className="book-cover-section"><BookCover title={book.title} coverTitle={book.coverTitle} coverAuthor={book.coverAuthor} coverUrl={book.coverUrl} alt={book.alt}/></div>
      <div className="book-info-section">
        {book.category && <div className="book-category">{book.category}</div>}
        <h1 className="book-title" data-long-title={book.title.length > 24 || undefined}>{day ? <a href={href}>{book.title}</a> : book.title}</h1>
        {book.author && <p className="book-author">{book.author}</p>}
        {book.description && <p className="book-desc">{book.description}</p>}
        {book.editorNote?.trim() && <aside className="editor-note" aria-label="编辑的话">
          <h2 className="editor-note-label">—— 编辑的话</h2><p className="editor-note-text">{book.editorNote}</p>
        </aside>}
        {meta.length > 0 && <p className="book-meta-inline">{meta.join(' · ')}</p>}
      </div>
    </div></div>
    <QuoteReader quotes={book.quotes} title={book.title} author={book.author}/>
  </article>;
}
