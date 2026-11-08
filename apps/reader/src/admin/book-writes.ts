import { env } from 'cloudflare:workers';
import { BOOK_JSON } from '../domain/issue-projection';
import { readAdminBook } from './issues';
import { bookETag } from './etag';
import { bookColumns,type BookField,type BookFields } from './book-input';
import { atomicWrite,type WriteIntent,type WriteObserver } from './atomic-write';
import { WriteError } from './write-input';

export async function writeBook(intent: WriteIntent, fields: BookFields, ifMatch: string|null, observer?: WriteObserver): Promise<Response> {
  const id=intent.resourceId;const create=intent.method==='POST';
  return atomicWrite(intent,operationId=>{
    const entries=Object.entries(fields) as [BookField,string|number|null][];
    const columns=entries.map(([name])=>bookColumns[name]);const values=entries.map(([,value])=>value);
    const timestamp='(SELECT started_at FROM admin_write_receipts WHERE operation_id=?)';
    const mutation=create
      ? env.DB.prepare(`INSERT INTO books(id${columns.length?','+columns.join(','):''},created_at,updated_at)
          VALUES(?${columns.map(()=>',?').join('')},${timestamp},${timestamp})`).bind(id,...values,operationId,operationId)
      : env.DB.prepare(`UPDATE books SET ${columns.map(column=>column+'=?,').join('')}version=version+1,updated_at=${timestamp}
          WHERE id=? AND (char(34)||'b:'||id||':'||version||char(34))=? AND version<9007199254740991`).bind(...values,operationId,id,ifMatch);
    return {
      before:{sql:'SELECT '+BOOK_JSON+' FROM books b WHERE b.id=?',values:[id]},
      condition: create
        ? {sql:'SELECT NOT EXISTS(SELECT 1 FROM books WHERE id=?)',values:[id]}
        : {sql:"SELECT EXISTS(SELECT 1 FROM books WHERE id=? AND (char(34)||'b:'||id||':'||version||char(34))=? AND version<9007199254740991)",values:[id,ifMatch]},
      mutations:[mutation],
      // The changed representation, not a pre-read, witnesses exactly one version
      // increment. Even a BEFORE UPDATE RAISE(IGNORE) must fail the batch CHECK.
      mutationWitness:{sql:`SELECT EXISTS(SELECT 1 FROM books b WHERE b.id=?
        AND b.version=coalesce(json_extract(r.before_json,'$.version'),0)+1 AND b.updated_at=r.started_at)`,values:[id]},
      after:{sql:'SELECT '+BOOK_JSON+' FROM books b WHERE b.id=?',values:[id]},
      etagFromAuditSQL:"char(34)||'b:'||json_extract(a.after_json,'$.id')||':'||json_extract(a.after_json,'$.version')||char(34)",
      status:create?201:200,location:create?intent.path+'/'+encodeURIComponent(id):null,
      async classifyFailure(): Promise<never> {
        const current=await readAdminBook(id);
        if (create && current) throw new WriteError(409,'BOOK_EXISTS','书目ID已存在。');
        if (!create && !current) throw new WriteError(404,'BOOK_NOT_FOUND','书目不存在。');
        if (!create && current && bookETag(current)!==ifMatch) throw new WriteError(412,'PRECONDITION_FAILED','资源版本已变化。');
        throw new WriteError(503,'WRITE_UNAVAILABLE','管理写入暂不可用。请保留原请求信息。');
      },
    };
  },observer);
}
