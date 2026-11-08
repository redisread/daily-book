import {it,expect} from 'vitest';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {classifyDefinitions,DEFINITION_SQL,type Definition} from '../../scripts/history-import/schema';
const schema=readFileSync('apps/reader/migrations/0001_initial.sql','utf8');const metadata=readFileSync('apps/reader/migrations/0002_management_writes.sql','utf8');
it('deferred receipt-audit constraints prevent commit without an audit or completed response',()=>{
  const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON;'+schema+metadata);
  try {
    db.exec('BEGIN');
    db.prepare("INSERT INTO admin_write_receipts(idempotency_key,request_hash,operation_id,resource_type,resource_id,operation,method,canonical_path,actor,request_id,condition_ok) VALUES(?,?,?,'book','a','book.create','POST','/api/v1/admin/books','content-api','req',1)").run('key'.repeat(8),'a'.repeat(64),'op');
    db.exec("INSERT INTO books(id) VALUES('a')");
    expect(()=>db.exec('COMMIT')).toThrow();db.exec('ROLLBACK');
    expect(db.prepare('SELECT count(*) AS n FROM books').get()?.n).toBe(0);
    const definitions:Definition[]=db.prepare(DEFINITION_SQL).all().map(row=>({type:String(row.type),name:String(row.name),tbl_name:String(row.tbl_name),sql:String(row.sql)}));
    expect(()=>classifyDefinitions(definitions)).toThrow(/unknown or changed schema/);
  } finally {db.close();}
});
