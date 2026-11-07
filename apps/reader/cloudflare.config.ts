import { bindings, defineConfig, defineWorker } from "cf/config";

// Local read slice only. Do not attach production resources or deploy this config.
export default defineConfig({
  worker: defineWorker({
    name: "daily-book-reader-local",
    entrypoint: "vinext/server/fetch-handler",
    compatibilityDate: "2026-11-07",
    compatibilityFlags: ["nodejs_compat"],
    assets: {
      htmlHandling: "none", notFoundHandling: "none",
      runWorkerFirst: ["/*", "!/_next/static/*", "!/*/_next/static/*"],
    },
    observability: { enabled: true, logs: { enabled: true }, traces: { enabled: true } },
    env: {
      ASSETS: bindings.assets(),
      DB: bindings.d1({ id: "00000000-0000-4000-8000-000000000049", name: "daily-book-reader-local-only", dev: { remote: false } }),
    },
  }),
});
