import assert from "node:assert/strict";
import { test } from "node:test";
import { publishCandidate, smoke } from "./workers-builds-release.mjs";

const candidate = { sha: "candidate-sha", version: "B" };
const prior = { id: "previous", version: "A", createdOn: 1 };
const published = { id: "published", version: "B", createdOn: 2 };
const newer = { id: "newer", version: "C", createdOn: 3 };

function fixture(overrides = {}) {
  const receipts = [];
  let live = prior;
  const operations = {
    mainSha: async () => candidate.sha,
    currentDeployment: async () => live,
    deploy: async (version) => {
      assert.equal(version, published.version);
      live = published;
      return published;
    },
    verify: async (version) => assert.equal(version, published.version),
    record: (receipt) => receipts.push(receipt),
    pause: async () => {},
    attempts: 2,
    ...overrides,
  };
  return { operations, receipts };
}

test("does not deploy a candidate superseded on main", async () => {
  const { operations, receipts } = fixture({ mainSha: async () => "newer-sha", deploy: assert.fail });
  await publishCandidate(candidate, operations);
  assert.equal(receipts.at(-1).outcome, "superseded-before-deploy");
  assert.equal(receipts.at(-1).liveVersion, "A");
});

test("retries an old serving version before confirming the requested version", async () => {
  let requests = 0;
  const { operations, receipts } = fixture({
    async verify(version) {
      if (++requests === 1) await smoke(version, async () =>
        Response.json({}, { headers: { "x-reader-worker-version": prior.version } }));
    },
  });
  await publishCandidate(candidate, operations);
  assert.equal(requests, 2);
  assert.equal(receipts.at(-1).outcome, "live");
  assert.equal(receipts.at(-1).liveVersion, "B");
});

test("records the prior version on failure and never deploys a rollback", async () => {
  const { operations, receipts } = fixture({
    verify: (version) => smoke(version, async () =>
      Response.json({}, { headers: { "x-reader-worker-version": prior.version } })),
  });
  await assert.rejects(publishCandidate(candidate, operations), /Unexpected serving Worker version/);
  assert.deepEqual(receipts.map(({ outcome }) => outcome), ["deploying", "deployed", "verification-failed"]);
  assert.equal(receipts.at(-1).previousVersion, "A");
});

test("reports that a later deployment took over during verification", async () => {
  let live = prior;
  const { operations, receipts } = fixture({
    currentDeployment: async () => live,
    deploy: async () => (live = published),
    verify: async () => { live = newer; },
  });
  await publishCandidate(candidate, operations);
  assert.equal(receipts.at(-1).outcome, "superseded-after-deploy");
  assert.equal(receipts.at(-1).liveVersion, "C");
});

test("recovers a committed deployment after a lost response without repeating the write", async () => {
  let live = prior;
  let writes = 0;
  let lookups = 0;
  const { operations, receipts } = fixture({
    currentDeployment: async () => live,
    deploy: async () => {
      writes++;
      live = published;
      throw new Error("connection lost after commit");
    },
    findDeployment: async (version) => {
      assert.equal(version, published.version);
      return ++lookups === 2 ? published : undefined;
    },
  });
  await publishCandidate(candidate, operations);
  assert.equal(writes, 1);
  assert.equal(lookups, 2);
  assert.equal(receipts[1].recovered, true);
  assert.equal(receipts.at(-1).outcome, "live");
  assert.equal(receipts.at(-1).previousVersion, "A");
});

test("keeps an unconfirmed deployment traceable without repeating the write", async () => {
  let writes = 0;
  const { operations, receipts } = fixture({
    deploy: async () => {
      writes++;
      throw new Error("outcome unclear");
    },
    findDeployment: async () => undefined,
  });
  await assert.rejects(publishCandidate(candidate, operations), /outcome is unknown/);
  assert.equal(writes, 1);
  assert.deepEqual(receipts.at(-1), { ...candidate, previousVersion: "A", outcome: "deployment-unknown" });
});
