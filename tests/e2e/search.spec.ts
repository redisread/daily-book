import { test, expect } from "@playwright/test";

test.describe("Search page", () => {
  test("renders search input and skeleton on load", async ({ page }) => {
    await page.goto("/search");
    await expect(page.locator("#searchInput")).toBeVisible();
    await expect(page.locator("#searchBtn")).toBeVisible();
    // 搜索导航高亮
    await expect(page.locator('.nav-btn[data-nav="search"]')).toHaveClass(/active/);
  });

  test("searches by title", async ({ page }) => {
    await page.goto("/search");
    const input = page.locator("#searchInput");
    await input.fill("人类简史");
    await page.locator("#searchBtn").click();
    // 等结果计数文案变化（"加载中..." → "找到 N 个" 或 "没有找到..."）
    const resultsCount = page.locator("#resultsCount");
    await expect(resultsCount).not.toHaveText("加载中...", { timeout: 5000 });
    // 结果区已渲染，至少有 a.book-card 或空状态文本
    const content = await page.content();
    expect(content).toContain("人类简史");
  });
});
