import { defineConfig } from "vite";
import vinext from "vinext";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig(({ mode }) => ({
  // vinext otherwise enables Vite's ancestor-scanning native tsconfig resolver.
  resolve: { tsconfigPaths: false },
  plugins: [
    vinext(),
    cloudflare({
      viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
      persistState: { path: mode === "reader-admin-write-test" ? ".cloudflare/management-state" : mode === "reader-write-test" ? ".cloudflare/write-state" : mode === "reader-issue-test" ? ".cloudflare/issue-state" : mode === "reader-race-test" ? ".cloudflare/race-state" : mode === "reader-admin-test" ? ".cloudflare/admin-state" : mode === "reader-theme-test" ? ".cloudflare/theme-state" : mode === "reader-archive-test" ? ".cloudflare/archive-state" : mode === "reader-search-test" ? ".cloudflare/search-state" : mode === "reader-rss-test" ? ".cloudflare/rss-state" : ".cloudflare/state" },
      remoteBindings: false,
      tunnel: false,
    }),
  ],
  server: { host: "127.0.0.1", strictPort: true },
  preview: { host: "127.0.0.1", strictPort: true },
}));
