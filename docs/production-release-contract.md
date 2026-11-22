# Reader release and data-operation contract

The Reader release preflight operates offline and verifies the deployed target and historical inputs against committed pins. Initial production D1 setup is a one-time operation, separate from Worker deployment.

## Pinned target

`apps/reader/release-target.json` binds a future release to:

- Worker `daily-book-reader` and canary domain `reader.daily-book.jiahongw.com`;
- D1 name `daily-book-reader-prod`;
- the historical source commit, immutable inventory SHA256 and reviewed overlay SHA256;
- exact SHA256 values for migrations `0001_initial.sql` through `0003_management_rate_limits.sql`;
- exact account/D1 IDs once those resources have been created under separate authorization;
- verified schema-application and history-import receipt SHA256 values before the canary deploy gate can open.

The manifest pins the dedicated production D1 and the verified schema and history receipts. The initial import read back 128 books, 129 issues and 627 quotes, with zero differences across 6,345 fields. `deploymentEnabled` authorizes a dispatch to request canary deployment. The two migration and import flags remain false. The workflow input and the protected environment variable `READER_RELEASE_COMMIT_SHA` bind the deploy to the exact checked-out main commit.

The `reader-production` mode in `cloudflare.config.ts` requires the protected GitHub account/D1 values to exactly match the committed target, and the workflow candidate SHA to match the protected external approval value. Both verified receipt hashes must be present. The mode validates ID/SHA formats, uses the pinned D1 binding, and attaches only the canary domain. It has no fallback to local fake IDs. Local modes keep `dev.remote: false` and their existing fake IDs.

## Read-only preflight behavior

`npm run release:preflight` checks the disabled-target policy when preparing an unprovisioned environment. It validates every target, source, inventory and migration pin. Any pin or schema error exits nonzero, even if deployment is disabled. It reports `databaseOpened: false`, `networkUsed: false`, and all remote operation flags false. CI tests this default-disabled policy with synthetic values; the manual workflow also checks the actual committed target when canary deployment was not requested.

`npm run release:plan -- --commit-sha <full-sha> --inventory <absolute-path> --overlay <absolute-path> --require-inventory --require-overlay --require-enabled` is a read-only candidate check. It compares the requested commit with the separately protected external approval value, checks protected account/D1 target values, inventory and overlay bytes, migration bytes, receipts and enabled flags. It never makes a database connection or HTTP request. The release verifier invokes the formal `npm run verify:release` entry point in isolated temporary fixtures for both disabled and enabled candidates, with the enabled fixture intentionally lacking protected environment variables; the fixture checks leave the committed production manifest unchanged. `--apply`, `--remote`, `--reset`, `--force`, and arbitrary target selectors are not supported.

The CLI preview `cf d1 migrations apply <database-id> --dir migrations --dry-run` is not a schema/data preflight: its `--dry-run` only prints the parsed command. It is not called by the workflow. A future production migration implementation must separately verify target identity, applied migration ledger and the empty-target schema witness before any actual migration command. Migrations must run in order and record their ledger. Production migration and history import are separate writes and require distinct operation authorization.

## Manual release workflow

`.github/workflows/reader-release.yml` is `workflow_dispatch` only. It runs only when the dispatch ref is `main`, requires a full input commit SHA equal to the checked-out `GITHUB_SHA`, and has `deploy_canary: false` by default. Its preflight job installs root and Reader dependencies before cross-project checks, then runs root unit/build/E2E checks, Reader checks, and both audits. When deployment was not requested, preflight verifies the actual target remains disabled. The deploy job requires `deploy_canary: true`, a `reader-production` GitHub environment approval, a manifest explicitly enabled in a reviewed commit, exact protected account/D1 values, and a protected external approval SHA equal to the dispatch SHA. The commit SHA is not embedded in its own commit.

The environment's required reviewer is configured in GitHub repository settings, outside YAML. Before anyone enables deployment, an authorized maintainer must set a required human reviewer and prevent bypass as appropriate, then separately populate exact target variables and secrets. No account token or API key is stored in this repository. Reader API key content is accepted only from the protected environment secret `READER_CONTENT_API_KEY`; the Cloudflare deploy token is likewise a protected secret.

The workflow deploys the Reader against the initialized database. Schema migration and history import run separately from deployment. The initial production operation applied the pinned migrations using Wrangler, confirmed the remote schema and migration ledger against the local reference before import, then submitted a fixed SQL file with an empty-target guard and a receipt. Operators verify the committed receipt hashes and read back data before attaching traffic. The historical rehearsal tool remains local-only.

The existing `.github/workflows/deploy.yml` still triggers on pushes to `main` and deploys the legacy root Astro Worker `daily-book`; it does not deploy Reader. Its quality job installs both root and Reader dependencies before running the root cross-project type check. The root `wrangler.jsonc` and deployment trigger/steps remain unchanged. A merge to `main` can therefore still trigger the legacy site deployment; review that release side effect separately from the gated Reader release.

## CI quality and security gates

PR CI now runs a dedicated Reader job with typecheck, complete local verification, and synthetic checks for both the default-disabled policy and an externally approved candidate. The manual workflow checks the actual manifest stays disabled when deployment was not requested. Security jobs audit both root and Reader lockfiles. Root uses `--audit-level=high` because the only remaining finding is a moderate, development-only lint chain; Reader uses `--audit-level=moderate` because its production dependency graph is clean after the patch override. See [dependency advisory review](dependency-advisory-review.md) for every pre-fix package node, advisory chain and disposition.

A dispatch with the enabled production target uses `deploy_canary: true` and waits for the protected environment reviewer. The manual release preflight reruns root checks and all Reader verification against the exact main SHA. It does not inspect remote branch protection, environment reviewers, DNS, resources, secrets or live traffic. Those are separate release-window checks. CI quality/security/E2E jobs have 30-minute limits; Reader and manual release-preflight jobs have 60-minute limits. Reader jobs explicitly install Chrome plus system dependencies because browser tests use Playwright `channel: 'chrome'`; they do not depend on a developer's preinstalled browser or another job's setup.

## Rollback boundary

Reader application rollback uses the dedicated Worker deployment version or removes the canary route. This does not roll back D1 schema/data. Do not place migration or import in the Worker rollback job. Before a later authorized migration/import task, require a verified export/checkpoint, target identity receipt, exact migration/import pins, complete readback and an explicit uncertain-ack stop procedure. A database restore is a separate destructive operation and is not implied by a code rollback.

## One-time local migration and history rehearsal

From the repository root, use the approved inventory and a new UUID for each isolated database. The dry-run validates the committed release target, migration order and hashes, source inventory, and identity overlay. It emits the fake D1 binding, namespace, plan hash, expected table counts and expected next issue number without opening SQLite or D1.

```sh
inventory=/absolute/path/to/approved/inventory.json
target=$(node -p 'crypto.randomUUID()')
evidence=$(mktemp -d)
npm --silent --prefix apps/reader run history:bootstrap-local -- \
  --input "$inventory" --target "$target" > "$evidence/plan.json"
npm --silent --prefix apps/reader run history:bootstrap-local -- \
  --input "$inventory" --target "$target" --apply-local "$evidence/plan.json" > "$evidence/first.json"
npm --silent --prefix apps/reader run history:bootstrap-local -- \
  --input "$inventory" --target "$target" --apply-local "$evidence/plan.json" > "$evidence/repeat.json"
```

An explicit apply requires the original dry-run and a matching target and input. State is confined to `apps/reader/.cloudflare/management-rehearsal/test-bootstrap-<uuid>`. The tool checks the ownership record, migration ledger and exact schema before continuing. An offline SQLite lock serializes tool executions for that target. Keep other local Readers stopped when using the rehearsal state.

The schema receipt records each committed D1 migration and its applied time. If migration execution is interrupted, the tool reads the ledger and schema to distinguish a complete apply from an exact empty prefix or unexplained state. A proven prefix returns a nonzero exit with the committed migrations and no import receipt. Review it before explicitly rerunning the same plan. The history receipt comes from byte-for-byte data verification of the original atomic import. The reported history result includes 6,345 field comparisons and a zero difference count when that verification succeeds. State with unknown schema, another plan, or unrelated data stops; no reset or override is provided.

Run the isolated fixture suite with an unused external evidence directory.

```sh
npm --prefix apps/reader run verify:history-bootstrap-local -- \
  --input "$inventory" --out "$evidence/verified"
```

The verifier archives an offline copy of the isolated state, retains the previous state under a sibling path, restores into the same identity, and compares the complete readback and data hash. It also injects migration interruption and lost responses after native commits. The backup contains local database state. Share the JSON proof separately from the database copy.

For Issue 130, in this clean worktree check that `apps/reader/.cloudflare/management-state` does not exist, copy the successfully imported isolated state's D1 subdirectory there while the local processes are stopped, then run the existing verifier. It first verifies the copied import as a no-op, publishes Issue 130 to that copy, and checks replay and public visibility.

```sh
test ! -e apps/reader/.cloudflare/management-state &&
  mkdir -p apps/reader/.cloudflare/management-state/v3 &&
  cp -R "apps/reader/.cloudflare/management-rehearsal/test-bootstrap-$target/v3/d1" \
    apps/reader/.cloudflare/management-state/v3/d1 &&
  npm --prefix apps/reader run verify:issue130 -- --input "$inventory"
```

## Imported-content integration and rollback

The Reader accepts the legacy `GET /book/YYYY-MM-DD` link (including an optional trailing slash) and resolves its date against the published Issue in D1. A match returns a relative 307 redirect and `Cache-Control: no-store`. Missing and withdrawn dates return the same 404, and the canonical Issue route still enforces its own visibility check. Query parameters on old links are discarded. Archive, search and RSS continue linking directly to `/issues/:id`. Older RSS links therefore remain usable, and feed readers that identify items by URL may show a repeated item after cutover.

Before a production cutover, confirm the approved candidate SHA, protected GitHub environment, Worker and D1 identity, and the reviewed production schema/import procedures. Freeze or reconcile legacy editorial updates against the final inventory. After the separately authorized migration and import, require verified readback and both receipt hashes. Keep the current site's route and deployment record while smoke-testing the isolated canary. Compare the home page, historical links, archive, search, RSS and the authorized publishing/readback path against the verified inventory before changing the primary route.

After the canary passes, the primary hostname can use a Worker Route with the exact host pattern `daily-book.jiahongw.com/*` pointing to the Reader. Keep the legacy `daily-book` Custom Domain as the origin and rollback path. Before switching, inspect all matching routes, including more specific paths and wildcard hosts, and record their bindings. Recheck the route and public response after the switch.

For a routing or Reader application rollback, first stop new Reader editorial writes. Restore the saved primary route to the previous Worker if it was switched, or revert the canary to a verified Worker version or remove its route. Confirm the old home page, dated book page and RSS from a fresh request. Preserve and export the Reader D1, including any editorial writes after cutover. Any later data restore needs separate authorization, an independently verified backup and a reconciliation plan for those writes.

## Reader automatic deployment with Workers Builds

This is the configuration for future activation. The current manual GitHub workflow and its reviewer remain in use until the activation steps below pass.

### Merge and build settings

1. Protect `main` in GitHub. Require PRs, forbid force pushes and deletion, and require the GitHub Actions checks `quality`, `reader`, `security`, and `e2e`. The CI workflow runs for every PR targeting `main` without path filtering. Verify these exact check contexts on a PR targeting `main`. Require an independent maintainer review for changes to the release pipeline, production target, and routes, and test the configured branch rule using two eligible accounts.
2. Connect the existing `daily-book-reader` Worker to the repository in Cloudflare Workers Builds. Use `main` as the production branch, `/apps/reader` as root, and leave non-production builds disabled for this Worker. Use `npm ci --ignore-scripts` as the build command and `npm run release:workers-builds` as the deploy command. Set the build image's Node version to a version supported by the Reader package. The GitHub Actions CI workflow still runs PR verification.
3. Configure `READER_RELEASE_ACCOUNT_ID` and `READER_RELEASE_DATABASE_ID` as protected build settings matching the committed manifest. Authorize a narrowly scoped Workers deployment credential available to the deployment command as `CLOUDFLARE_API_TOKEN`. Supply the unchanged runtime API key as the protected build secret `READER_BUILD_CONTENT_API_KEY`. For candidate smoke, authorize and provision Cloudflare Access in front of all Reader Version URLs, limit it to the appropriate identities and build service token, and use protected secrets `READER_PREVIEW_ACCESS_CLIENT_ID` and `READER_PREVIEW_ACCESS_CLIENT_SECRET`. Enable Version URLs only after confirming they are protected. Keep the base `workers.dev` hostname disabled.
4. Provision private R2 bucket `daily-book-reader-release-lock` with no public delivery or lifecycle expiry for `production.json`. Scope its S3 credential to this bucket and store it in build secrets `READER_RELEASE_R2_ACCESS_KEY_ID` and `READER_RELEASE_R2_SECRET_ACCESS_KEY`. All production promotions must respect this same lock.
5. Before enabling `READER_WORKERS_BUILDS_ENABLED=1`, rehearse version upload, protected preview, conditional locking and version deployment against an isolated Worker and private test bucket using test bindings, verify checkout identity and token scope, demonstrate a conditional-write conflict, verify anonymous Access denial and authenticated candidate smoke, and exercise same-version promotion and rollback on the isolated Worker. Confirm the previous Worker version can be restored without bypassing deployment checks. Verify branch protection and disable the old manual Reader deploy workflow as a competing writer before enabling the Cloudflare production trigger. Keep its approval settings for break-glass use after first disabling automatic promotion and resolving the lock.

The Deploy command compares the Workers Builds commit with the local checkout and current `main`. It builds and uploads a version without deploying triggers, checks an Access-protected URL scoped to that version, then acquires the R2 promotion lock. Under the lock it re-reads `main`, records the live version, and advances only the tested candidate. It verifies the live version ID and the primary host. Checks cover the latest published issue, home, date redirect, issue API, canonical RSS links and anonymous admin authentication. The candidate checks use GET and do not pass the application admin key. Deployment data and credentials are never sent to the GitHub branch lookup.

During deployment, `production.json` holds the build ID and unique execution ID, commit SHA and candidate version ID. Acquisition and release use R2 conditional writes. A failed write is reconciled with readback before any decision to proceed. If a promotion or rollback cannot be confirmed, leave the lock in place. To recover, disable automatic promotion, confirm the owning build has ended, resolve any in-flight deployment, compare the live Cloudflare version with the JSON receipts in the Workers Builds log, and verify primary traffic. Then replace the lock with an unlocked record using `If-Match` on its reviewed ETag. Do not unlock based on age. The build records previous and candidate versions before promotion, and records the final online version after a successful promotion, stale candidate, or verified rollback. Retain the build receipt with the release evidence.

If a newly promoted version fails its primary smoke, roll back only while Cloudflare still reports that candidate as live. Restore and verify the previous version. For an entire site rollback, pause Reader editorial writes, restore the original no-path `daily-book.jiahongw.com` Worker Route to `daily-book`, then remove the added `daily-book.jiahongw.com/*` route. The retained legacy Custom Domain continues to point to the legacy Worker. Verify the plain homepage, homepage with query, a dated page and RSS. The Reader D1 database and subsequent edits require separate reconciliation.

The old Worker's native build trigger uploads versions and the existing GitHub workflow publishes its scheduled release. Reader promotion only creates deployments of existing Reader versions. It performs no trigger or DNS changes, migrations, or imports.

[Workers Builds configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/) · [Cloudflare version URLs](https://developers.cloudflare.com/workers/versions-and-deployments/version-urls/) · [R2 conditional writes](https://developers.cloudflare.com/r2/api/s3/conditional-operations/)
