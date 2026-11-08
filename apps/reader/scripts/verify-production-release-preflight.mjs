import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { buildPreflight, readReleaseTarget } from "./production-release-preflight.mjs";

const script = fileURLToPath(new URL("./production-release-preflight.mjs", import.meta.url));
const appRoot = path.resolve(path.dirname(script), "..");
const target = readReleaseTarget();
const disabled = spawnSync(process.execPath, [script, "--verify-disabled"], { encoding: "utf8" });
assert.equal(disabled.status, 0, disabled.stderr);
assert.match(disabled.stdout, /DISABLED_AS_DESIGNED/);
assert.match(disabled.stdout, /"databaseOpened": false/);
assert.match(disabled.stdout, /"remoteOperationEnabled": false/);

const unauthorized = spawnSync(process.execPath, [script, "--apply"], { encoding: "utf8" });
assert.equal(unauthorized.status, 1);
assert.match(unauthorized.stderr, /no apply, remote, reset, or force operation/);

const testTarget = {
  ...target,
  deploymentEnabled: true,
  accountId: "1234567890abcdef1234567890abcdef",
  databaseId: "12345678-1234-4234-8234-123456789012",
  releaseCommit: "a".repeat(40),
  schemaReceiptSha256: "b".repeat(64),
  historyImportReceiptSha256: "c".repeat(64),
};
const ready = buildPreflight({
  target: testTarget,
  commitSha: testTarget.releaseCommit,
  environment: {
    accountId: testTarget.accountId,
    databaseId: testTarget.databaseId,
    releaseCommit: testTarget.releaseCommit,
  },
  migrationsDirectory: path.join(appRoot, "migrations"),
});
assert.equal(ready.status, "READY_FOR_SEPARATE_AUTHORIZATION");
assert.equal(ready.databaseOpened, false);
assert.equal(ready.networkUsed, false);
assert.equal(ready.deploymentEnabled, false);
assert.equal(ready.migrationApplyEnabled, false);
assert.equal(ready.historyImportEnabled, false);
assert.equal(ready.remoteOperationEnabled, false);

const wrongAccount = buildPreflight({
  target: testTarget,
  commitSha: testTarget.releaseCommit,
  environment: { accountId: "ffffffffffffffffffffffffffffffff", databaseId: testTarget.databaseId, releaseCommit: testTarget.releaseCommit },
});
assert(wrongAccount.errors.some(({ code }) => code === "ACCOUNT_ID_MISMATCH"));

const wrongCommit = buildPreflight({ target: testTarget, commitSha: "b".repeat(40) });
assert(wrongCommit.errors.some(({ code }) => code === "RELEASE_COMMIT_MISMATCH"));

const wrongMigration = buildPreflight({
  target: { ...testTarget, migrations: [{ ...testTarget.migrations[0], sha256: "0".repeat(64) }, ...testTarget.migrations.slice(1)] },
  commitSha: testTarget.releaseCommit,
});
assert(wrongMigration.errors.some(({ code }) => code === "MIGRATION_PIN_MISMATCH"));

const temporary = mkdtempSync(path.join(tmpdir(), "reader-release-preflight-"));
try {
  const wrongOverlayPath = path.join(temporary, "overlay.json");
  writeFileSync(wrongOverlayPath, "{}\n");
  const wrongOverlay = buildPreflight({ target: testTarget, overlayPath: wrongOverlayPath });
  assert(wrongOverlay.errors.some(({ code }) => code === "OVERLAY_PIN_MISMATCH"));
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

const unprovisioned = buildPreflight({ target, requireEnabled: true });
assert.equal(unprovisioned.status, "BLOCKED");
assert(unprovisioned.errors.some(({ code }) => code === "DEPLOYMENT_DISABLED"));
assert.equal(unprovisioned.selectedTarget.accountId, null);
assert.equal(unprovisioned.selectedTarget.databaseId, null);
assert.equal(unprovisioned.selectedTarget.releaseCommit, null);
assert(unprovisioned.errors.some(({ code }) => code === "SCHEMA_RECEIPT_MISSING"));
assert(unprovisioned.errors.some(({ code }) => code === "IMPORT_RECEIPT_MISSING"));

process.stdout.write("PASS production release preflight: disabled defaults, no remote path, target/commit/migration mismatches refuse\n");
