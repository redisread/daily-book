import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
export function localSQL(sql) {
  // Fixed virtual ID, mandatory local mode and package-owned state; no remote option or arbitrary config.
  const stdout = execFileSync(`${root}node_modules/.bin/cf`, [
    'd1', 'raw', '00000000-0000-4000-8000-000000000049', '--local', '--persist-to', '.cloudflare/state', `--sql=${sql}`,
  ], { cwd: root, encoding: 'utf8', stdio: ['ignore','pipe','pipe'], maxBuffer: 8 * 1024 * 1024 });
  return JSON.parse(stdout);
}
export function rows(sql) {
  return localSQL(sql).flatMap((result) => result.results.rows.map((values) => Object.fromEntries(result.results.columns.map((key, index) => [key, values[index]]))));
}
