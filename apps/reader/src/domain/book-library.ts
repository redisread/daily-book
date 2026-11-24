import { env } from 'cloudflare:workers';
import { BOOK_JSON } from './issue-projection';
import { validId } from './pagination';
import type { Book } from './types';
import { readLibraryReadyOnce, readPublicBookOnce } from '../request-reads';

export type BookStatus = 'draft' | 'published' | 'withdrawn';
export interface BookExcerpt {
  id: string;
  text: string;
  sourceLabel: string;
  position: number;
}
export interface LibraryBook extends Book {
  status: BookStatus;
  editorNote: string | null;
  body: string;
  quotes: BookExcerpt[];
}
export type LibraryCard = Pick<Book, 'id' | 'title' | 'author' | 'coverTitle' | 'coverAuthor' | 'coverUrl' | 'alt'>;

const quotes = `(SELECT json_group_array(json_object('id',q.id,'text',q.text,'sourceLabel',q.source_label,'position',q.position))
  FROM (SELECT id,text,source_label,position FROM book_quotes WHERE book_id=b.id ORDER BY position) q)`;
export const LIBRARY_BOOK_JSON = `json_set(${BOOK_JSON},
  '$.status', c.status, '$.editorNote', c.editor_note, '$.body', c.body, '$.quotes',json(${quotes}))`;
const publicBook = `json_remove(${LIBRARY_BOOK_JSON}, '$.body', '$.version', '$.createdAt', '$.updatedAt')`;
export const libraryJoin = 'books b JOIN book_content c ON c.book_id=b.id';
export const publicBookProjection = `${publicBook} AS book_json`;
export type PublicBook = Omit<LibraryBook, 'body' | 'version' | 'createdAt' | 'updatedAt'>;

export function libraryReady() {
  return readLibraryReadyOnce(async () => (await env.DB.prepare(
    "SELECT 1 AS ready FROM sqlite_schema WHERE type='table' AND name='daily_recommendations'",
  ).first<number>('ready')) === 1);
}

export async function readPublicBook(id: string): Promise<PublicBook | null> {
  if (!validId(id)) return null;
  return readPublicBookOnce(id, async () => {
    const json = await env.DB.prepare(`SELECT ${publicBookProjection} FROM ${libraryJoin}
      WHERE c.status='published' AND b.id=?`).bind(id).first<string>('book_json');
    return json === null ? null : JSON.parse(json) as PublicBook;
  });
}

export async function readLibraryBook(id: string): Promise<LibraryBook | null> {
  if (!validId(id)) return null;
  const json = await env.DB.prepare(`SELECT ${LIBRARY_BOOK_JSON} AS book_json FROM ${libraryJoin}
    WHERE b.id=?`).bind(id).first<string>('book_json');
  return json === null ? null : JSON.parse(json) as LibraryBook;
}

export async function listLibrary(query: string, limit: number, offset: number) {
  const result = await env.DB.prepare(`SELECT b.id,b.title,b.author,b.cover_title AS coverTitle,
    b.cover_author AS coverAuthor,b.cover_url AS coverUrl,b.cover_alt AS alt
    FROM ${libraryJoin} WHERE c.status='published'
    AND (instr(lower(b.title),lower(?))>0 OR instr(lower(b.author),lower(?))>0 OR ?='')
    ORDER BY b.title COLLATE NOCASE,b.id LIMIT ? OFFSET ?`)
    .bind(query, query, query, limit + 1, offset).all<LibraryCard>();
  return { items: result.results.slice(0, limit), hasMore: result.results.length > limit };
}
