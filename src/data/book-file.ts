import { load } from "js-yaml";
import { BookSchema } from "../schemas/book";
import type { Book } from "../schemas/book";

export interface ParsedBookFile {
  book: Book;
  body: string;
}

export function parseBookFile(raw: string, fileName: string): ParsedBookFile {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) {
    throw new Error(`缺少 frontmatter: ${fileName}`);
  }

  const frontmatter = load(match[1]);
  const book = BookSchema.parse(frontmatter);
  if (fileName !== `${book.id}.md`) {
    throw new Error(`文件名与 id 不一致: ${fileName} !== ${book.id}.md`);
  }

  return { book, body: raw.slice(match[0].length).trim() };
}

export function bookFromFile(raw: string, fileName: string): Book {
  const { book, body } = parseBookFile(raw, fileName);
  return body ? { ...book, body } : book;
}

export function compareBooks(a: Book, b: Book): number {
  if (a.publishedDate == null && b.publishedDate == null) {
    return a.id.localeCompare(b.id);
  }
  if (a.publishedDate == null) return 1;
  if (b.publishedDate == null) return -1;

  const dateCmp = b.publishedDate.localeCompare(a.publishedDate);
  return dateCmp !== 0 ? dateCmp : a.id.localeCompare(b.id);
}
