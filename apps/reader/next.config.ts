import type { NextConfig } from "next";
export default {
  typescript: { tsconfigPath: "./tsconfig.json" },
  async headers() {
    return ["/", "/issues/:path*", "/api/v1/:path*"].map((source) => ({ source, headers: [{ key: "Cache-Control", value: "no-store" }] }));
  },
} satisfies NextConfig;
