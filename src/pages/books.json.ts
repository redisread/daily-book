import type { APIRoute } from 'astro';
import { books, getBookDateMap, formatDateISO } from '../data/books';

export const prerender = true;

// 构建 book.id -> 日期映射（基于 publishedHistory）
const bookDateMap = getBookDateMap();

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
    date: bookDateMap.get(book.id) || book.id,
  }));

  return new Response(JSON.stringify(searchBooks), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
