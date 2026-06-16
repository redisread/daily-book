import type { APIRoute } from 'astro';
import { books, getBookForDate, formatDateISO } from '../data/books';

export const prerender = true;

// 构建 book.id -> 日期映射（最近 90 天内首次出现）
const bookDateMap: Record<string, string> = {};
for (let i = 0; i < 90; i++) {
  const d = new Date();
  d.setDate(d.getDate() - i);
  const dateStr = formatDateISO(d);
  const book = getBookForDate(d);
  if (!bookDateMap[book.id]) {
    bookDateMap[book.id] = dateStr;
  }
}

export const GET: APIRoute = () => {
  // 精简搜索数据 + 日期映射，减少传输体积
  const searchBooks = books.map(book => ({
    id: book.id,
    title: book.title,
    author: book.author,
    category: book.category,
    coverBg: book.coverBg,
    coverTitle: book.coverTitle,
    coverAuthor: book.coverAuthor,
    desc: book.desc,
    date: bookDateMap[book.id] || book.id,
  }));

  return new Response(JSON.stringify(searchBooks), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
