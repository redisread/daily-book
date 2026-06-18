import { test, expect } from "@playwright/test";

test.describe("Archive page", () => {
  test("renders archive grid", async ({ page }) => {
    await page.goto("/archive");
    await expect(page.locator('.nav-btn[data-nav="archive"]')).toHaveClass(/active/);
    // archive 至少有一个书籍链接
    await expect(page.locator('a[href^="/book/"]').first()).toBeVisible();
  });

  test("can navigate to a book detail page", async ({ page }) => {
    await page.goto("/archive");
    const firstBookLink = page.locator('a[href^="/book/"]').first();
    const href = await firstBookLink.getAttribute("href");
    expect(href).toMatch(/^\/book\/\d{4}-\d{2}-\d{2}/);
    await firstBookLink.click();
    await page.waitForURL(/\/book\/\d{4}-\d{2}-\d{2}/);
    // 详情页有 Book JSON-LD（在 page HTML 里检查，filter hasText 对 script 不可靠）
    const html = await page.content();
    expect(html).toContain('"@type":"Book"');
  });
});
