import { describe, it, expect } from 'vitest';
import {
  books,
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
  it('should load and validate books from YAML', () => {
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
    expect(book.id).toBe('hackers-and-painters');
  });
});

describe('getPublishedDates', () => {
  it('should return all published dates', () => {
    const dates = getPublishedDates();
    expect(dates.length).toBeGreaterThan(0);
    expect(dates[0]).toBe('2026-06-18');
    expect(dates[dates.length - 1]).toBe('2026-03-24');
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
