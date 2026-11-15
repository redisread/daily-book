#!/usr/bin/env node
/** Fixed-input, LOCAL-ONLY history rehearsal. Dry-run is the default. */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { outsideRepository } from './content-inventory';
import { ROOT, ImportError, ensure, loadPlan } from './history-import/model';
export function parseArguments(args: string[]) {
  let input: string | undefined, report: string | undefined, apply = false;
  const seen = new Set<string>();
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    ensure(['--input','--report','--apply-local'].includes(flag) && !seen.has(flag), 'INVALID_ARGUMENT', 'Supported flags: --input <approved-inventory.json> [--report <new-outside-repository-file>] [--apply-local]. No remote/target/config/reset options exist.');
    seen.add(flag);
    if (flag === '--apply-local') apply = true;
    else {
      const value = args[++i]; ensure(value && !value.startsWith('--'), 'INVALID_ARGUMENT', `Missing value for ${flag}`);
      if (flag === '--input') input = value; else report = value;
    }
  }
  ensure(input, 'INVALID_ARGUMENT', '--input is required; the immutable inventory must be supplied explicitly');
  return { input:resolve(input), report, apply };
}
export async function run(args: string[]) {
  const options = parseArguments(args);
  const report = options.report ? outsideRepository(ROOT, options.report) : undefined;
  // Reject output conflicts before opening a target or executing any import.
  if (report) ensure(!existsSync(report), 'OUTPUT_EXISTS', 'Report path already exists; use a new receipt file, never overwrite source/evidence');
  const plan = loadPlan(options.input);
  const result = options.apply
    ? await (await import('./history-import/apply')).applyLocal(plan)
    : { status:'dry-run', localOnly:true, databaseOpened:false, inputFingerprint:plan.inputFingerprint,
      semanticSHA256:plan.semanticSHA256, provenance:plan.provenance, counts:plan.summary, sourceFieldChecks:plan.sourceFieldChecks,
      mapping:plan.mappings, systemFields:'version=1; created_at/updated_at assigned once at first local apply and reused from its atomic receipt' };
  const text = JSON.stringify(result, null, 2) + '\n';
  if (report) { mkdirSync(dirname(report), { recursive:true }); writeFileSync(report, text, { flag:'wx', mode:0o600 }); }
  return text;
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  run(process.argv.slice(2)).then(text => process.stdout.write(text), error => {
    const known = error instanceof ImportError;
    process.stderr.write(JSON.stringify({ status:'stopped', code:known ? error.code : 'REHEARSAL_FAILED', message:known ? error.message : 'Local rehearsal failed; inspect local evidence, do not reset or retry blindly' }) + '\n');
    process.exitCode = 1;
  });
}
