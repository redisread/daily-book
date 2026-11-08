# Reader release and data-operation contract

This is the local contract for release preparation in task #76. The target manifest is intentionally unprovisioned and disabled. The checks in this repository do not call Cloudflare, open D1, apply migrations, import history, deploy a Worker, or change a route.

## Pinned target

`apps/reader/release-target.json` binds a future release to:

- Worker `daily-book-reader` and canary domain `reader.daily-book.jiahongw.com`;
- D1 name `daily-book-reader-prod`;
- the historical source commit, immutable inventory SHA256 and reviewed overlay SHA256;
- exact SHA256 values for migrations `0001_initial.sql` through `0003_management_rate_limits.sql`;
- exact account/D1 IDs once those resources have been created under separate authorization;
- verified schema-application and history-import receipt SHA256 values before the canary deploy gate can open.

Current `accountId`, `databaseId`, `schemaReceiptSha256` and `historyImportReceiptSha256` are null. `deploymentEnabled`, `migrationApplyEnabled` and `historyImportEnabled` are false. The domain is a proposed canary and has not been checked or provisioned. The candidate commit is never stored in the candidate commit itself: it is passed as a workflow input and bound to the protected external GitHub environment variable `READER_RELEASE_COMMIT_SHA` after approval.

The `reader-production` mode in `cloudflare.config.ts` rejects the current manifest. If later enabled, it requires the protected GitHub account/D1 values to exactly match the committed target, and the workflow candidate SHA to match the protected external approval value. Both verified receipt hashes must be present. The mode validates ID/SHA formats, uses the pinned D1 binding, and attaches only the canary domain. It has no fallback to local fake IDs. Local modes keep `dev.remote: false` and their existing fake IDs.

## Read-only preflight behavior

`npm run release:preflight` verifies that the committed production target remains disabled and that every target/source/inventory/migration pin is valid. Any pin or schema error exits nonzero, even if deployment is disabled. It reports `databaseOpened: false`, `networkUsed: false`, and all remote operation flags false. CI tests this default-disabled policy with synthetic values; the manual workflow also checks the actual committed target when canary deployment was not requested.

`npm run release:plan -- --commit-sha <full-sha> --inventory <absolute-path> --overlay <absolute-path> --require-inventory --require-overlay --require-enabled` is a read-only candidate check. It compares the requested commit with the separately protected external approval value, checks protected account/D1 target values, inventory and overlay bytes, migration bytes, receipts and enabled flags. It never makes a database connection or HTTP request. Local synthetic tests exercise both disabled and authorized-candidate paths without production values. `--apply`, `--remote`, `--reset`, `--force`, and arbitrary target selectors are not supported.

The CLI preview `cf d1 migrations apply <database-id> --dir migrations --dry-run` is not a schema/data preflight: its `--dry-run` only prints the parsed command. It is not called by the workflow. A future production migration implementation must separately verify target identity, applied migration ledger and the empty-target schema witness before any actual migration command. Migrations must run in order and record their ledger. Production migration and history import are separate writes and require distinct operation authorization.

## Manual release workflow

`.github/workflows/reader-release.yml` is `workflow_dispatch` only. It runs only when the dispatch ref is `main`, requires a full input commit SHA equal to the checked-out `GITHUB_SHA`, and has `deploy_canary: false` by default. Its preflight job installs root and Reader dependencies before cross-project checks, then runs root unit/build/E2E checks, Reader checks, and both audits. When deployment was not requested, preflight verifies the actual target remains disabled. The deploy job requires `deploy_canary: true`, a `reader-production` GitHub environment approval, a manifest explicitly enabled in a reviewed commit, exact protected account/D1 values, and a protected external approval SHA equal to the dispatch SHA. The commit SHA is not embedded in its own commit.

The environment's required reviewer is configured in GitHub repository settings, outside YAML. Before anyone enables deployment, an authorized maintainer must set a required human reviewer and prevent bypass as appropriate, then separately populate exact target variables and secrets. No account token or API key is stored in this repository. Reader API key content is accepted only from the protected environment secret `READER_CONTENT_API_KEY`; the Cloudflare deploy token is likewise a protected secret.

The workflow contains no migration-apply or import job. Until those one-shot operations have their own reviewed implementation and explicit approvals, deployment cannot initialize production data and the Reader must not serve that database. `apps/reader/tools/history-import/cloudflare.config.ts` and its fixed local importer remain unchanged and local-only.

The existing `.github/workflows/deploy.yml` and root `wrangler.jsonc` are unchanged. A merge to `main` still triggers the legacy root Astro deployment to Worker `daily-book`; it does not deploy Reader. This feature branch is not pushed or merged as part of the task.

## CI quality and security gates

PR CI now runs a dedicated Reader job with typecheck, complete local verification, and synthetic checks for both the default-disabled policy and an externally approved candidate. The manual workflow checks the actual manifest stays disabled when deployment was not requested. Security jobs audit both root and Reader lockfiles. Root uses `--audit-level=high` because the only remaining finding is a moderate, development-only lint chain; Reader uses `--audit-level=moderate` because its production dependency graph is clean after the patch override. See [dependency advisory review](dependency-advisory-review.md) for every pre-fix package node, advisory chain and disposition.

The manual release preflight reruns root checks and all Reader verification against the exact main SHA. It does not inspect remote branch protection, environment reviewers, DNS, resources, secrets or live traffic. Those are separate release-window checks. CI quality/security/E2E jobs have 30-minute limits; Reader and manual release-preflight jobs have 60-minute limits. Reader jobs explicitly install Chrome plus system dependencies because browser tests use Playwright `channel: 'chrome'`; they do not depend on a developer's preinstalled browser or another job's setup.

## Rollback boundary

Reader application rollback uses the dedicated Worker deployment version or removes the canary route. This does not roll back D1 schema/data. Do not place migration or import in the Worker rollback job. Before a later authorized migration/import task, require a verified export/checkpoint, target identity receipt, exact migration/import pins, complete readback and an explicit uncertain-ack stop procedure. A database restore is a separate destructive operation and is not implied by a code rollback.
