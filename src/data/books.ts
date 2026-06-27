import { load } from "js-yaml";
import { BookSchema } from "../schemas/book";
import type { Book, Quote } from "../schemas/book";
import booksYaml from "./books.yaml?raw";

export type { Book, Quote };

const parsed = load(booksYaml);

const validation = BookSchema.array().safeParse(parsed);
if (!validation.success) {
  const issues = validation.error.issues.map(i => ({ path: i.path.join("."), message: i.message, code: i.code }));
  console.error("books.yaml 校验失败:", JSON.stringify(issues, null, 2));
  throw new Error("书籍数据校验失败，无法启动");
}
export const books: Book[] = validation.data;

export interface PublishedEntry {
  date: string;
  bookId: string;
}

// 从 books.yaml 的 publishedDate 字段推导发布历史（唯一数据源）
export const publishedHistory: PublishedEntry[] = books
  .filter((b) => b.publishedDate != null)
  .sort((a, b) => b.publishedDate!.localeCompare(a.publishedDate!))
  .map((b) => ({ date: b.publishedDate!, bookId: b.id }));

function getBookById(id: string): Book | undefined {
  return books.find((b) => b.id === id);
}

function parseDateString(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function getPublishedBooks(count: number): { date: Date; book: Book }[] {
  if (publishedHistory.length === 0) {
    return getRecentBooks(count);
  }
  const result: { date: Date; book: Book }[] = [];
  for (const entry of publishedHistory.slice(0, count)) {
    const book = getBookById(entry.bookId);
    if (book) {
      result.push({ date: parseDateString(entry.date), book });
    }
  }
  return result;
}

export function getLatestPublishedBook(): { date: Date; book: Book } {
  if (publishedHistory.length === 0) {
    return { date: new Date(), book: getTodayBook() };
  }
  for (const entry of publishedHistory) {
    const book = getBookById(entry.bookId);
    if (book) {
      return { date: parseDateString(entry.date), book };
    }
  }
  return { date: new Date(), book: getTodayBook() };
}

export function getRecentBooks(days: number): { date: Date; book: Book }[] {
  const result: { date: Date; book: Book }[] = [];
  for (let i = 0; i < days; i++) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    result.push({ date, book: getBookForDate(date) });
  }
  return result;
}

function seededShuffle(arr: Book[], seed: number): Book[] {
  const result = [...arr];
  let s = seed >>> 0;
  for (let i = result.length - 1; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = s % (i + 1);
    const tmp = result[i];
    result[i] = result[j];
    result[j] = tmp;
  }
  return result;
}

const EPOCH_DATE = new Date(2024, 0, 1);
const shuffleCache = new Map<number, Book[]>();

function getShuffledBooks(): Book[] {
  const key = books.length;
  if (!shuffleCache.has(key)) {
    shuffleCache.set(key, seededShuffle(books, 42));
  }
  return shuffleCache.get(key)!;
}

export function getBookForDate(date: Date): Book {
  const dateStr = formatDateISO(date);
  const historyEntry = publishedHistory.find((e) => e.date === dateStr);
  if (historyEntry) {
    const book = getBookById(historyEntry.bookId);
    if (book) return book;
  }

  const dayNumber = Math.floor(
    (date.getTime() - EPOCH_DATE.getTime()) / (1000 * 60 * 60 * 24)
  );
  const shuffled = getShuffledBooks();
  const index = ((dayNumber % shuffled.length) + shuffled.length) % shuffled.length;
  return shuffled[index];
}

export function getTodayBook(): Book {
  return getBookForDate(new Date());
}

export function formatDate(date: Date): string {
  const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 星期${weekdays[date.getDay()]}`;
}

export function formatDateShort(date: Date): string {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

export function formatDateISO(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function getAllCategories(): string[] {
  const categories = new Set<string>();
  books.forEach((book) => categories.add(book.category));
  return Array.from(categories).sort();
}

export function searchBooks(query: string): Book[] {
  const lowerQuery = query.toLowerCase().trim();
  if (!lowerQuery) return books;

  return books.filter(
    (book) =>
      book.title.toLowerCase().includes(lowerQuery) ||
      book.author.toLowerCase().includes(lowerQuery)
  );
}

export function getPublishedDates(): string[] {
  return publishedHistory.map((entry) => entry.date);
}

export function getBookDateMap(): Map<string, string> {
  const map = new Map<string, string>();
  for (const entry of publishedHistory) {
    const book = getBookById(entry.bookId);
    if (book && !map.has(book.id)) {
      map.set(book.id, entry.date);
    }
  }
  return map;
}
