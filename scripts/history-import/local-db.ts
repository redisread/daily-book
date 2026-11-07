import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync, lstatSync, realpathSync, mkdirSync, writeFileSync, unlinkSync, readdirSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ROOT, ensure, type Scalar } from './model';
const execute = promisify(execFile);
export const LOCAL_DATABASE_ID = '00000000-0000-4000-8000-000000000054';
const toolRoot = resolve(ROOT, 'apps/reader/tools/history-import');
const binary = resolve(ROOT, 'apps/reader/node_modules/.bin/cf');
export interface Query { sql: string; params?: Scalar[] }
interface RawResult { success: boolean; results: { columns: string[]; rows: Scalar[][] }; meta: { served_by?: string } }
export class LocalTarget {
  readonly persistPath: string;
  readonly servedBy = new Set<string>();
  constructor(readonly namespace: string = 'primary') {
    ensure(namespace === 'primary' || /^test-[a-z0-9-]{1,75}$/.test(namespace), 'TARGET_INVALID', 'Only primary or owned local-test namespaces are supported');
    this.persistPath = resolve(toolRoot, '.cloudflare/rehearsal', namespace);
  }
  private prepare(): void {
    ensure((this.namespace === 'primary' || /^test-[a-z0-9-]{1,75}$/.test(this.namespace)) && this.persistPath === resolve(toolRoot, '.cloudflare/rehearsal', this.namespace), 'TARGET_UNSAFE', 'Local target path/namespace was modified');
    const canonicalRoot = realpathSync(ROOT);
    ensure(realpathSync(toolRoot) === resolve(canonicalRoot, 'apps/reader/tools/history-import'), 'TARGET_UNSAFE', 'Local tool directory is a symlink outside its repository');
    let path = toolRoot;
    for (const part of relative(toolRoot, this.persistPath).split(sep)) {
      path = resolve(path, part);
      const stat = lstatSync(path, { throwIfNoEntry:false });
      if (stat) ensure(!stat.isSymbolicLink() && stat.isDirectory(), 'TARGET_UNSAFE', 'Local persisted state must not traverse symlinks/files');
      else mkdirSync(path, { mode: 0o700 });
    }
    const inspect = (directory: string): void => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const file = resolve(directory, entry.name); const stat = lstatSync(file);
        ensure(!stat.isSymbolicLink() && (!stat.isFile() || stat.nlink === 1), 'TARGET_UNSAFE', 'Persisted state must not contain symlinks or shared hardlinks');
        if (stat.isDirectory()) inspect(file);
      }
    };
    inspect(this.persistPath);
    ensure(JSON.parse(readFileSync(resolve(ROOT, 'apps/reader/node_modules/cf/package.json'), 'utf8')).version === '1.0.0-beta.28', 'RUNTIME_DRIFT', 'Use the reviewed package lock/CLI version');
  }
  private async command(args: string[]): Promise<string> {
    this.prepare();
    // Native --local simulation requires no credential. Do not carry API/auth
    // overrides into this resource-only tool, even if the shell has them set.
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('CLOUDFLARE_')));
    const { stdout } = await execute(binary, args, { cwd: toolRoot, env, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, timeout: 120000 });
    return stdout;
  }
  async batch(queries: Query[]): Promise<RawResult[]> {
    this.prepare();
    ensure(queries.length > 0 && queries.every(query => typeof query.sql === 'string' && (!query.params || query.params.every(value => value === null || typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value))))), 'QUERY_INVALID', 'Only bounded SQL/scalar parameters are accepted');
    const file = resolve(this.persistPath, `.batch-${randomUUID()}.json`);
    writeFileSync(file, JSON.stringify(queries), { mode: 0o600, flag: 'wx' });
    try {
      const value: unknown = JSON.parse(await this.command(['d1', 'raw', LOCAL_DATABASE_ID, '--local', '--persist-to', this.persistPath, '--batch', `@${file}`]));
      ensure(Array.isArray(value), 'LOCAL_PROTOCOL', 'Expected local D1 result array');
      for (const result of value) {
        ensure(result?.success === true && result.meta?.served_by === 'miniflare.db' && Array.isArray(result.results?.columns) && Array.isArray(result.results?.rows), 'LOCAL_PROTOCOL', 'Expected successful native local D1 result');
        ensure(result.results.columns.every((key: unknown) => typeof key === 'string') && result.results.rows.every((row: unknown) => Array.isArray(row) && row.every(cell => cell === null || typeof cell === 'string' || (typeof cell === 'number' && Number.isFinite(cell)))), 'LOCAL_PROTOCOL', 'Unexpected local D1 scalar output');
        this.servedBy.add(result.meta.served_by);
      }
      return value as RawResult[];
    } finally { unlinkSync(file); }
  }
  async rows(sql: string, params: Scalar[] = []): Promise<Record<string, Scalar>[]> {
    const results = await this.batch([{ sql, params }]);
    return results.flatMap(result => result.results.rows.map(values => Object.fromEntries(result.results.columns.map((key, index) => [key, values[index]]))));
  }
  async migrate(): Promise<void> {
    await this.command(['d1', 'migrations', 'apply', LOCAL_DATABASE_ID, '--local', '--persist-to', this.persistPath, '--dir', resolve(ROOT, 'apps/reader/migrations')]);
  }
}
