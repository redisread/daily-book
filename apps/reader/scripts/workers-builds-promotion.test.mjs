import assert from "node:assert/strict";
import { test } from "node:test";
import { acquireLock, promoteCandidate, releaseLock } from "./workers-builds-promotion.mjs";
import { allowPropagation, selectBuild, smoke } from "./workers-builds-release.mjs";

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
    duringSmoke(version, replace) {
      if (version === fresh.version) {
        replace("newer-production-version");
        throw new Error("production smoke failure");
      }
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

function simulateReader(versions) {
  const issue = { id: "published-latest", publicationDate: "2026-08-08" };
  const detail = `/issues/${issue.id}`;
  return async (url, { headers }) => {
    assert.equal(headers["x-reader-release-check"], "1");
    const path = new URL(url).pathname;
    const deployedVersion = versions();
    const responseHeaders = { "x-reader-worker-version": deployedVersion };
    if (path === "/api/v1/issues") return Response.json({ items: [issue] }, { headers: responseHeaders });
    if (path === "/") return new Response(`<article data-issue-id="${issue.id}">`, { headers: responseHeaders });
    if (path === `/api/v1${detail}`) return Response.json({ data: issue }, { headers: responseHeaders });
    if (path === `/book/${issue.publicationDate}/`) {
      return new Response(null, { status: 307, headers: { ...responseHeaders, location: detail } });
    }
    if (path === "/rss.xml") {
      return new Response(`<link>https://daily-book.jiahongw.com${detail}</link>`, { headers: responseHeaders });
    }
    assert.equal(path, `/api/v1/admin${detail}`);
    return new Response(null, { status: 401, headers: responseHeaders });
  };
}

test("control plane B waits for HTTP to catch up from A before reporting success", async () => {
  const store = memoryStore();
  let retries = 0;
  const live = production(store, {
    async duringSmoke(version) {
      const fetchResponse = simulateReader(() => version === fresh.version && retries === 0 ? old.version : version);
      await allowPropagation(
        () => smoke("https://reader-release-rehearsal.jiahongw.com", version, {}, fetchResponse),
        async () => { retries++; },
      );
    },
  });
  await promoteCandidate(fresh, live);
  assert.equal(retries, 1);
  assert.equal(live.receipts.at(-1).outcome, "live");
});

test("a persistent HTTP version mismatch cannot report the candidate live", async () => {
  const store = memoryStore();
  const live = production(store, {
    async duringSmoke(version) {
      const fetchResponse = simulateReader(() => version === fresh.version ? old.version : version);
      await allowPropagation(
        () => smoke("https://reader-release-rehearsal.jiahongw.com", version, {}, fetchResponse),
        async () => {},
      );
    },
  });
  await assert.rejects(promoteCandidate(fresh, live), /previous Reader version restored/);
  assert.equal(await live.currentVersion(), "previously-verified");
  assert(!live.receipts.some(({ outcome }) => outcome === "live"));
});

test("rehearsal selects only its fixed isolated targets and rejects the production D1", () => {
  const target = {
    accountId: "1".repeat(32),
    databaseId: "00000000-0000-4000-8000-000000000100",
    databaseName: "daily-book-reader-prod",
    workerName: "daily-book-reader",
  };
  const databaseId = "00000000-0000-4000-8000-000000000101";
  const env = {
    WORKERS_CI: "1",
    WORKERS_CI_BRANCH: "reader-release-rehearsal",
    WORKERS_CI_COMMIT_SHA: fresh.sha,
    WORKERS_CI_BUILD_UUID: "f9f05a40-50cc-4693-bb03-9d23200d9a93",
    READER_WORKERS_REHEARSAL_ENABLED: "1",
    READER_REHEARSAL_ACCOUNT_ID: target.accountId,
    READER_REHEARSAL_DATABASE_ID: databaseId,
  };
  const result = selectBuild(true, target, env);
  assert.equal(result.workerName, "daily-book-reader-release-rehearsal");
  assert.equal(result.databaseName, "daily-book-reader-release-rehearsal");
  assert.equal(result.databaseId, databaseId);
  assert.equal(result.lockBucket, "daily-book-reader-release-rehearsal-lock");
  assert.equal(result.origin, "https://reader-release-rehearsal.jiahongw.com");

  assert.throws(() => selectBuild(true, target, { ...env, READER_REHEARSAL_DATABASE_ID: target.databaseId }),
    /must be separate from production/);
  assert.throws(() => selectBuild(false, target, env), /Expected a Workers Builds main build/);
});

test("a baseline without a verified serving version prevents a production write", async () => {
  const store = memoryStore();
  const live = production(store, {
    duringSmoke() { throw new Error("missing runtime version header"); },
  });
  await assert.rejects(promoteCandidate(fresh, live), /missing runtime version header/);
  assert.deepEqual(live.writes, []);
  assert.equal((await store.read()).owner, null);
});
