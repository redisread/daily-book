import { describe, expect, it } from "vitest";
import { books } from "../../src/data/books";
import { buildBookRssContent, markdownToHtml } from "../../src/utils/rss";

describe("buildBookRssContent", () => {
  it("should include full book information and all quotes", () => {
    const book = books.find((item) => item.id === "the-illustrated-man")!;
    const html = buildBookRssContent(book, "https://daily-book.jiahongw.com/book/2026-08-02/");

    expect(html).toContain("<h2>简介</h2>");
    expect(html).toContain(book.desc);
    expect(html).toContain(book.editorNote!);
    expect(html).toContain("<h2>精选金句</h2>");
    for (const quote of book.quotes) {
      expect(html).toContain(quote.text);
    }
    expect(html).toContain("阅读原文");
  });

  it("should include body when present", () => {
    const book = books.find((item) => item.id === "island-bookstore")!;
    const html = buildBookRssContent(book, "https://daily-book.jiahongw.com/book/2026-07-03/");
    expect(html).toContain("<h2>推荐语</h2>");
    expect(html).toContain("<blockquote><p>");
  });
});

describe("markdownToHtml", () => {
  it("should convert simple markdown blocks", () => {
    const html = markdownToHtml(
      "## 推荐语\n\n第一段\n\n- 书名：岛上书店\n- 作者：泽文\n\n> 没有谁是一座孤岛"
    );
    expect(html).toContain("<h2>推荐语</h2>");
    expect(html).toContain("<p>第一段</p>");
    expect(html).toContain("<ul><li>书名：岛上书店</li><li>作者：泽文</li></ul>");
    expect(html).toContain("<blockquote><p>没有谁是一座孤岛</p></blockquote>");
  });
});
