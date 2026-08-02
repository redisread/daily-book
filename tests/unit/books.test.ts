import { describe, it, expect } from 'vitest';
import {
  books,
  publishedHistory,
  getBookForDate,
  getPublishedBooks,
  getLatestPublishedBook,
  getPublishedDates,
  getBookDateMap,
  formatDate,
  formatDateShort,
  formatDateISO,
  searchBooks,
  getAllCategories,
} from '../../src/data/books';

describe('books data', () => {
  it('should load and validate books from Markdown files', () => {
    expect(books.length).toBeGreaterThan(0);
    expect(books[0]).toHaveProperty('id');
    expect(books[0]).toHaveProperty('title');
    expect(books[0]).toHaveProperty('author');
    expect(books[0]).toHaveProperty('year');
    expect(books[0]).toHaveProperty('pages');
    expect(books[0]).toHaveProperty('rating');
    expect(typeof books[0].year).toBe('number');
    expect(typeof books[0].pages).toBe('number');
    expect(typeof books[0].rating).toBe('number');
  });
});

describe('books Markdown source', () => {
  it('should keep ids and published dates unique', () => {
    const ids = new Set(books.map((book) => book.id));
    const dates = new Set(
      books
        .map((book) => book.publishedDate)
        .filter((date): date is string => date != null)
    );
    expect(ids.size).toBe(books.length);
    expect(dates.size).toBe(books.filter((book) => book.publishedDate != null).length);
  });

  it('should separate the duplicated cognitive-awakening entries', () => {
    const first = books.find((book) => book.id === 'cognitive-awakening');
    const revisit = books.find((book) => book.id === 'cognitive-awakening-revisit');
    expect(first?.publishedDate).toBe('2026-05-02');
    expect(revisit?.publishedDate).toBe('2026-07-04');
  });

  it('should load legacy markdown content into body', () => {
    const book = books.find((item) => item.id === 'island-bookstore');
    expect(book?.body).toContain('## 推荐语');
  });
});

// P1 特性 A（spec v1.1 §2.2 / §5 #4）：editorNote zod 卡口
describe('editorNote schema gate', () => {
  it('7-24《人月神话》revisit 样张在 100 字内（zod length 按 UTF-16 计）', () => {
    const mm = books.find((b) => b.id === 'the-mythical-man-month-revisit');
    expect(mm?.editorNote).toBeTruthy();
    expect(mm!.editorNote!.length).toBeLessThanOrEqual(100);
    expect(mm!.editorNote).toBe(
      'Brooks 的外科手术团队与我们的 agent harness 惊人相似：一个主刀、一群助手、规则是作者不审自己的稿。五十年前的组织智慧，正好理解今天的 agent 团队。'
    );
  });

  it('05-14 旧条目 editorNote 已挪走（task #44 人月神话特例）', () => {
    const old = books.find((b) => b.id === 'the-mythical-man-month');
    expect(old).toBeTruthy();
    expect(old?.editorNote).toBeUndefined();
  });

  it('超 100 字被 zod 拒绝；缺失合法（老书向后兼容）', async () => {
    const { BookSchema } = await import('../../src/schemas/book');
    const base = {
      id: 'gate-test', title: 't', author: 'a', category: 'c', year: 2000,
      pages: 100, rating: 8, desc: 'd', coverTitle: 't', coverAuthor: 'a',
      quotes: [{ text: 'q', page: 'p' }],
    };
    expect(BookSchema.safeParse(base).success).toBe(true); // 无 editorNote
    expect(BookSchema.safeParse({ ...base, editorNote: 'x'.repeat(100) }).success).toBe(true);
    expect(BookSchema.safeParse({ ...base, editorNote: 'x'.repeat(101) }).success).toBe(false);
    expect(BookSchema.safeParse({ ...base, editorNote: '' }).success).toBe(false);
  });
});

describe('formatDate', () => {
  it('should format date in Chinese', () => {
    const date = new Date(2026, 5, 18); // June 18, 2026
    expect(formatDate(date)).toBe('2026年6月18日 星期四');
  });
});

describe('formatDateShort', () => {
  it('should format date as M/D', () => {
    expect(formatDateShort(new Date(2026, 0, 1))).toBe('1/1');
    expect(formatDateShort(new Date(2026, 11, 25))).toBe('12/25');
  });
});

describe('formatDateISO', () => {
  it('should format date as YYYY-MM-DD', () => {
    expect(formatDateISO(new Date(2026, 5, 18))).toBe('2026-06-18');
    expect(formatDateISO(new Date(2026, 0, 1))).toBe('2026-01-01');
  });
});

describe('getBookForDate', () => {
  it('should return book from published history for known dates', () => {
    const book = getBookForDate(new Date(2026, 5, 18)); // 2026-06-18
    expect(book).toBeDefined();
    expect(book.id).toBe('hackers-and-painters');
  });

  it('should return fallback book for dates outside history', () => {
    // Use a date far in the past that's not in publishedHistory
    const book = getBookForDate(new Date(2020, 0, 1));
    expect(book).toBeDefined();
    expect(book.id).toBeTruthy();
  });

  it('should be deterministic for the same date', () => {
    const date = new Date(2025, 6, 15);
    const book1 = getBookForDate(date);
    const book2 = getBookForDate(date);
    expect(book1.id).toBe(book2.id);
  });
});

describe('getPublishedBooks', () => {
  it('should return correct count', () => {
    const result = getPublishedBooks(5);
    expect(result.length).toBe(5);
  });

  it('should return books with dates', () => {
    const result = getPublishedBooks(3);
    result.forEach(({ date, book }) => {
      expect(date).toBeInstanceOf(Date);
      expect(book).toBeDefined();
      expect(book.id).toBeTruthy();
    });
  });

  it('should return books in reverse chronological order', () => {
    const result = getPublishedBooks(5);
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].date.getTime()).toBeGreaterThan(result[i].date.getTime());
    }
  });
});

describe('getLatestPublishedBook', () => {
  it('should return the most recent published book', () => {
    const { date, book } = getLatestPublishedBook();
    expect(date).toBeInstanceOf(Date);
    expect(book).toBeDefined();
    // 最新发布 = publishedHistory 排序后第一个
    const latest = publishedHistory[0];
    expect(book.id).toBe(latest.bookId);
  });
});

describe('getPublishedDates', () => {
  it('should return all published dates', () => {
    const dates = getPublishedDates();
    expect(dates.length).toBe(publishedHistory.length);
    expect(dates[0]).toBe(publishedHistory[0].date); // 最新
    expect(dates[dates.length - 1]).toBe(publishedHistory[publishedHistory.length - 1].date); // 最早
  });

  it('should return dates in YYYY-MM-DD format', () => {
    const dates = getPublishedDates();
    dates.forEach((d) => {
      expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });
});

describe('getBookDateMap', () => {
  it('should map book IDs to their first published date', () => {
    const map = getBookDateMap();
    expect(map.size).toBeGreaterThan(0);
    expect(map.get('hackers-and-painters')).toBe('2026-06-18');
  });
});

describe('searchBooks', () => {
  it('should return all books for empty query', () => {
    expect(searchBooks('').length).toBe(books.length);
  });

  it('should search by title', () => {
    const result = searchBooks('百年孤独');
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].title).toBe('百年孤独');
  });

  it('should search by author', () => {
    const result = searchBooks('马尔克斯');
    expect(result.length).toBeGreaterThan(0);
    expect(result.some((b) => b.author.includes('马尔克斯'))).toBe(true);
  });

  it('should be case-insensitive', () => {
    const lower = searchBooks('dune');
    const upper = searchBooks('DUNE');
    expect(lower.length).toBe(upper.length);
  });
});

describe('getAllCategories', () => {
  it('should return unique sorted categories', () => {
    const categories = getAllCategories();
    expect(categories.length).toBeGreaterThan(0);
    // Check sorted
    const sorted = [...categories].sort();
    expect(categories).toEqual(sorted);
    // Check unique
    expect(new Set(categories).size).toBe(categories.length);
  });
});
