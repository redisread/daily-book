/**
 * P0-1 期号系统单元测试
 *
 * spec: notes/daily-book/p0-1-issue-number-spec.md v1.1 §8.1 验证清单
 */

import { describe, it, expect } from "vitest";
import { buildIssueNumberIndex, formatIssueNumber } from "../../src/utils/issue-number";
import type { Book } from "../../src/schemas/book";

/** 造一本最简 book fixture（match src/schemas/book.ts BookSchema） */
function makeBook(overrides: Partial<Book> & Pick<Book, "id"> & { publishedDate: string | null }): Book {
  return {
    id: overrides.id,
    title: overrides.title ?? `Book ${overrides.id}`,
    author: overrides.author ?? "Test Author",
    category: overrides.category ?? "test",
    year: overrides.year ?? 2000,
    pages: overrides.pages ?? 200,
    rating: overrides.rating ?? 4.5,
    desc: overrides.desc ?? "desc",
    coverTitle: overrides.coverTitle ?? overrides.title ?? overrides.id,
    coverAuthor: overrides.coverAuthor ?? "Test Author",
    publishedDate: overrides.publishedDate,
    quotes: overrides.quotes ?? [{ text: "q", page: "p" }],
  };
}

describe("P0-1 buildIssueNumberIndex", () => {
  it("Case 1 — 3 本已发布 + 1 本 null → totalIssues=3, 期号 1/2/3", () => {
    const books: Book[] = [
      makeBook({ id: "a", publishedDate: "2026-01-01" }),
      makeBook({ id: "b", publishedDate: "2026-01-02" }),
      makeBook({ id: "c", publishedDate: "2026-01-03" }),
      makeBook({ id: "d", publishedDate: null }),
    ];
    const idx = buildIssueNumberIndex(books);
    expect(idx.totalIssues).toBe(3);
    expect(idx.bookIdToIssue.get("a")).toBe(1);
    expect(idx.bookIdToIssue.get("b")).toBe(2);
    expect(idx.bookIdToIssue.get("c")).toBe(3);
    expect(idx.bookIdToIssue.has("d")).toBe(false);
    expect(idx.issueToBookId.get(1)).toBe("a");
    expect(idx.issueToBookId.get(3)).toBe("c");
  });

  it("Case 2 — 同一天多本按 book.id 字典序 tiebreaker（幂等）", () => {
    // 2 本同 publishedDate，输入顺序反转，输出仍按 id 字典序
    const books: Book[] = [
      makeBook({ id: "z", publishedDate: "2026-01-01" }),
      makeBook({ id: "a", publishedDate: "2026-01-01" }),
    ];
    const idx = buildIssueNumberIndex(books);
    expect(idx.bookIdToIssue.get("a")).toBe(1); // 字典序前的先
    expect(idx.bookIdToIssue.get("z")).toBe(2);
  });

  it("Case 3 — 全 null → totalIssues=0，maps 皆空", () => {
    const books: Book[] = [
      makeBook({ id: "a", publishedDate: null }),
      makeBook({ id: "b", publishedDate: null }),
    ];
    const idx = buildIssueNumberIndex(books);
    expect(idx.totalIssues).toBe(0);
    expect(idx.bookIdToIssue.size).toBe(0);
    expect(idx.issueToBookId.size).toBe(0);
  });

  it("Case 4 — 输入乱序 → 输出按 publishedDate ASC 排序", () => {
    const books: Book[] = [
      makeBook({ id: "c", publishedDate: "2026-03-01" }),
      makeBook({ id: "a", publishedDate: "2026-01-01" }),
      makeBook({ id: "b", publishedDate: "2026-02-01" }),
    ];
    const idx = buildIssueNumberIndex(books);
    expect(idx.bookIdToIssue.get("a")).toBe(1);
    expect(idx.bookIdToIssue.get("b")).toBe(2);
    expect(idx.bookIdToIssue.get("c")).toBe(3);
  });

  it("Case 5 — 新增 publishedDate 早于历史 → 其后期号 +1（spec §3.3 明确刻意）", () => {
    // 先有 2 本：a=2026-02-01, b=2026-03-01
    const before: Book[] = [
      makeBook({ id: "a", publishedDate: "2026-02-01" }),
      makeBook({ id: "b", publishedDate: "2026-03-01" }),
    ];
    const idx1 = buildIssueNumberIndex(before);
    expect(idx1.bookIdToIssue.get("a")).toBe(1);
    expect(idx1.bookIdToIssue.get("b")).toBe(2);

    // 回填一本 c=2026-01-01（早于 a）
    const after: Book[] = [
      makeBook({ id: "c", publishedDate: "2026-01-01" }),
      ...before,
    ];
    const idx2 = buildIssueNumberIndex(after);
    expect(idx2.bookIdToIssue.get("c")).toBe(1);
    expect(idx2.bookIdToIssue.get("a")).toBe(2); // 从 1 → 2
    expect(idx2.bookIdToIssue.get("b")).toBe(3); // 从 2 → 3
  });

  it("Case 6 — 新增 publishedDate 最新 → 历史期号不变（无副作用）", () => {
    const before: Book[] = [
      makeBook({ id: "a", publishedDate: "2026-01-01" }),
      makeBook({ id: "b", publishedDate: "2026-02-01" }),
    ];
    const idx1 = buildIssueNumberIndex(before);
    const after: Book[] = [
      ...before,
      makeBook({ id: "c", publishedDate: "2026-03-01" }),
    ];
    const idx2 = buildIssueNumberIndex(after);
    expect(idx2.bookIdToIssue.get("a")).toBe(idx1.bookIdToIssue.get("a"));
    expect(idx2.bookIdToIssue.get("b")).toBe(idx1.bookIdToIssue.get("b"));
    expect(idx2.bookIdToIssue.get("c")).toBe(3);
  });
});

describe("P0-1 formatIssueNumber", () => {
  it("默认 long → 第 N 期", () => {
    expect(formatIssueNumber(105)).toBe("第 105 期");
  });

  it("short → #N", () => {
    expect(formatIssueNumber(105, "short")).toBe("#105");
  });

  it("long → 第 N 期（显式）", () => {
    expect(formatIssueNumber(1, "long")).toBe("第 1 期");
  });
});