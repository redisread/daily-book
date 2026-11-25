import { LibraryCover } from '../../components/BookCover';
import { listLibrary } from '../../src/domain/book-library';
import { libraryPageSize, libraryQuery } from '../../src/domain/library-query';

export const dynamic = 'force-dynamic';
const pageLink = (query: string, page: number) => {
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  if (page > 1) params.set('page', String(page));
  return params.size ? '/books?' + params : '/books';
};
export default async function LibraryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(await searchParams)) {
    for (const item of typeof value === 'string' ? [value] : value ?? []) params.append(name, item);
  }
  const { query, page, offset } = libraryQuery(params, true);
  const { items, hasMore } = await listLibrary(query, libraryPageSize, offset);
  return <section className="library-page">
    <h1>书籍库</h1>
    <form action="/books" method="get" className="library-search">
      <label htmlFor="library-query">按书名或作者查找</label>
      <div><input id="library-query" name="q" type="search" defaultValue={query} maxLength={100}/>
        <button type="submit" className="nav-btn">搜索</button>
        {query && <a href="/books">清除</a>}
      </div>
    </form>
    {items.length ? <ul className="library-grid">
      {items.map(book => <li key={book.id} data-library-book-id={book.id}>
        <a href={'/books/' + encodeURIComponent(book.id)}>
          <LibraryCover {...book}/>
          <h2>{book.title}</h2><p>{book.author}</p>
        </a>
      </li>)}
    </ul> : <p>{query ? '没有找到符合条件的书。' : '暂无公开书籍。'}</p>}
    {(page > 1 || hasMore) && <nav aria-label="书籍库分页" className="library-pager">
      {page > 1 && <a href={pageLink(query, page - 1)}>上一页</a>}
      {hasMore && <a href={pageLink(query, page + 1)}>下一页</a>}
    </nav>}
  </section>;
}
