import assert from "node:assert/strict";
import { test } from "node:test";
import { acquireLock, promoteCandidate, releaseLock } from "./workers-builds-promotion.mjs";

const old = { sha: "a".repeat(40), execution: "build-A:attempt-1", version: "version-A" };
const fresh = { sha: "b".repeat(40), execution: "build-B:attempt-1", version: "version-B" };
const noWait = { retries: 0 };

function memoryStore() {
  let state = null;
  let revision = 0;
  return {
    read: async () => state,
    async write(next, expected) {
      if (expected !== state?.etag) return null;
      state = { ...next, etag: `"revision-${++revision}"` };
      return state.etag;
    },
  };
}

function production(store, { afterDeploy, duringSmoke } = {}) {
  const receipts = [];
  const writes = [];
  let active = "previously-verified";
  return {
    receipts,
    writes,
    currentMain: async () => fresh.sha,
    currentVersion: async () => active,
    acquire: (owner) => acquireLock(store, owner, noWait),
    release: (owner, etag) => releaseLock(store, owner, etag),
    async deploy(version) {
      active = version;
      writes.push(version);
      await afterDeploy?.(version);
    },
    verify: async (version) => {
      await duringSmoke?.(version, (other) => { active = other; });
    },
    receipt: (record) => receipts.push(record),
  };
}

test("B becomes live before slower A finishes, and a retry of A cannot deploy", async () => {
  const store = memoryStore();
  const live = production(store);
  await promoteCandidate(fresh, live);
  await promoteCandidate(old, live);
  await promoteCandidate({ ...old, execution: "build-A:attempt-2" }, live);

  assert.equal(await live.currentVersion(), fresh.version);
  assert.deepEqual(live.writes, [fresh.version]);
  assert.deepEqual(live.receipts.filter(({ finalVersion }) => finalVersion).map(({ sha, version, outcome, finalVersion }) =>
    [sha, version, outcome, finalVersion]), [
    [fresh.sha, fresh.version, "live", fresh.version],
    [old.sha, old.version, "superseded", fresh.version],
    [old.sha, old.version, "superseded", fresh.version],
  ]);
});

test("lost lock-write responses can be confirmed from the exact owner and ETag", async () => {
  const store = memoryStore();
  const loseResponses = {
    ...store,
    async write(...args) {
      await store.write(...args);
      throw new Error("response lost");
    },
  };

  const etag = await acquireLock(loseResponses, old, noWait);
  assert.equal(etag, (await store.read()).etag);
  await assert.rejects(acquireLock(store, fresh, noWait), /another execution/);
  await releaseLock(loseResponses, old, etag);
  assert.equal((await store.read()).owner, null);
});

test("concurrent acquisition has one owner and stale release cannot clear its successor", async () => {
  const store = memoryStore();
  const outcomes = await Promise.allSettled([
    acquireLock(store, old, noWait),
    acquireLock(store, fresh, noWait),
  ]);
  assert.equal(outcomes.filter(({ status }) => status === "fulfilled").length, 1);
  const first = await store.read();
  const successor = first.owner === old ? fresh : old;
  await releaseLock(store, first.owner, first.etag);
  await acquireLock(store, successor, noWait);
  await assert.rejects(releaseLock(store, first.owner, first.etag), /not confirmed/);
  assert.deepEqual((await store.read()).owner, successor);
});

test("promotion interrupted after write retains the lock for operator reconciliation", async () => {
  const store = memoryStore();
  const live = production(store, {
    afterDeploy: () => { throw new Error("deployment acknowledgement lost"); },
  });
  await assert.rejects(promoteCandidate(fresh, live), /acknowledgement lost/);
  assert.equal(await live.currentVersion(), fresh.version);
  assert.deepEqual((await store.read()).owner, fresh);
  assert.equal(live.receipts.at(-1).outcome, "lock-retained");
  await assert.rejects(promoteCandidate(old, live), /another execution/);
});

test("failed smoke restores the previous version and releases the lock after verification", async () => {
  const store = memoryStore();
  const live = production(store, {
    duringSmoke(version) {
      if (version === fresh.version) throw new Error("production smoke failure");
    },
  });
  await assert.rejects(promoteCandidate(fresh, live), /previous Reader version restored/);
  assert.deepEqual(live.writes, [fresh.version, "previously-verified"]);
  assert.equal(live.receipts.at(-1).outcome, "rolled-back");
  assert.equal((await store.read()).owner, null);
});

test("a newer live version observed after failure is never rolled back", async () => {
  const store = memoryStore();
  const live = production(store, {
    duringSmoke(_version, replace) {
      replace("newer-production-version");
      throw new Error("production smoke failure");
    },
  });
  await assert.rejects(promoteCandidate(fresh, live), /changed after promotion/);
  assert.deepEqual(live.writes, [fresh.version]);
  assert.equal(await live.currentVersion(), "newer-production-version");
  assert.deepEqual((await store.read()).owner, fresh);
});

test("a new main commit seen immediately before promotion supersedes the locked candidate", async () => {
  const store = memoryStore();
  const live = production(store);
  const mainReads = [fresh.sha, "c".repeat(40)];
  await promoteCandidate(fresh, { ...live, currentMain: async () => mainReads.shift() });
  assert.deepEqual(live.writes, []);
  assert.equal(live.receipts.at(-1).outcome, "superseded");
  assert.equal((await store.read()).owner, null);
});
