import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const targetPath = path.join(appRoot, "release-target.json");
const migrationRoot = path.join(appRoot, "migrations");
const targetDefaults = {
  workerName: "daily-book-reader",
  canaryDomain: "reader.daily-book.jiahongw.com",
  databaseName: "daily-book-reader-prod",
  historicalSourceCommit: "8b991098f984a5f8870bd01741e3cb937b63d50d",
  inventorySha256: "4918f76db3da19ba122ed01073b942551ed8e64d926a5c5ee8fb2d370879b5ad",
  overlaySha256: "27f6e44aff5da93f9d3c64f087fcd8d4f748233421e35adaaa10e81880382bb8",
};
const migrationFiles = [
  "0001_initial.sql",
  "0002_management_writes.sql",
  "0003_management_rate_limits.sql",
];

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function readReleaseTarget() {
  return JSON.parse(readFileSync(targetPath, "utf8"));
}

export function buildPreflight({
  target,
  commitSha,
  inventoryPath,
  overlayPath,
  environment = {},
  requireEnabled = false,
  requireInventory = false,
  requireOverlay = false,
  migrationsDirectory = migrationRoot,
}) {
  const errors = [];
  const add = (code, message) => errors.push({ code, message });

  if (target?.schemaVersion !== 1) add("TARGET_SCHEMA_UNSUPPORTED", "release-target.json must use schemaVersion 1");
  for (const key of Object.keys(targetDefaults)) {
    if (target?.[key] !== targetDefaults[key]) add("TARGET_PIN_MISMATCH", `${key} differs from the reviewed release pin`);
  }
  if (!Array.isArray(target?.migrations) || target.migrations.length !== migrationFiles.length) {
    add("MIGRATION_SET_MISMATCH", "release target must pin exactly migrations 0001 through 0003");
  }
  for (const [index, file] of migrationFiles.entries()) {
    const pin = target?.migrations?.[index];
    if (!pin || pin.file !== file) {
      add("MIGRATION_ORDER_MISMATCH", `expected migration ${file} at position ${index + 1}`);
      continue;
    }
    try {
      const actual = sha256(readFileSync(path.join(migrationsDirectory, file)));
      if (pin.sha256 !== actual) add("MIGRATION_PIN_MISMATCH", `${file} does not match its committed SHA256`);
    } catch {
      add("MIGRATION_FILE_MISSING", `${file} could not be read`);
    }
  }

  if (target?.accountId !== null && !/^[0-9a-f]{32}$/.test(target.accountId ?? "")) {
    add("ACCOUNT_ID_INVALID", "accountId must be a full 32-character lowercase hexadecimal ID");
  }
  if (target?.databaseId !== null && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(target.databaseId ?? "")) {
    add("DATABASE_ID_INVALID", "databaseId must be a UUID");
  }
  if (target?.releaseCommit !== null && !/^[0-9a-f]{40}$/.test(target.releaseCommit ?? "")) {
    add("RELEASE_COMMIT_INVALID", "releaseCommit must be a full 40-character lowercase commit SHA");
  }
  if (!/^[0-9a-f]{64}$/.test(target?.inventorySha256 ?? "")) add("INVENTORY_PIN_INVALID", "inventory SHA256 pin is invalid");
  if (!/^[0-9a-f]{64}$/.test(target?.overlaySha256 ?? "")) add("OVERLAY_PIN_INVALID", "overlay SHA256 pin is invalid");
  if (target?.releaseCommit && commitSha && target.releaseCommit !== commitSha) {
    add("RELEASE_COMMIT_MISMATCH", "requested commit differs from the committed release pin");
  }
  if (commitSha && !/^[0-9a-f]{40}$/.test(commitSha)) {
    add("REQUESTED_COMMIT_INVALID", "requested commit must be a full 40-character lowercase commit SHA");
  }
  if (target?.accountId && environment.accountId !== target.accountId) {
    add("ACCOUNT_ID_MISMATCH", "protected account value differs from the committed target");
  }
  if (target?.databaseId && environment.databaseId !== target.databaseId) {
    add("DATABASE_ID_MISMATCH", "protected D1 value differs from the committed target");
  }
  if (target?.releaseCommit && environment.releaseCommit !== target.releaseCommit) {
    add("ENV_COMMIT_MISMATCH", "protected release commit differs from the committed target");
  }
  if (requireEnabled && target?.deploymentEnabled !== true) {
    add("DEPLOYMENT_DISABLED", "production deployment is disabled in the committed release target");
  }
  if (target?.deploymentEnabled === true && (!target.accountId || !target.databaseId || !target.releaseCommit)) {
    add("TARGET_UNPINNED", "enabled target requires account, D1, and commit pins");
  }
  if (requireEnabled && !/^[0-9a-f]{64}$/.test(target?.schemaReceiptSha256 ?? "")) {
    add("SCHEMA_RECEIPT_MISSING", "a verified production migration receipt SHA256 is required before deploy");
  }
  if (requireEnabled && !/^[0-9a-f]{64}$/.test(target?.historyImportReceiptSha256 ?? "")) {
    add("IMPORT_RECEIPT_MISSING", "a verified production import receipt SHA256 is required before deploy");
  }
  if (target?.migrationApplyEnabled !== false || target?.historyImportEnabled !== false) {
    add("DATA_OPERATIONS_DISABLED", "production migration and import execution are not enabled by this preflight");
  }

  let inventoryChecked = false;
  if (inventoryPath) {
    try {
      const actual = sha256(readFileSync(inventoryPath));
      inventoryChecked = actual === target?.inventorySha256;
      if (!inventoryChecked) add("INVENTORY_PIN_MISMATCH", "inventory file does not match the reviewed SHA256");
    } catch {
      add("INVENTORY_FILE_MISSING", "inventory file could not be read");
    }
  } else if (requireInventory) {
    add("INVENTORY_REQUIRED", "a pinned inventory file is required for an import plan");
  }

  let overlayChecked = false;
  if (overlayPath) {
    try {
      const actual = sha256(readFileSync(overlayPath));
      overlayChecked = actual === target?.overlaySha256;
      if (!overlayChecked) add("OVERLAY_PIN_MISMATCH", "overlay file does not match the reviewed SHA256");
    } catch {
      add("OVERLAY_FILE_MISSING", "overlay file could not be read");
    }
  } else if (requireOverlay) {
    add("OVERLAY_REQUIRED", "a pinned overlay file is required for an import plan");
  }

  return {
    status: errors.length === 0 ? "READY_FOR_SEPARATE_AUTHORIZATION" : "BLOCKED",
    errors,
    selectedTarget: target && {
      workerName: target.workerName,
      canaryDomain: target.canaryDomain,
      databaseName: target.databaseName,
      accountId: target.accountId,
      databaseId: target.databaseId,
      releaseCommit: target.releaseCommit,
      schemaReceiptSha256: target.schemaReceiptSha256,
      historyImportReceiptSha256: target.historyImportReceiptSha256,
    },
    sourceCommit: target?.historicalSourceCommit,
    inventorySha256: target?.inventorySha256,
    overlaySha256: target?.overlaySha256,
    migrationPins: target?.migrations,
    inventoryChecked,
    overlayChecked,
    databaseOpened: false,
    networkUsed: false,
    deploymentEnabled: false,
    migrationApplyEnabled: false,
    historyImportEnabled: false,
    remoteOperationEnabled: false,
  };
}

function parseArgs(argv) {
  const result = { verifyDisabled: false, requireEnabled: false, requireInventory: false, requireOverlay: false };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === "--verify-disabled") result.verifyDisabled = true;
    else if (flag === "--require-enabled") result.requireEnabled = true;
    else if (flag === "--require-inventory") result.requireInventory = true;
    else if (flag === "--require-overlay") result.requireOverlay = true;
    else if (flag === "--commit-sha" || flag === "--inventory" || flag === "--overlay") {
      const value = argv[++i];
      if (!value) throw new Error(`${flag} requires a value`);
      result[flag === "--commit-sha" ? "commitSha" : flag === "--inventory" ? "inventoryPath" : "overlayPath"] = value;
    } else if (flag === "--help") result.help = true;
    else throw new Error(`unsupported flag ${flag}; this tool has no apply, remote, reset, or force operation`);
  }
  if (result.verifyDisabled && (result.commitSha || result.inventoryPath || result.overlayPath || result.requireEnabled || result.requireInventory || result.requireOverlay)) {
    throw new Error("--verify-disabled cannot be combined with release-target inputs");
  }
  return result;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write("Read-only release preflight. Options: --verify-disabled, --commit-sha SHA, --inventory PATH, --overlay PATH, --require-enabled, --require-inventory, --require-overlay. No remote/apply operation exists.\n");
    return;
  }
  const target = readReleaseTarget();
  const plan = buildPreflight({
    target,
    commitSha: args.commitSha,
    inventoryPath: args.inventoryPath,
    overlayPath: args.overlayPath,
    requireEnabled: args.requireEnabled,
    requireInventory: args.requireInventory,
    requireOverlay: args.requireOverlay,
    environment: {
      accountId: process.env.READER_RELEASE_ACCOUNT_ID,
      databaseId: process.env.READER_RELEASE_DATABASE_ID,
      releaseCommit: process.env.READER_RELEASE_COMMIT_SHA,
    },
  });
  if (args.verifyDisabled) {
    const isExpectedDisabledState = target.deploymentEnabled === false
      && target.migrationApplyEnabled === false
      && target.historyImportEnabled === false
      && target.accountId === null
      && target.databaseId === null
      && target.releaseCommit === null
      && target.schemaReceiptSha256 === null
      && target.historyImportReceiptSha256 === null;
    if (!isExpectedDisabledState) {
      process.stdout.write(`${JSON.stringify({ ...plan, status: "UNEXPECTEDLY_ENABLED" }, null, 2)}\n`);
      process.exitCode = 1;
      return;
    }
    process.stdout.write(`${JSON.stringify({ ...plan, status: "DISABLED_AS_DESIGNED" }, null, 2)}\n`);
    return;
  }
  process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
  if (plan.status === "BLOCKED") process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
