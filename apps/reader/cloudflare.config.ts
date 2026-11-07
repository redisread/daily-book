import { bindings, defineConfig, defineWorker } from "cf/config";

// Local read slice only. Do not attach production resources or deploy this config.
export default defineConfig({
  worker: defineWorker(({ mode }) => ({
    name: mode === "reader-race-test" ? "daily-book-reader-race-local" : mode === "reader-admin-test" ? "daily-book-reader-admin-local" : mode === "reader-theme-test" ? "daily-book-reader-theme-local" : mode === "reader-archive-test" ? "daily-book-reader-archive-local" : mode === "reader-search-test" ? "daily-book-reader-search-local" : mode === "reader-rss-test" ? "daily-book-reader-rss-local" : "daily-book-reader-local",
    entrypoint: mode === "reader-race-test" ? "./fixtures/race-worker.ts" : "./worker.ts",
    compatibilityDate: "2026-11-07",
    compatibilityFlags: ["nodejs_compat"],
    assets: {
      htmlHandling: "none", notFoundHandling: "none",
      runWorkerFirst: ["/*", "!/_next/static/*", "!/*/_next/static/*"],
    },
    observability: { enabled: true, logs: { enabled: true }, traces: { enabled: true } },
    env: {
      ASSETS: bindings.assets(),
      CONTENT_API_KEY: bindings.secret(),
      DB: bindings.d1({
        id: mode === "reader-race-test" ? "00000000-0000-4000-8000-000000000053" : mode === "reader-admin-test" ? "00000000-0000-4000-8000-000000000057" : mode === "reader-theme-test" ? "00000000-0000-4000-8000-000000000058" : mode === "reader-archive-test" ? "00000000-0000-4000-8000-000000000061" : mode === "reader-search-test" ? "00000000-0000-4000-8000-000000000063" : mode === "reader-rss-test" ? "00000000-0000-4000-8000-000000000064" : "00000000-0000-4000-8000-000000000049",
        name: mode === "reader-race-test" ? "daily-book-reader-race-local-only" : mode === "reader-admin-test" ? "daily-book-reader-admin-local-only" : mode === "reader-theme-test" ? "daily-book-reader-theme-local-only" : mode === "reader-archive-test" ? "daily-book-reader-archive-local-only" : mode === "reader-search-test" ? "daily-book-reader-search-local-only" : mode === "reader-rss-test" ? "daily-book-reader-rss-local-only" : "daily-book-reader-local-only",
        dev: { remote: false },
      }),
    },
  })),
});
