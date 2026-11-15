# Reviewed historical mapping: isolated local D1 rehearsal

This tool rehearses the reviewed historical mapping only. It does not provision resources, run remote SQL, deploy either application, switch the reader binding, or write management APIs. The old Astro application and its deployment configuration remain unchanged. Reader fixtures still use their existing separate databases.

## Fixed inputs

| Input | Pin |
| --- | --- |
| Historical source | `8b991098f984a5f8870bd01741e3cb937b63d50d` |
| Accepted inventory tool commit | `185d2a0438b73cd7432ee7baaf489e46e2ae564d` |
| Inventory tool SHA256 | `be003c1a2099085db6667c83412bb0abc4ecefe03392d19badad8e3ed7f4c7db` |
| Immutable inventory JSON SHA256 | `4918f76db3da19ba122ed01073b942551ed8e64d926a5c5ee8fb2d370879b5ad` |
| Formal schema commit | `98dfb5cfce872a54b28501c5aa2b73adc3f0703d` |
| Schema SHA256 | `cbda5b150021955d388fe22984a3167f110aae1b953019295803e95362856e3b` |
| Reviewed overlay SHA256 | `27f6e44aff5da93f9d3c64f087fcd8d4f748233421e35adaaa10e81880382bb8` |

The inventory is checked against the pinned Git source and tool, including its 3,060 inverse field checks. The loader also verifies the legacy schema/reader/package/lock inputs used by that tool. The formal migration and overlay must match their pinned bytes. The report records each pin and a fingerprint of the importer implementation. No original source Markdown or inventory is rewritten. The complete in-memory plan is checked against a fresh derivation before applying; applying takes its own copy so a caller cannot mutate the approved intent during an await.

## Reviewed identity decisions

`overlay.json` is separate from the immutable inventory. Its only merge is:

- `the-mythical-man-month` and `the-mythical-man-month-revisit` share Book `the-mythical-man-month`.
- Both original Issue identities remain, with historical numbers **52 and117**, their original dates, bodies and ordered quotes. Every original Book ID is retained in the generated mapping report.
- The two source Book projections must still be identical before merging; otherwise execution stops.

认知觉醒、岛上书店、思考的艺术 retain separate original Book IDs. Their metadata differs; this tool neither declares them confirmed editions nor claims that deduplication is complete.

Expected result: **128 Book /129 published Issue /627 Quote**; publication numbers exactly1–129, historical next number130. It preserves **98 missing editor notes** and **2 substantive raw Markdown bodies**. Historical published imports do not apply a future new-publication editor-note gate, and do not manufacture filler notes.

## Field mapping

| Source | Target/preservation rule |
| --- | --- |
| Candidate Book ID | Reviewed canonical ID; all original IDs remain in the mapping report |
| Title/author/category/description | Exact strings, not trimmed or editorially rewritten |
| Year/pages/rating | Numbers remain numbers; missing values map to NULL, not zero or an inferred value |
| Cover title/author | Exact strings, including embedded newlines/whitespace |
| Cover URL/alt | NULL when absent from the historical source; no invented image URL/description |
| Candidate Issue ID | Unchanged inventory-derived stable identity |
| Publication date/issue number | Unchanged date string/integer, not regenerated from the import clock |
| Editor note | Exact original string, or NULL when absent |
| Markdown body | Exact raw text and whitespace, including empty bodies |
| Quote ID/Issue ID/text | Unchanged inventory-derived IDs and exact text; no cross-Issue quote deduplication |
| Historical quote `page` | Exact candidate `sourceLabel` string in `source_label`; never a fabricated page number |
| Quote order | Exact integer `position` |
| Version/timestamps | Version1. One UTC import timestamp is assigned on first successful application and retained on verified reruns |

The inventory remains the lossless record of original YAML presence/null/type distinctions and source bytes. An absent historical display field becomes SQL NULL; the target does not pretend that absence and an original explicit NULL are distinct UI values.

## Execution boundary

- **Default is dry-run.** It creates the plan/report without opening a database. Only `--apply-local` enables application.
- Only `--input`, optional `--report`, and `--apply-local` are accepted. There is no remote/account/database/config/mode/target/reset/force option.
- The resource-only config at `apps/reader/tools/history-import/cloudflare.config.ts` contains no Worker or deployable entry.
- Database ID is the fictitious `00000000-0000-4000-8000-000000000054` and every resource/migration command supplies `--local` and an explicit package-owned persistence directory.
- CLI application uses only `apps/reader/tools/history-import/.cloudflare/rehearsal/primary`. The verifier uses new restricted `test-*` namespaces under the same root; there is no public target-selector flag.
- The driver refuses changed target paths, symlink traversal and hard-linked state files, strips Cloudflare credential/config environment variables from its child process, and checks local D1 responses for `served_by: miniflare.db`. It requires the pinned `cf`1.0.0-beta.28.
- Reports must be new files outside the Git repository; existing reports/source files are not overwritten. Database files, local caches and environment files are not delivery artifacts.

The fixed dummy ID is not a production resource ID. This tool is not a production importer awaiting a different flag.

## Preflight, atomic application and recovery

1. Verify all immutable inputs and the in-memory plan before opening a target.
2. Compare every non-SQLite schema object to the unchanged formal migration. Only a fresh target, the exact formal schema, or that schema plus the exact tool-owned `_local_history_receipt` table is recognized. Unknown objects (including `sqlite`-lookalike names) or schema changes stop execution. The CLI's `d1_migrations` table is accepted only with its observed pinned definition and recognized migration history, not blindly excluded by name.
3. On an empty recognized target, apply the unchanged formal migration and create the local receipt table. These are preparation steps; their schema may remain after a later failed data transaction. This does **not** claim that schema preparation and data import are one transaction.
4. A recognized but nonempty target without a valid receipt stops. With a receipt, validate input lineage, counts, provenance and every field; identical data is a verified no-op. Different data or provenance stops, without overwrite or automatic repair.
5. Recheck inputs immediately before dispatch. Submit **one native D1 batch**: empty-target receipt guard, Book bulk insert, Issue bulk insert, Quote bulk insert. Business rows and receipt commit or roll back together. The guard also compares the exact schema/migration-history witness inside that transaction, so a new unknown target object introduced after preflight cannot silently slip through. Values are JSON-bound SQL parameters, not interpolated source strings. The receipt is local rehearsal metadata, not a new business-schema migration or a production audit API.
6. Read back all **6,345 fields**:128×15 Book fields +129×10 Issue fields +627×5 Quote fields. Compare value, type, row identity and completeness; retain the full data fingerprint.

If acknowledgement is uncertain, do not automatically resubmit the batch. Read the target: a completely committed, matching receipt/data set is reported as `applied-observed-after-uncertain-ack`; a recognized empty rollback is `APPLY_ROLLED_BACK` and can be retried explicitly. Any partial/unknown outcome stops for review. There is no destructive reset command. Schema/unknown-target conflicts are not treated as permission to delete or rebuild a database.

## Reproduce

Use the same supported Node/runtime as `apps/reader` (verified with Node26.13.0). Install the existing locked dependencies; no dependency or parent tsconfig changes are required:

```sh
npm ci --ignore-scripts
(cd apps/reader && npm ci --ignore-scripts)

# Use the immutable inventory from task50/the review package, not a newly edited JSON.
INVENTORY=/absolute/path/to/inventory.json
EVIDENCE=/absolute/path/outside/this/repository/new-evidence
mkdir -p "$EVIDENCE"

# Default: no database opened.
node_modules/.bin/tsx scripts/import-history.ts --input "$INVENTORY" \
  --report "$EVIDENCE/plan.json"

# Explicit, fixed isolated local application; never remote.
node_modules/.bin/tsx scripts/import-history.ts --input "$INVENTORY" \
  --apply-local --report "$EVIDENCE/applied.json"

# Same code/inputs/target: verified no-op, same data and import timestamp.
node_modules/.bin/tsx scripts/import-history.ts --input "$INVENTORY" \
  --apply-local --report "$EVIDENCE/repeated.json"

npm test
node_modules/.bin/tsc --ignoreConfig --noEmit --skipLibCheck \
  --module esnext --moduleResolution bundler --target es2023 \
  --esModuleInterop --types node scripts/import-history.ts \
  scripts/history-import/*.ts tests/unit/content-import.test.ts

# Intentionally writes ONLY fresh isolated test-* local targets.
# --out must not already exist. Failed/successful target state is retained.
node_modules/.bin/tsx scripts/history-import/verify-local.ts \
  --input "$INVENTORY" --out "$EVIDENCE/native"

# Existing read slice / HTML+RSC controlled races / build isolation regression.
(cd apps/reader && npm run verify)
```

The native verifier covers first import, exact field/type readback, no-op rerun, changed known data, changed receipt lineage, changed inventory bytes, in-memory plan tampering, unknown nonempty schemas, unrecognized nonempty formal targets, an unknown table disguised as migration metadata, a schema change between preflight and the atomic guard, a real native FK-failure rollback followed by explicit recovery, acknowledgement loss after a real commit with no second write, and target path/link refusals. Node's in-memory SQLite is used only to derive the reference schema fingerprint; it is not substituted for local D1 business writes/readback or failure-recovery tests.

The review package records the exact Git head, commands, local witness, input/overlay/tool hashes, outputs and checksums. Completing this rehearsal does not approve a production import, binding switch, launch, or later write/page integration.
