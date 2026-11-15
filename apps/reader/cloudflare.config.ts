import { bindings, defineConfig, defineWorker } from "cf/config";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Local slices stay isolated. Production mode is fail-closed until the committed target is explicitly enabled and pinned.
type ReleaseTarget = {
  accountId: string | null;
  canaryDomain: string;
  databaseId: string | null;
  databaseName: string;
  deploymentEnabled: boolean;
  schemaReceiptSha256: string | null;
  historyImportReceiptSha256: string | null;
  workerName: string;
};

function readReleaseTarget(): ReleaseTarget {
  return JSON.parse(
    readFileSync(fileURLToPath(new URL("./release-target.json", import.meta.url)), "utf8"),
  ) as ReleaseTarget;
}

function productionTarget(mode: string | undefined): ReleaseTarget | undefined {
  if (mode !== "reader-production") return undefined;

  const target = readReleaseTarget();
  const expected = {
    accountId: process.env.READER_RELEASE_ACCOUNT_ID,
    databaseId: process.env.READER_RELEASE_DATABASE_ID,
  };
  const approvedCandidate = process.env.READER_RELEASE_COMMIT_SHA;
  const requestedCandidate = process.env.READER_RELEASE_CANDIDATE_SHA;
  if (!target.deploymentEnabled) {
    throw new Error("READER_RELEASE_DISABLED: production deploy is disabled in release-target.json");
  }
  if (!target.accountId || !target.databaseId) {
    throw new Error("READER_RELEASE_TARGET_UNPINNED: account and database pins are required");
  }
  if (!/^[0-9a-f]{64}$/.test(target.schemaReceiptSha256 ?? "") || !/^[0-9a-f]{64}$/.test(target.historyImportReceiptSha256 ?? "")) {
    throw new Error("READER_RELEASE_RECEIPTS_MISSING: verified schema and import receipts are required before deploy");
  }
  if (Object.entries(expected).some(([key, value]) => value !== target[key as keyof typeof expected])) {
    throw new Error("READER_RELEASE_TARGET_MISMATCH: protected environment values do not match the committed target");
  }
  if (!/^[0-9a-f]{32}$/.test(target.accountId) || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(target.databaseId)) {
    throw new Error("READER_RELEASE_TARGET_INVALID: account or D1 ID has an invalid format");
  }
  if (!/^[0-9a-f]{40}$/.test(requestedCandidate ?? "") || approvedCandidate !== requestedCandidate) {
    throw new Error("READER_RELEASE_COMMIT_MISMATCH: candidate does not match the protected external approval record");
  }
  return target;
}

const localWorkerNames: Record<string, string> = {
  "reader-write-test": "daily-book-reader-write-local",
  "reader-admin-write-test": "daily-book-reader-admin-write-local",
  "reader-issue-test": "daily-book-reader-issue-local",
  "reader-race-test": "daily-book-reader-race-local",
  "reader-admin-test": "daily-book-reader-admin-local",
  "reader-theme-test": "daily-book-reader-theme-local",
  "reader-archive-test": "daily-book-reader-archive-local",
  "reader-search-test": "daily-book-reader-search-local",
  "reader-rss-test": "daily-book-reader-rss-local",
};

const localDatabaseIds: Record<string, string> = {
  "reader-admin-write-test": "00000000-0000-4000-8000-000000000072",
  "reader-write-test": "00000000-0000-4000-8000-000000000070",
  "reader-issue-test": "00000000-0000-4000-8000-000000000071",
  "reader-race-test": "00000000-0000-4000-8000-000000000053",
  "reader-admin-test": "00000000-0000-4000-8000-000000000057",
  "reader-theme-test": "00000000-0000-4000-8000-000000000058",
  "reader-archive-test": "00000000-0000-4000-8000-000000000061",
  "reader-search-test": "00000000-0000-4000-8000-000000000063",
  "reader-rss-test": "00000000-0000-4000-8000-000000000064",
};

const localDatabaseNames: Record<string, string> = {
  "reader-admin-write-test": "daily-book-reader-admin-write-local-only",
  "reader-write-test": "daily-book-reader-write-local-only",
  "reader-issue-test": "daily-book-reader-issue-local-only",
  "reader-race-test": "daily-book-reader-race-local-only",
  "reader-admin-test": "daily-book-reader-admin-local-only",
  "reader-theme-test": "daily-book-reader-theme-local-only",
  "reader-archive-test": "daily-book-reader-archive-local-only",
  "reader-search-test": "daily-book-reader-search-local-only",
  "reader-rss-test": "daily-book-reader-rss-local-only",
};

export default defineConfig(({ mode }) => {
  const release = productionTarget(mode);
  const workerMode = mode ?? "";
  return {
    ...(release ? { accountId: release.accountId! } : {}),
    worker: defineWorker(() => ({
      name: release?.workerName ?? localWorkerNames[workerMode] ?? "daily-book-reader-local",
      entrypoint: mode === "reader-write-test" ? "./fixtures/write-worker.ts" : mode === "reader-race-test" ? "./fixtures/race-worker.ts" : "./worker.ts",
      compatibilityDate: "2026-11-07",
      compatibilityFlags: ["nodejs_compat"],
      ...(release ? { domains: [release.canaryDomain], workersDev: false, previewUrls: false } : {}),
      assets: {
        htmlHandling: "none", notFoundHandling: "none",
        runWorkerFirst: ["/*", "!/_next/static/*", "!/*/_next/static/*"],
      },
      observability: { enabled: true, logs: { enabled: true }, traces: { enabled: true } },
      env: {
        ASSETS: bindings.assets(),
        CONTENT_API_KEY: bindings.secret(),
        DB: bindings.d1(release
          ? { id: release.databaseId!, name: release.databaseName }
          : {
              id: localDatabaseIds[workerMode] ?? "00000000-0000-4000-8000-000000000049",
              name: localDatabaseNames[workerMode] ?? "daily-book-reader-local-only",
              dev: { remote: false },
            }),
      },
    })),
  };
});
