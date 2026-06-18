import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  // 失败时重试一次（CI 偶发抖动）
  retries: process.env.CI ? 1 : 0,
  // CI 上不并行（避免端口/抖动），本地默认并行
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  use: {
    baseURL: "http://localhost:4321",
    trace: "on-first-retry",
  },
  // 自动启动 dev server，CI 也能直接 npm run test:e2e
  webServer: {
    command: "npm run build && npx astro preview --host 0.0.0.0 --port 4321",
    url: "http://localhost:4321",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
