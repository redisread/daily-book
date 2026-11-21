import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { canonical, sha256 } from '../content-inventory';
import { ROOT, ensure } from './model';
import { D1_MIGRATIONS_SQL, DEFINITION_SQL, definitionFingerprint, normalizeSQL, type Definition } from './schema';

export const MANAGEMENT_MIGRATIONS = Object.freeze([
  { name:'0001_initial.sql', sha256:'cbda5b150021955d388fe22984a3167f110aae1b953019295803e95362856e3b' },
  { name:'0002_management_writes.sql', sha256:'37a1de85ef14295701dbf7921d641c2afa3e4e962a5767cd660b6c96478914e2' },
  { name:'0003_management_rate_limits.sql', sha256:'3719d2ed46d622e862a3aac94ffbedde663e20593a085fcd03e05f3aaae89a64' },
]);
export const MANAGEMENT_MIGRATION_NAMES=['0001_initial.sql','0002_management_writes.sql','0003_management_rate_limits.sql'] as const;
export const MANAGEMENT_RECEIPT_TABLE='_local_history_management_receipt';
export const MANAGEMENT_RECEIPT_SQL=`CREATE TABLE ${MANAGEMENT_RECEIPT_TABLE} (
  id TEXT PRIMARY KEY CHECK(id='history-management-v1'),
  input_fingerprint TEXT NOT NULL CHECK(length(input_fingerprint)=64),
  provenance_json TEXT NOT NULL CHECK(json_valid(provenance_json)),
  imported_at TEXT NOT NULL,
  schema_fingerprint TEXT NOT NULL CHECK(length(schema_fingerprint)=64),
  migration_witness TEXT NOT NULL CHECK(json_valid(migration_witness)),
  data_sha256 TEXT NOT NULL CHECK(length(data_sha256)=64),
  books_count INTEGER NOT NULL CHECK(books_count=128),
  issues_count INTEGER NOT NULL CHECK(issues_count=129),
  quotes_count INTEGER NOT NULL CHECK(quotes_count=627),
  empty_target_guard INTEGER NOT NULL CHECK(empty_target_guard=1)
)`;

export function verifyManagementMigrationPins(): string {
  const actual=MANAGEMENT_MIGRATIONS.map(migration=>({name:migration.name,sha256:requireHash(migration.name)}));
  ensure(canonical(actual)===canonical(MANAGEMENT_MIGRATIONS),'SCHEMA_DRIFT','Post-management migration files do not match the approved independent pins');
  const names=readdirSync(resolve(ROOT,'apps/reader/migrations')).sort();
  ensure(canonical(names)===canonical(MANAGEMENT_MIGRATIONS.map(migration=>migration.name).sort()),'SCHEMA_DRIFT','Unexpected migration files exist; use the reviewed exact schema set');
  return canonical(MANAGEMENT_MIGRATIONS);
}
function requireHash(name:string):string {
  const bytes=readFileSync(resolve(ROOT,'apps/reader/migrations',name));
  return createHash('sha256').update(bytes).digest('hex');
}

export function managementReference(includeReceipt:boolean):Definition[] {
  const db=new DatabaseSync(':memory:');
  try {
    for(const migration of MANAGEMENT_MIGRATIONS)db.exec(readFileSync(resolve(ROOT,'apps/reader/migrations',migration.name),'utf8'));
    if(includeReceipt)db.exec(MANAGEMENT_RECEIPT_SQL);
    return db.prepare(DEFINITION_SQL).all().map(row=>{
      ensure(['type','name','tbl_name','sql'].every(key=>typeof row[key]==='string'),'SCHEMA_DRIFT','Malformed in-memory schema definition');
      return {type:String(row.type),name:String(row.name),tbl_name:String(row.tbl_name),sql:String(row.sql)};
    });
  } finally {db.close();}
}
export function classifyManagementDefinitions(definitions:Definition[]):'fresh'|'management'|'management-with-receipt' {
  const metadata=definitions.filter(row=>row.name==='d1_migrations');
  ensure(metadata.length<=1&&metadata.every(row=>row.type==='table'&&row.tbl_name==='d1_migrations'&&normalizeSQL(row.sql)===normalizeSQL(D1_MIGRATIONS_SQL)),
    'TARGET_SCHEMA_UNKNOWN','Unknown or changed migration metadata schema');
  const business=definitions.filter(row=>row.name!=='d1_migrations');
  if(!business.length)return 'fresh';
  const fingerprint=definitionFingerprint(business);
  if(fingerprint===definitionFingerprint(managementReference(false)))return 'management';
  if(fingerprint===definitionFingerprint(managementReference(true)))return 'management-with-receipt';
  ensure(false,'TARGET_SCHEMA_UNKNOWN','Local target does not match the exact approved post-0003 schema');
}
export function expectedMigrationWitness():string {
  return JSON.stringify(MANAGEMENT_MIGRATIONS.map(({name})=>name));
}
export function schemaFingerprint():string {
  return sha256(definitionFingerprint(managementReference(false)));
}

