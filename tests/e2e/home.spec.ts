import { test, expect } from "@playwright/test";

test.describe("Homepage", () => {
  test("renders today's book recommendation", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/每日一书/);
    // 主标题 logo
    await expect(page.locator(".logo-text")).toHaveText("每日一书");
    // 今日推荐导航高亮
    await expect(page.locator('.nav-btn[data-nav="home"]')).toHaveClass(/active/);
    // 至少渲染了书籍卡和金句卡
    await expect(page.locator(".book-cover").first()).toBeVisible();
  });

  test("contains JSON-LD structured data", async ({ page }) => {
    await page.goto("/");
    const ldScripts = page.locator('script[type="application/ld+json"]');
    await expect(ldScripts.first()).toBeAttached();
    const websiteJson = await ldScripts.first().textContent();
    expect(websiteJson).toContain('"@type":"WebSite"');
  });

  test("uses og-image.png for social sharing", async ({ page }) => {
    await page.goto("/");
    const ogImage = page.locator('meta[property="og:image"]');
    await expect(ogImage).toHaveAttribute("content", /og-image\.png/);
  });
});
