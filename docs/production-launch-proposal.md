# Daily Book Reader production launch proposal

Status: proposal for human confirmation only. This document records the current repository state and a recommended staged launch. It does not configure Cloudflare production resources, change deployment workflows, run remote migrations/imports, or approve production writes.

## Recommendation for confirmation

Launch the Reader as a **separate Cloudflare Worker and separate D1 database**, initially on a canary hostname. Keep the existing Astro Worker and its current content source path intact. Do not point the Reader at the legacy content source or route until the canary has passed and a separate cutover decision is approved.

| Item | Recommended target | Current state / effect |
| --- | --- | --- |
| Source | `redisread/daily-book`, branch `feat/admin-write-integration` (`c557a70979dbfd16dad40b2ae357a6fac6a4f112`), PR base `main` | Local branch only; no PR, remote CI, or production validation is recorded. |
| Merge behavior | Merge only after PR checks and release-gate work are accepted | A push to `main` triggers the existing production workflow, which builds the repository root Astro app and deploys Worker `daily-book`. It does **not** build or deploy `apps/reader`. The scheduled and manual triggers also deploy that root app. |
| Reader Worker | New service name `daily-book-reader` | No production Worker config or binding currently exists. |
| Reader D1 | New database, proposed name `daily-book-reader-prod`, bound as `DB` | Reader config currently uses `dev.remote: false` and fake local IDs. No production D1 ID is recorded or configured. |
| Other bindings | `ASSETS` and server secret `CONTENT_API_KEY` | Reader defines these binding types locally; production values are not configured. Set the key through the Cloudflare secret manager, never in source or GitHub logs. |
| Canary host | Proposed `reader.daily-book.jiahongw.com`, subject to DNS/route availability check | Existing root Worker owns the configured `daily-book.jiahongw.com` route. Do not reuse or replace it during the canary. |
| Reader release trigger | A dedicated, manually dispatched release workflow with the GitHub `reader-production` environment and a required human reviewer | No Reader deployment workflow exists. Do not add Reader deployment to the current automatic root deploy job as part of this proposal. |

The code branch is not deployable to production as-is. The root deploy workflow's merge side effect must be acknowledged before merging: it republishes the existing Astro Worker. A future release implementation must either preserve that behavior intentionally or introduce a separately reviewed release gate; this proposal does not change it.

## Production migration and import boundary

The current Reader and history-import configurations are explicitly local-only. `apps/reader/cloudflare.config.ts` says not to attach production resources or deploy that config; its D1 binding has `remote: false` and uses fictitious test IDs. `apps/reader/tools/history-import/cloudflare.config.ts` is resource-only (`defineConfig({})`), with no Worker or deployable entry. The importer defaults to a dry-run and only supports the fixed local rehearsal path; it has no remote target, account, database, reset, or force option. These safeguards must remain in place.

The approved schema files are `apps/reader/migrations/0001_initial.sql`, `0002_management_writes.sql`, and `0003_management_rate_limits.sql`. They have been exercised locally, but there is no production migration configuration or proven production command path. Before production, a separate release change must:

1. Add a production-only resource configuration with an explicitly named D1 binding and a release command that prints and validates the selected account, Worker, database name, and migration head before any write.
2. Use the supported Cloudflare migration mechanism for this configuration, apply `0001`–`0003` in order, and capture the applied migration ledger. Validate the exact `cf`/Wrangler command and config interaction first; do not assume the local `cf d1 ... --local` scripts can be switched to remote by changing an ID or flag.
3. Add a separately reviewed, one-shot production import entry. It must consume the approved immutable inventory and schema/source pins; produce a dry-run plan first; refuse a nonempty or mismatched target; require an explicit production target confirmation; use the atomic receipt-and-row batch; read back the complete imported dataset; and stop for human inspection after uncertain acknowledgement. It must not add a general-purpose remote/reset/force mode to the existing local importer.
4. Keep the broad public route and routine management writes disabled until schema, import, access secret, rate limit, and restricted canary checks all pass. Confirm how authenticated writes are initially restricted (for example, limited operator key distribution and edge protection against unauthenticated key guessing) before opening the API to routine use.

The formal schema application and historical data import are distinct production actions. A successful local rehearsal does not authorize either action. The expected historical dataset is 128 Books, 129 Issues and 627 Quotes, with the reviewed identity mapping and preserved missing editor notes documented in `docs/local-history-rehearsal.md`.

## Backup and recovery plan

Before the first production schema change, import, or write:

1. Confirm the Cloudflare account's D1 plan and available Time Travel retention, capture a named point-in-time checkpoint, and export the empty/new target or its pre-change state to restricted storage outside this repository. Record database identity, UTC timestamp, schema/migration head, and checksums in the release evidence.
2. Test the restore/export procedure on a disposable D1 database before launch. Do not use an in-place restore as routine rollback: Cloudflare documents it as destructive and it overwrites the selected database.
3. Record the deployed Reader Worker version ID and preserve the previous canary deployment. Keep the legacy `daily-book` Worker and its route untouched.
4. For an application regression, roll back the Reader Worker version or remove/disable the canary route. Worker code rollback does not roll back D1 schema or data. Prefer a forward fix for schema/data changes. Consider point-in-time restore only after impact review, a fresh export, and explicit confirmation because it discards later writes.
5. If cutover ever changes the public hostname, treat DNS/route reversal and Worker version rollback as separate steps. Verify the legacy site and Reader independently after either action.

Cloudflare reference: [D1 Time Travel and backups](https://developers.cloudflare.com/d1/reference/time-travel/) describes retention and destructive in-place restore; [Worker rollbacks](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/) notes that resource changes are not rolled back with Worker code. Verify current plan limits and account behavior in the release window.

## Dependency security and release gates

Read-only `npm audit` snapshots taken on 2026-11-08:

| Lockfile scope | Report | Interpretation |
| --- | --- | --- |
| Repository root | 27 findings: 11 high, 16 moderate, 0 critical | Includes build/dev and transitive packages; the current workflow blocks only critical findings. The report alone does not establish production reachability. Several findings have fixes available, including direct `zod`; review and resolve or document accepted risk before launch. |
| `apps/reader` | 5 moderate, 0 high, 0 critical | Findings are in the Reader dependency graph, including the `vinext`/`@vercel/og`/`satori` chain. `npm audit` suggests a semver-major `vinext` replacement; do not apply it blindly. Decide whether to keep the beta-based stack with a documented owner and mitigation or move to a supported stable stack before production. |

The audit commands exited nonzero because advisories were present. Existing GitHub checks run the root critical-only audit; they do not audit `apps/reader` separately and do not run the Reader's full verification suite. Before enabling deployment, require PR checks for root and Reader typecheck/lint/tests/build plus both lockfile audits, with explicit disposition for each high/moderate advisory and beta dependency. Do not call the current local review a remote CI pass.

Official references: [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/), [D1 Wrangler commands](https://developers.cloudflare.com/d1/wrangler-commands/), [Cloudflare Vite plugin configuration](https://developers.cloudflare.com/workers/vite-plugin/reference/programmatic-configuration/), and [`cf` CLI Worker setup](https://developers.cloudflare.com/cf/get-started/first-worker/). The Reader's programmatic `cloudflare.config.ts` and beta `cf` CLI need a verified production migration/deploy path before choosing a command.

## Proposed release sequence

1. **Confirm this proposal.** Confirm separate Worker/D1, canary hostname, and that the current root deploy-on-main effect is understood. This confirmation is not authorization to create resources, migrate/import production data, set secrets, or deploy.
2. **Prepare a release PR.** Implement the production config, formal migration entry, one-shot import path, deployment workflow, secret/binding documentation, security gate and rollback evidence. Keep the release workflow manual behind a production environment with a required human reviewer. Review the exact diff, base/head, workflow trigger, and all checks.
3. **Provision and preflight.** Under a separate explicit operation authorization, create the new production D1 and Worker/route, confirm account and resource identity, configure `DB`/`ASSETS`/`CONTENT_API_KEY`, apply backup controls, and verify the canary host is independent of the current route.
4. **Migrate and import once.** Back up first; apply the three pinned migrations; inspect the migration ledger and empty-target witness; run and inspect the pinned dry-run; only then use a separately approved one-time import. Read back and compare the full dataset and receipt before serving it.
5. **Canary.** Manually deploy the exact reviewed commit to the new Worker and canary route. Validate public home/issue/archive/search/RSS, authenticated GET/PATCH/POST, rejected unauthenticated requests, no-store behavior, idempotent replay, optimistic version conflicts, audit atomicity, and shared rate limiting across two Worker isolates. Confirm logs contain no secret or private content.
6. **Decide cutover separately.** Review canary evidence, error rate/logs, dependency disposition, and rollback readiness. Only a new explicit approval may authorize changing the public route or importing/updating production data. Do not infer that approval from this proposal, a merge, or a successful canary.

## Approval record

Please confirm or edit these decisions before production-release implementation proceeds:

- [ ] Separate `daily-book-reader` Worker and new `daily-book-reader-prod` D1; preserve current `daily-book` service and D1.
- [ ] Use `reader.daily-book.jiahongw.com` as the canary hostname, pending account/DNS verification.
- [ ] Keep Reader deployment manual behind a required production reviewer; acknowledge that merging to `main` still triggers the existing root Astro deploy.
- [ ] Resolve or explicitly accept the dependency findings and beta-toolchain risk before enabling the release workflow.
- [ ] Treat resource creation, secrets, production migrations/imports, deployment, and public route cutover as separate operations requiring their own explicit authorization.

## Evidence basis

- Local implementation reviewed at `c557a70979dbfd16dad40b2ae357a6fac6a4f112`; task #75 independent review accepted the implementation and safety entry points. No PR, remote CI result, production resource inspection, or live request is claimed.
- Repository deployment behavior: `.github/workflows/deploy.yml`, `.github/workflows/rollback.yml`, `.github/workflows/ci.yml`, root `wrangler.jsonc`, and `apps/reader/cloudflare.config.ts`.
- Local migration/import contract: `apps/reader/tools/history-import/cloudflare.config.ts`, `apps/reader/scripts/*`, `apps/reader/migrations/*`, and `docs/local-history-rehearsal.md`.
