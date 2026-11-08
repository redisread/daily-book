import assert from "node:assert/strict";
import { appendFileSync, cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { buildPreflight, readReleaseTarget } from "./production-release-preflight.mjs";

const script = fileURLToPath(new URL("./production-release-preflight.mjs", import.meta.url));
const appRoot = path.resolve(path.dirname(script), "..");
const target = readReleaseTarget();
const disabled = spawnSync(process.execPath, [script, "--verify-disabled"], { encoding: "utf8" });
if (target.deploymentEnabled === false) {
  assert.equal(disabled.status, 0, disabled.stderr);
  assert.match(disabled.stdout, /DISABLED_AS_DESIGNED/);
  assert.match(disabled.stdout, /"databaseOpened": false/);
  assert.match(disabled.stdout, /"remoteOperationEnabled": false/);
} else {
  assert.equal(disabled.status, 1);
  assert.match(disabled.stdout, /UNEXPECTEDLY_ENABLED/);
}

const defaultPolicy = buildPreflight({
  target: {
    ...target,
    deploymentEnabled: false,
    migrationApplyEnabled: false,
    historyImportEnabled: false,
    accountId: null,
    databaseId: null,
    schemaReceiptSha256: null,
    historyImportReceiptSha256: null,
  },
});
assert.equal(defaultPolicy.status, "DISABLED_AS_DESIGNED");
assert.equal(defaultPolicy.targetDeploymentEnabled, false);
assert.equal(defaultPolicy.databaseOpened, false);
assert.equal(defaultPolicy.networkUsed, false);

const unauthorized = spawnSync(process.execPath, [script, "--apply"], { encoding: "utf8" });
assert.equal(unauthorized.status, 1);
assert.match(unauthorized.stderr, /no apply, remote, reset, or force operation/);

const testTarget = {
  ...target,
  deploymentEnabled: true,
  accountId: "1234567890abcdef1234567890abcdef",
  databaseId: "12345678-1234-4234-8234-123456789012",
  schemaReceiptSha256: "b".repeat(64),
  historyImportReceiptSha256: "c".repeat(64),
};
assert.equal(Object.hasOwn(testTarget, "releaseCommit"), false);
const candidateSha = "a".repeat(40);
const ready = buildPreflight({
  target: testTarget,
  requireEnabled: true,
  commitSha: candidateSha,
  environment: {
    accountId: testTarget.accountId,
    databaseId: testTarget.databaseId,
    releaseCommit: candidateSha,
  },
  migrationsDirectory: path.join(appRoot, "migrations"),
});
assert.equal(ready.status, "READY_FOR_SEPARATE_AUTHORIZATION");
assert.equal(ready.targetDeploymentEnabled, true);
assert.equal(ready.selectedTarget.releaseCommit, candidateSha);
assert.equal(ready.databaseOpened, false);
assert.equal(ready.networkUsed, false);
assert.equal(ready.deploymentEnabled, false);
assert.equal(ready.migrationApplyEnabled, false);
assert.equal(ready.historyImportEnabled, false);
assert.equal(ready.remoteOperationEnabled, false);

const wrongAccount = buildPreflight({
  target: testTarget,
  commitSha: candidateSha,
  environment: { accountId: "ffffffffffffffffffffffffffffffff", databaseId: testTarget.databaseId, releaseCommit: candidateSha },
});
assert(wrongAccount.errors.some(({ code }) => code === "ACCOUNT_ID_MISMATCH"));

const wrongCommit = buildPreflight({
  target: testTarget,
  commitSha: "b".repeat(40),
  environment: { releaseCommit: candidateSha },
});
assert(wrongCommit.errors.some(({ code }) => code === "APPROVED_COMMIT_MISMATCH"));

const wrongMigration = buildPreflight({
  target: { ...testTarget, migrations: [{ ...testTarget.migrations[0], sha256: "0".repeat(64) }, ...testTarget.migrations.slice(1)] },
  commitSha: candidateSha,
  environment: { releaseCommit: candidateSha },
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

const damagedCheckout = mkdtempSync(path.join(tmpdir(), "reader-release-disabled-pin-"));
try {
  const damagedMigrations = path.join(damagedCheckout, "migrations");
  cpSync(path.join(appRoot, "migrations"), damagedMigrations, { recursive: true });
  appendFileSync(path.join(damagedMigrations, "0003_management_rate_limits.sql"), "\n-- pin regression fixture\n");
  const damaged = spawnSync(process.execPath, [script, "--verify-disabled", "--migrations-dir", damagedMigrations], { encoding: "utf8" });
  assert.equal(damaged.status, 1, `${damaged.stdout}\n${damaged.stderr}`);
  assert.match(damaged.stdout, /MIGRATION_PIN_MISMATCH/);
  assert.doesNotMatch(damaged.stdout, /DISABLED_AS_DESIGNED/);
} finally {
  rmSync(damagedCheckout, { recursive: true, force: true });
}

const unprovisioned = buildPreflight({ target, requireEnabled: true });
assert.equal(unprovisioned.status, "BLOCKED");
assert(unprovisioned.errors.some(({ code }) => code === "DEPLOYMENT_DISABLED"));
assert.equal(unprovisioned.selectedTarget.accountId, null);
assert.equal(unprovisioned.selectedTarget.databaseId, null);
assert.equal(unprovisioned.selectedTarget.releaseCommit, null);
assert(unprovisioned.errors.some(({ code }) => code === "SCHEMA_RECEIPT_MISSING"));
assert(unprovisioned.errors.some(({ code }) => code === "IMPORT_RECEIPT_MISSING"));

process.stdout.write("PASS release preflight: disabled policy, synthetic approved candidate, pin/schema failures, and no remote path\n");
