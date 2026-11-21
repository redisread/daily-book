import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { canonical } from '../content-inventory';
import { ROOT, ensure } from './model';

export const RECEIPT_TABLE = '_local_history_receipt';
// Tool-owned LOCAL control metadata, not a change to the formal 0001 migration.
export const RECEIPT_SQL = `CREATE TABLE ${RECEIPT_TABLE} (
  id TEXT PRIMARY KEY CHECK(id='history-v1'),
  input_fingerprint TEXT NOT NULL CHECK(length(input_fingerprint)=64),
  provenance_json TEXT NOT NULL CHECK(json_valid(provenance_json)),
  imported_at TEXT NOT NULL,
  data_sha256 TEXT NOT NULL CHECK(length(data_sha256)=64),
  books_count INTEGER NOT NULL CHECK(books_count=128),
  issues_count INTEGER NOT NULL CHECK(issues_count=129),
  quotes_count INTEGER NOT NULL CHECK(quotes_count=627),
  empty_target_guard INTEGER NOT NULL CHECK(empty_target_guard=1)
)`;
export interface Definition { type: string; name: string; tbl_name: string; sql: string }
// Observed metadata definition of the pinned cf CLI. Do not blindly exclude a
// table merely because somebody named it d1_migrations.
export const D1_MIGRATIONS_SQL = `CREATE TABLE "d1_migrations"(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
)`;
export const DEFINITION_SQL = "SELECT type,name,tbl_name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT GLOB 'sqlite_*' ORDER BY type,name";
export function normalizeSQL(sql: string): string {
  // Normalize only insignificant whitespace. Quoted defaults/check messages and
  // strings are preserved, rather than silently normalizing their contents.
  let result = ''; let quote = ''; let gap = false;
  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];
    if (quote) {
      result += char;
      if (char === quote) {
        if (sql[i+1] === quote) result += sql[++i];
        else quote = '';
      }
    } else if (/\s/.test(char)) gap = true;
    else {
      if (gap && result) result += ' '; gap = false; result += char;
      if (char === "'" || char === '"' || char === '`') quote = char;
    }
  }
  return result.trim().replace(/;$/, '');
}
export function definitionFingerprint(definitions: Definition[]): string {
  return canonical(definitions.map(row => ({ ...row, sql: normalizeSQL(row.sql) })).sort((a,b) => (a.type+'\0'+a.name).localeCompare(b.type+'\0'+b.name)));
}
function reference(includeReceipt: boolean): Definition[] {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(readFileSync(resolve(ROOT, 'apps/reader/migrations/0001_initial.sql'), 'utf8'));
    if (includeReceipt) db.exec(RECEIPT_SQL);
    return db.prepare(DEFINITION_SQL).all().map(row => {
      ensure(['type','name','tbl_name','sql'].every(key => typeof row[key] === 'string'), 'SCHEMA_INVALID', 'Unexpected reference SQLite definition');
      return { type: String(row.type), name: String(row.name), tbl_name: String(row.tbl_name), sql: String(row.sql) };
    });
  } finally { db.close(); }
}
export function classifyDefinitions(definitions: Definition[]): 'fresh' | 'formal' | 'with-receipt-table' {
  const metadata = definitions.filter(row => row.name === 'd1_migrations');
  ensure(metadata.length <= 1 && metadata.every(row => row.type === 'table' && row.tbl_name === 'd1_migrations' && normalizeSQL(row.sql) === normalizeSQL(D1_MIGRATIONS_SQL)),
    'TARGET_SCHEMA_UNKNOWN', 'Unknown or changed migration metadata schema');
  const business = definitions.filter(row => row.name !== 'd1_migrations');
  if (business.length === 0) return 'fresh';
  const fingerprint = definitionFingerprint(business);
  if (fingerprint === definitionFingerprint(reference(false))) return 'formal';
  if (fingerprint === definitionFingerprint(reference(true))) return 'with-receipt-table';
  ensure(false, 'TARGET_SCHEMA_UNKNOWN', 'Local target has unknown or changed schema; nothing will be reset');
}
