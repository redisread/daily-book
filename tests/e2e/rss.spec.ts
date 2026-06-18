import { test, expect } from "@playwright/test";

test.describe("RSS feed", () => {
  test("rss.xml is reachable and well-formed", async ({ request }) => {
    const res = await request.get("/rss.xml");
    expect(res.status()).toBe(200);
    const xml = await res.text();
    // 基础结构
    expect(xml).toMatch(/<rss[^>]*version="2\.0"/);
    expect(xml).toContain("<channel>");
    expect(xml).toContain("<title>每日一书 · Daily Book</title>");
    expect(xml).toContain("<item>");
  });

  test("books.json endpoint returns book array", async ({ request }) => {
    const res = await request.get("/books.json");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
    expect(body[0]).toHaveProperty("title");
    expect(body[0]).toHaveProperty("author");
  });
});
