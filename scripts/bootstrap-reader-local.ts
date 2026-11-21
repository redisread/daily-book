import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ensure, ImportError } from './history-import/model';
import { executeLocalBootstrap, planLocalBootstrap } from './history-import/bootstrap-local';

try {
  const args = process.argv.slice(2);
  ensure(args.length === 4 || args.length === 6, 'INVALID_ARGUMENT',
    'Usage: --input <approved inventory> --target <local UUID v4> [--apply-local <dry-run JSON>]');
  const [inputFlag, input, targetFlag, id, applyFlag, planPath] = args;
  ensure(inputFlag === '--input' && targetFlag === '--target' && (!applyFlag || applyFlag === '--apply-local'),
    'INVALID_ARGUMENT', 'Expected --input, --target and optional --apply-local with approved dry-run JSON');
  const result = planPath
    ? await executeLocalBootstrap(resolve(input), id, JSON.parse(readFileSync(planPath, 'utf8')))
    : planLocalBootstrap(resolve(input), id);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.status.startsWith('stopped')) process.exitCode = 1;
} catch (error) {
  process.stderr.write(`${JSON.stringify({
    status: 'stopped',
    code: error instanceof ImportError ? error.code : 'BOOTSTRAP_FAILED',
    message: error instanceof Error ? error.message : 'Local bootstrap failed',
  })}\n`);
  process.exitCode = 1;
}
