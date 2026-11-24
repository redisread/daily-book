import { defineConfig } from "vite";
import vinext from "vinext";
import { cloudflare } from "@cloudflare/vite-plugin";

const localStates: Record<string, string> = {
  "reader-library-preview": ".cloudflare/library-preview",
  "reader-admin-write-test": ".cloudflare/management-state",
  "reader-write-test": ".cloudflare/write-state",
  "reader-issue-test": ".cloudflare/issue-state",
  "reader-race-test": ".cloudflare/race-state",
  "reader-admin-test": ".cloudflare/admin-state",
  "reader-theme-test": ".cloudflare/theme-state",
  "reader-archive-test": ".cloudflare/archive-state",
  "reader-search-test": ".cloudflare/search-state",
  "reader-rss-test": ".cloudflare/rss-state",
};

export default defineConfig(({ mode }) => ({
  // vinext otherwise enables Vite's ancestor-scanning native tsconfig resolver.
  resolve: { tsconfigPaths: false },
  plugins: [
    vinext(),
    cloudflare({
      viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
      persistState: {
        path: mode === "reader-library-test" ? process.env.READER_LIBRARY_TEST_STATE ?? ".cloudflare/library-state"
          : localStates[mode] ?? ".cloudflare/state",
      },
      remoteBindings: false,
      tunnel: false,
    }),
  ],
  server: { host: "127.0.0.1", strictPort: true },
  preview: { host: "127.0.0.1", strictPort: true },
}));
