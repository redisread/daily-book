import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
const execute = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));
const common = ['--local', '--persist-to', '.cloudflare/race-state', '--mode', 'reader-race-test'];
export async function raceSQL(sql) {
  // Fixed test-only resource. No remote/config/target override is accepted.
  const { stdout } = await execute(`${root}node_modules/.bin/cf`, [
    'd1', 'raw', '00000000-0000-4000-8000-000000000053', ...common, `--sql=${sql}`,
  ], { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  return JSON.parse(stdout);
}
export async function raceRows(sql) {
  return (await raceSQL(sql)).flatMap((result) => result.results.rows.map((values) =>
    Object.fromEntries(result.results.columns.map((key, index) => [key, values[index]]))));
}
export async function migrateRaceDB() {
  await execute(`${root}node_modules/.bin/cf`, [
    'd1', 'migrations', 'apply', '00000000-0000-4000-8000-000000000053', ...common, '--dir', 'migrations',
  ], { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
}
