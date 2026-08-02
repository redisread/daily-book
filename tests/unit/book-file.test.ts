import { describe, expect, it } from "vitest";
import { parseBookFile } from "../../src/data/book-file";

const raw = `---
id: fixture-book
title: 测试书
author: 测试作者
category: 测试分类
year: 2026
pages: 200
rating: 8.5
desc: 测试简介
coverTitle: 测试书
coverAuthor: 测试作者
publishedDate: null
quotes:
  - text: 测试金句
    page: 第一章
---

## 推荐语

正文内容
`;

describe("parseBookFile", () => {
  it("should parse frontmatter and keep body", () => {
    const { book, body } = parseBookFile(raw, "fixture-book.md");
    expect(book.id).toBe("fixture-book");
    expect(book.title).toBe("测试书");
    expect(book.publishedDate).toBeNull();
    expect(body).toContain("## 推荐语");
  });

  it("should reject filename and id mismatch", () => {
    expect(() => parseBookFile(raw, "wrong-name.md")).toThrow("文件名与 id 不一致");
  });

  it("should reject file without frontmatter", () => {
    expect(() => parseBookFile("plain text", "fixture-book.md")).toThrow("缺少 frontmatter");
  });
});
