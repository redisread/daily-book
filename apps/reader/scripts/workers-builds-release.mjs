import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { AwsClient } from "aws4fetch";
import { buildPreflight, readReleaseTarget } from "./production-release-preflight.mjs";
import { acquireLock, promoteCandidate, releaseLock } from "./workers-builds-promotion.mjs";

const primary = "https://daily-book.jiahongw.com";
const lockBucket = "daily-book-reader-release-lock";
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

function r2Store(accountId) {
  const aws = new AwsClient({
    accessKeyId: required("READER_RELEASE_R2_ACCESS_KEY_ID"),
    secretAccessKey: required("READER_RELEASE_R2_SECRET_ACCESS_KEY"),
    region: "auto",
    service: "s3",
    retries: 0,
  });
  const url = `https://${accountId}.r2.cloudflarestorage.com/${lockBucket}/production.json`;
  function etag(response) {
    const value = response.headers.get("etag");
    assert(/^"[^"]+"$/.test(value ?? ""), "R2 returned no strong ETag");
    return value;
  }
  return {
    async read() {
      const response = await aws.fetch(url, { signal: AbortSignal.timeout(12000), redirect: "error" });
      if (response.status === 404) {
        // NoSuchBucket and NoSuchKey have different recovery procedures.
        if (/<Code>NoSuchKey<\/Code>/.test(await response.text())) return null;
      }
      if (!response.ok) throw new Error(`R2 lock read returned HTTP ${response.status}`);
      const state = await response.json();
      assert(state?.owner === null || (typeof state?.owner?.execution === "string"
        && shaPattern.test(state.owner.sha) && uuidPattern.test(state.owner.version)), "Invalid R2 lock owner");
      return { ...state, etag: etag(response) };
    },
    async write(state, previous) {
      const response = await aws.fetch(url, {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          ...(previous ? { "if-match": previous } : { "if-none-match": "*" }),
        },
        body: JSON.stringify(state),
        signal: AbortSignal.timeout(12000),
        redirect: "error",
      });
      if (response.status === 412) return null;
      if (!response.ok) throw new Error(`R2 lock write returned HTTP ${response.status}`);
      return etag(response);
    },
  };
}

export async function smoke(origin, access = {}) {
  async function get(path, status = 200) {
    const response = await request(origin + path, {
      headers: { ...access, "cache-control": "no-cache" },
    });
    assert.equal(response.status, status, `Reader response for ${path}`);
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
  assert((await feed.text()).includes(`<link>${primary}${path}</link>`), "Feed lacks its canonical latest issue");
  await get(`/api/v1/admin${path}`, 401);
}

async function allowPropagation(check) {
  for (let retry = 0; ; retry++) {
    try {
      await check();
      return;
    } catch (error) {
      if (retry === 3) throw error;
      await delay(3000);
    }
  }
}

async function run() {
  const sha = required("WORKERS_CI_COMMIT_SHA");
  const buildId = required("WORKERS_CI_BUILD_UUID");
  assert(process.env.WORKERS_CI === "1" && process.env.WORKERS_CI_BRANCH === "main"
    && shaPattern.test(sha) && uuidPattern.test(buildId), "Expected a Workers Builds main build");
  assert.equal(execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), sha);
  assert.equal(process.env.READER_WORKERS_BUILDS_ENABLED, "1", "Workers Builds Reader release disabled");

  if (await currentMain() !== sha) {
    console.log(JSON.stringify({ sha, buildId, outcome: "superseded-before-upload" }));
    return;
  }
  const target = readReleaseTarget();
  const environment = {
    accountId: required("READER_RELEASE_ACCOUNT_ID"),
    databaseId: required("READER_RELEASE_DATABASE_ID"),
    releaseCommit: sha,
  };
  const plan = buildPreflight({ target, commitSha: sha, environment, requireEnabled: true });
  assert.equal(plan.errors.length, 0, JSON.stringify(plan.errors));
  const cfToken = required("CLOUDFLARE_API_TOKEN");
  const contentKey = required("READER_BUILD_CONTENT_API_KEY");
  const access = {
    "CF-Access-Client-Id": required("READER_PREVIEW_ACCESS_CLIENT_ID"),
    "CF-Access-Client-Secret": required("READER_PREVIEW_ACCESS_CLIENT_SECRET"),
  };
  const store = r2Store(target.accountId);
  const cf = cloudflare(target.accountId, cfToken);
  const worker = `/workers/scripts/${target.workerName}`;
  const [subdomain, workerSubdomain] = await Promise.all([
    cf("/workers/subdomain"),
    cf(`${worker}/subdomain`),
  ]);
  assert(/^[a-z0-9-]+$/.test(subdomain.subdomain), "Workers subdomain unavailable");
  assert(workerSubdomain.previews_enabled === true && workerSubdomain.enabled === false,
    "Expected Version URLs enabled and the base workers.dev hostname disabled");
  const execution = `${buildId}:${randomUUID()}`;
  const alias = `release-${execution.split(":")[1].replaceAll("-", "").slice(0, 20)}`;
  const annotation = `Reader ${sha} ${execution}`;
  const temp = await mkdtemp(resolve(tmpdir(), "reader-release-"));
  try {
    const secrets = resolve(temp, "worker-secrets.json");
    await writeFile(secrets, JSON.stringify({ CONTENT_API_KEY: contentKey }), { mode: 0o600 });
    execFileSync("./node_modules/.bin/cf", [
      "workers", "versions", "create", "--mode", "reader-production",
      "--preview-alias", alias, "--message", annotation, "--secrets-file", secrets,
    ], {
      stdio: "inherit",
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        CLOUDFLARE_API_TOKEN: cfToken,
        READER_RELEASE_ACCOUNT_ID: target.accountId,
        READER_RELEASE_DATABASE_ID: target.databaseId,
        READER_RELEASE_COMMIT_SHA: sha,
        READER_RELEASE_CANDIDATE_SHA: sha,
      },
    });
  } finally {
    await rm(temp, { recursive: true, force: true });
  }

  let version;
  await allowPropagation(async () => {
    const versions = await cf(`${worker}/versions?per_page=100`);
    const matches = versions.items.filter((item) => item.annotations?.["workers/message"] === annotation);
    assert(matches.length === 1 && uuidPattern.test(matches[0].id), "Could not identify uploaded Reader version");
    version = matches[0].id;
  });

  const preview = `https://${alias}-${target.workerName}.${subdomain.subdomain}.workers.dev`;
  await allowPropagation(async () => {
    const anonymous = await request(preview + "/");
    const location = anonymous.headers.get("location") ?? "";
    assert([401, 403].includes(anonymous.status) || (anonymous.status === 302 && location.includes("/cdn-cgi/access/")),
      "Reader candidate must require Cloudflare Access");
    await smoke(preview, access);
  });

  await promoteCandidate({ sha, buildId, execution, version }, {
    currentMain,
    async currentVersion() {
      const result = await cf(`${worker}/deployments`);
      const versions = result.deployments?.[0]?.versions;
      assert(versions?.length === 1 && versions[0].percentage === 100
        && uuidPattern.test(versions[0].version_id), "Expected a single active Reader version");
      return versions[0].version_id;
    },
    async deploy(versionId) {
      await cf(`${worker}/deployments`, {
        strategy: "percentage",
        versions: [{ version_id: versionId, percentage: 100 }],
      });
    },
    verify: () => allowPropagation(() => smoke(primary)),
    acquire: (candidate) => acquireLock(store, candidate),
    release: (candidate, etag) => releaseLock(store, candidate, etag),
    receipt: (record) => console.log(JSON.stringify(record)),
  });
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  run().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
