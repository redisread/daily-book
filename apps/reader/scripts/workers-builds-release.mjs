import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { buildPreflight, readReleaseTarget } from "./production-release-preflight.mjs";

const canonicalOrigin = "https://daily-book.jiahongw.com";
const shaPattern = /^[0-9a-f]{40}$/;
const uuidPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;

function required(name) {
  const value = process.env[name];
  if (!value?.trim()) throw new Error(`${name} is required`);
  return value;
}

async function request(url, options = {}) {
  return fetch(url, {
    redirect: "manual",
    signal: AbortSignal.timeout(12000),
    ...options,
  });
}

async function currentMain() {
  const response = await request("https://api.github.com/repos/redisread/daily-book/git/ref/heads/main", {
    headers: { accept: "application/vnd.github+json", "cache-control": "no-cache" },
  });
  if (!response.ok) throw new Error(`GitHub main lookup returned HTTP ${response.status}`);
  const { ref, object } = await response.json();
  assert(ref === "refs/heads/main" && shaPattern.test(object?.sha), "Unexpected GitHub main response");
  return object.sha;
}

function cloudflare(accountId, token) {
  const account = `https://api.cloudflare.com/client/v4/accounts/${accountId}`;
  return async (path, body) => {
    const response = await request(account + path, {
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      ...(body ? { method: "POST", body: JSON.stringify(body) } : {}),
    });
    const payload = await response.json();
    if (!response.ok || payload.success !== true) {
      throw new Error(`Cloudflare request for ${path} returned HTTP ${response.status}`);
    }
    return payload.result;
  };
}

export async function smoke(expectedVersion, fetchResponse = request) {
  async function get(path, status = 200) {
    const response = await fetchResponse(canonicalOrigin + path, {
      headers: { "cache-control": "no-cache", "x-reader-release-check": "1" },
    });
    assert.equal(response.status, status, `Reader response for ${path}`);
    assert.equal(response.headers.get("x-reader-worker-version"), expectedVersion,
      `Unexpected serving Worker version for ${path}`);
    return response;
  }

  const index = await get("/api/v1/issues?limit=1");
  const { items } = await index.json();
  const latest = items?.[0];
  assert(latest && /^[a-z0-9][a-z0-9-]*$/.test(latest.id)
    && /^\d{4}-\d{2}-\d{2}$/.test(latest.publicationDate), "Reader has no latest public issue");
  const path = `/issues/${latest.id}`;
  for (const home of ["/", "/?release-check=1"]) {
    const response = await get(home);
    assert((await response.text()).includes(`data-issue-id="${latest.id}"`), "Latest issue missing from Reader home");
  }
  const detail = await get(`/api/v1${path}`);
  assert.equal((await detail.json()).data?.id, latest.id);
  const alias = await get(`/book/${latest.publicationDate}/`, 307);
  assert.equal(alias.headers.get("location"), path);
  const feed = await get("/rss.xml");
  assert((await feed.text()).includes(`<link>${canonicalOrigin}${path}</link>`), "Feed lacks its canonical latest issue");
  await get(`/api/v1/admin${path}`, 401);
}

export async function publishCandidate(candidate, {
  mainSha, currentDeployment, deploy, findDeployment, verify, record, pause = delay, attempts = 12,
}) {
  const previous = await currentDeployment();
  if (await mainSha() !== candidate.sha) {
    record({ ...candidate, outcome: "superseded-before-deploy", liveVersion: previous.version });
    return;
  }

  const previousVersion = previous.version;
  record({ ...candidate, previousVersion, outcome: "deploying" });
  let published;
  let recovered = false;
  try {
    published = await deploy(candidate.version);
    assert.equal(published.version, candidate.version, "Cloudflare acknowledged a different Reader version");
  } catch (failure) {
    published = undefined;
    for (let attempt = 0; attempt < attempts; attempt++) {
      const observed = await findDeployment(candidate.version).catch(() => undefined);
      if (observed?.version === candidate.version) {
        published = observed;
        recovered = true;
        break;
      }
      if (attempt < attempts - 1) await pause(3000);
    }
    if (!published) {
      record({ ...candidate, previousVersion, outcome: "deployment-unknown" });
      throw new Error("Reader deployment outcome is unknown. Check Cloudflare before taking further action.", { cause: failure });
    }
  }

  const receipt = { ...candidate, previousVersion, deploymentId: published.id };
  record({ ...receipt, outcome: "deployed", recovered });
  let error;
  for (let attempt = 0; attempt < attempts; attempt++) {
    let live;
    try {
      live = await currentDeployment();
      if (live.id === published.id) {
        assert.equal(live.version, candidate.version, "Live deployment reports an unexpected version");
        await verify(candidate.version);
        live = await currentDeployment();
        if (live.id === published.id && live.version === candidate.version) {
          record({ ...receipt, outcome: "live", liveVersion: live.version });
          return;
        }
      }
      if (live.id !== published.id && live.createdOn > published.createdOn) {
        record({ ...receipt, outcome: "superseded-after-deploy", liveVersion: live.version });
        return;
      }
      error = new Error("Reader deployment is not yet confirmed");
    } catch (failure) {
      error = failure;
    }
    if (attempt < attempts - 1) await pause(3000);
  }

  record({ ...receipt, outcome: "verification-failed" });
  throw new Error(`Reader verification failed: ${error?.message}. Check the live deployment before rolling back.`);
}

function deploymentRecord(deployment) {
  const versions = deployment?.versions;
  assert(uuidPattern.test(deployment?.id) && Number.isFinite(Date.parse(deployment.created_on))
    && versions?.length === 1 && versions[0].percentage === 100 && uuidPattern.test(versions[0].version_id),
  "Expected a single active Reader version");
  return { id: deployment.id, createdOn: Date.parse(deployment.created_on), version: versions[0].version_id };
}

async function run() {
  const sha = required("WORKERS_CI_COMMIT_SHA");
  const buildId = required("WORKERS_CI_BUILD_UUID");
  assert(process.env.WORKERS_CI === "1" && process.env.WORKERS_CI_BRANCH === "main"
    && shaPattern.test(sha) && uuidPattern.test(buildId), "Expected a Workers Builds main build");
  assert.equal(execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), sha);
  assert.equal(process.env.READER_WORKERS_BUILDS_ENABLED, "1", "Workers Builds Reader release disabled");
  const record = (item) => console.log(JSON.stringify(item));
  if (await currentMain() !== sha) {
    record({ sha, buildId, outcome: "superseded-before-upload" });
    return;
  }

  const target = readReleaseTarget();
  const accountId = required("READER_RELEASE_ACCOUNT_ID");
  const databaseId = required("READER_RELEASE_DATABASE_ID");
  const plan = buildPreflight({ target, commitSha: sha, requireEnabled: true,
    environment: { accountId, databaseId, releaseCommit: sha } });
  assert.equal(plan.errors.length, 0, JSON.stringify(plan.errors));
  const token = required("CLOUDFLARE_API_TOKEN");
  const contentKey = required("READER_BUILD_CONTENT_API_KEY");
  const cf = cloudflare(accountId, token);
  const worker = `/workers/scripts/${target.workerName}`;
  const annotation = `Reader ${sha} ${buildId}:${randomUUID()}`;
  const temporary = await mkdtemp(resolve(tmpdir(), "reader-release-"));
  try {
    const secrets = resolve(temporary, "worker-secrets.json");
    await writeFile(secrets, JSON.stringify({ CONTENT_API_KEY: contentKey }), { mode: 0o600 });
    execFileSync("./node_modules/.bin/cf", [
      "workers", "versions", "create", "--mode", "reader-production",
      "--message", annotation, "--secrets-file", secrets,
    ], {
      stdio: "inherit",
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        CLOUDFLARE_API_TOKEN: token,
        READER_RELEASE_ACCOUNT_ID: accountId,
        READER_RELEASE_DATABASE_ID: databaseId,
        READER_RELEASE_COMMIT_SHA: sha,
        READER_RELEASE_CANDIDATE_SHA: sha,
      },
    });
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }

  const versions = await cf(`${worker}/versions?per_page=100`);
  const matches = versions.items.filter((item) => item.annotations?.["workers/message"] === annotation);
  assert(matches.length === 1 && uuidPattern.test(matches[0].id), "Could not identify uploaded Reader version");
  await publishCandidate({ sha, buildId, annotation, version: matches[0].id }, {
    mainSha: currentMain,
    async currentDeployment() {
      const result = await cf(`${worker}/deployments`);
      return deploymentRecord(result.deployments?.[0]);
    },
    async deploy(version) {
      const result = await cf(`${worker}/deployments`, {
        strategy: "percentage",
        versions: [{ version_id: version, percentage: 100 }],
        annotations: { "workers/message": annotation },
      });
      return deploymentRecord(result);
    },
    async findDeployment(version) {
      const result = await cf(`${worker}/deployments`);
      const matches = result.deployments.filter((item) =>
        item.annotations?.["workers/message"] === annotation
        && item.versions?.some((entry) => entry.version_id === version));
      assert(matches.length <= 1, "Multiple deployments matched the current build");
      return matches[0] ? deploymentRecord(matches[0]) : undefined;
    },
    verify: smoke,
    record,
  });
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  run().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
