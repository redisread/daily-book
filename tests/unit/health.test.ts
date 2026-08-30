import { describe, expect, it } from "vitest";
import { createHealthResponse } from "../../src/pages/health.json";

describe("health endpoint", () => {
  it("reports the Cloudflare runtime without caching the response", async () => {
    const response = createHealthResponse(
      new Request("https://daily-book.example/health.json", {
        headers: { "cf-ray": "test-ray" },
      }),
      new Date("2026-08-30T12:00:00.000Z"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      status: "healthy",
      service: "daily-book",
      runtime: "cloudflare-workers",
      timestamp: "2026-08-30T12:00:00.000Z",
      requestId: "test-ray",
    });
  });
});
