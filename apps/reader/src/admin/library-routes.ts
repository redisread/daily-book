import { env } from 'cloudflare:workers';
import { LIBRARY_BOOK_JSON, libraryJoin, readLibraryBook, type BookStatus } from '../domain/book-library';
import { replaceWithdrawnRecommendation } from '../domain/daily-recommendation';
import { validId, InvalidRequest } from '../domain/pagination';
import { apiError } from '../http';
import { bookNotFound, emptyBody } from '../library-http';
import { atomicWrite, type WriteIntent, type WriteObserver } from './atomic-write';
import { requireAdmin } from './auth';
import { bookColumns, parseBookInput, type BookField, type BookFields } from './book-input';
import { bookETag } from './etag';
import { adminRead, privateResponse } from './http';
import { assertFirstPublicationComplete, parseIssuePatchInput, type IssuePatchInput } from './issue-input';
import { bookIfMatch, idempotencyKey, readJSON, requestDigest, WriteError } from './write-input';

type Action = 'publish' | 'withdraw' | 'restore';

function writeError(error: unknown): Response {
  const response = error instanceof WriteError ? apiError(error.status, error.code, error.message)
    : error instanceof InvalidRequest ? apiError(400, error.code, error.message)
    : apiError(503, 'WRITE_UNAVAILABLE', '管理写入暂不可用。请保留原请求信息。');
  if (error instanceof WriteError && error.code === 'IDEMPOTENCY_IN_PROGRESS') response.headers.set('Retry-After', '1');
  return privateResponse(response);
}

export async function libraryAdminDetail(request: Request, id: string) {
  return emptyBody(request, await adminRead(request, async () => {
    if (new URL(request.url).searchParams.size) throw new InvalidRequest('INVALID_QUERY', '书籍详情不接受查询参数。');
    const data = await readLibraryBook(id);
    return data ? Response.json({ data }, { headers: { ETag: bookETag(data) } }) : bookNotFound();
  }));
}

const stateForAction: Record<Action, { from: BookStatus; to: BookStatus }> = {
  publish: { from: 'draft', to: 'published' },
  withdraw: { from: 'published', to: 'withdrawn' },
  restore: { from: 'withdrawn', to: 'published' },
};
const projection = `SELECT ${LIBRARY_BOOK_JSON} FROM ${libraryJoin} WHERE b.id=?`;
const nextRevision = `b.version=coalesce(json_extract(r.before_json,'$.version'),0)+1 AND b.updated_at=r.started_at`;
const currentVersion = "(char(34)||'b:'||b.id||':'||b.version||char(34))";
const timestamp = '(SELECT started_at FROM admin_write_receipts WHERE operation_id=?)';

async function writeLibraryBook(intent: WriteIntent, create: boolean, fields: BookFields, content: IssuePatchInput,
  action: Action | null, tag: string | null, observer?: WriteObserver) {
  const id = intent.resourceId;
  return atomicWrite(intent, async operationId => {
    const state = action ? stateForAction[action] : null;
    if (action === 'publish') {
      const book = await readLibraryBook(id);
      if (book && bookETag(book) === tag && book.status === 'draft') {
        assertFirstPublicationComplete(book, book.editorNote, book.quotes);
      }
    }
    const entries = Object.entries(fields) as [BookField, string | number | null][];
    const columns = entries.map(([field]) => bookColumns[field]);
    const values = entries.map(([, value]) => value);
    const mutations = create
      ? [env.DB.prepare(`INSERT INTO books (id,${[...columns, 'created_at', 'updated_at'].join(',')})
           VALUES (?${columns.map(() => ',?').join('')},${timestamp},${timestamp})`).bind(id, ...values, operationId, operationId),
         env.DB.prepare('INSERT INTO book_content (book_id,editor_note,body) VALUES (?,?,?)').bind(id, content.editorNote ?? null, content.body ?? '')]
      : [env.DB.prepare(`UPDATE books SET ${columns.map(column => column + '=?,').join('')}
           version=version+1,updated_at=${timestamp} WHERE id=?`).bind(...values, operationId, id)];
    if (!create && (content.editorNote !== undefined || content.body !== undefined)) {
      mutations.push(env.DB.prepare(`UPDATE book_content SET
        editor_note=CASE WHEN ? THEN ? ELSE editor_note END, body=coalesce(?,body) WHERE book_id=?`)
        .bind(Number(content.editorNote !== undefined), content.editorNote ?? null, content.body ?? null, id));
    }
    if (content.quotes) {
      mutations.push(
        env.DB.prepare('DELETE FROM book_quotes WHERE book_id=?').bind(id),
        env.DB.prepare(`INSERT INTO book_quotes (book_id,id,text,source_label,position)
          SELECT ?,json_extract(value,'$.id'),json_extract(value,'$.text'),json_extract(value,'$.sourceLabel'),key FROM json_each(?)`)
          .bind(id, JSON.stringify(content.quotes)),
      );
    }
    if (state) {
      // Derive eligibility from the persisted write timestamp inside the same
      // transaction, including requests queued across Beijing midnight.
      mutations.push(env.DB.prepare(`UPDATE book_content SET status=?,eligible_on=
        CASE WHEN ?='published' THEN date(${timestamp},'+8 hours','+1 day') ELSE NULL END WHERE book_id=?`)
        .bind(state.to, state.to, operationId, id));
      if (action === 'withdraw') mutations.push(replaceWithdrawnRecommendation(operationId, id));
    }
    return {
      before: { sql: projection, values: [id] },
      condition: create ? { sql: 'SELECT NOT EXISTS(SELECT 1 FROM books WHERE id=?)', values: [id] } : {
        sql: `SELECT EXISTS(SELECT 1 FROM ${libraryJoin} WHERE b.id=? AND ${currentVersion}=?
          AND b.version<9007199254740991 ${state ? 'AND c.status=?' : ''})`,
        values: state ? [id, tag, state.from] : [id, tag],
      },
      mutations,
      mutationWitness: {
        sql: `SELECT EXISTS(SELECT 1 FROM ${libraryJoin} WHERE b.id=? AND ${nextRevision}
          ${state ? 'AND c.status=?' : ''})`,
        values: state ? [id, state.to] : [id],
      },
      after: { sql: projection, values: [id] },
      etagFromAuditSQL: "char(34)||'b:'||json_extract(a.after_json,'$.id')||':'||json_extract(a.after_json,'$.version')||char(34)",
      status: create ? 201 : 200,
      location: create ? '/api/v1/admin/books/' + encodeURIComponent(id) : null,
      async classifyFailure(): Promise<never> {
        const current = await readLibraryBook(id);
        if (create && current) throw new WriteError(409, 'BOOK_EXISTS', '书籍 ID 已存在。');
        if (!create && !current) throw new WriteError(404, 'BOOK_NOT_FOUND', '书籍不存在。');
        if (!create && current && bookETag(current) !== tag) throw new WriteError(412, 'PRECONDITION_FAILED', '资源版本已变化。');
        if (state && current?.status !== state.from) throw new WriteError(409, 'INVALID_STATE', '当前书籍状态不允许此操作。');
        throw new WriteError(503, 'WRITE_UNAVAILABLE', '管理写入暂不可用。请保留原请求信息。');
      },
    };
  }, observer);
}

export async function libraryAdminWrite(request: Request, id: string | null, action: Action | null, observer?: WriteObserver) {
  try {
    const denied = await requireAdmin(request);
    if (denied) return privateResponse(denied);
    const url = new URL(request.url);
    if (url.searchParams.size) throw new InvalidRequest('INVALID_QUERY', '写入接口不接受查询参数。');
    if (id !== null && !validId(id)) return privateResponse(bookNotFound());
    const create = id === null;
    const tag = create ? null : bookIfMatch(request.headers);
    const key = idempotencyKey(request.headers);
    const body = await readJSON(request);
    const { editorNote, body: rawBody, quotes, ...metadata } = body;
    if (action && Object.keys(body).length) throw new WriteError(400, 'UNKNOWN_FIELD', '操作请求须使用空对象。');
    if (!create && !action && !Object.keys(body).length) throw new WriteError(422, 'EMPTY_PATCH', '至少提供一个可编辑字段。');
    const contentFields: Record<string, unknown> = {};
    if (Object.hasOwn(body, 'editorNote')) contentFields.editorNote = editorNote;
    if (Object.hasOwn(body, 'body')) contentFields.body = rawBody;
    if (Object.hasOwn(body, 'quotes')) contentFields.quotes = quotes;
    const content = Object.keys(contentFields).length ? parseIssuePatchInput(contentFields, new Set()) : {};
    const { id: createdId, ...fields } = (create ? parseBookInput(metadata, true)
      : Object.keys(metadata).length ? parseBookInput(metadata, false) : {}) as BookFields & { id?: string };
    const resourceId = id ?? createdId!;
    const path = '/api/v1/admin/books' + (create ? '' : '/' + encodeURIComponent(resourceId)) + (action ? '/' + action : '');
    const method = create || action ? 'POST' : 'PATCH';
    const digest = await requestDigest(method, path, body, tag);
    const intent: WriteIntent = { key, digest, resourceType: 'book', resourceId, method, operation: `book.${action ?? (create ? 'create' : 'patch')}`, path };
    return privateResponse(await writeLibraryBook(intent, create, fields, content, action, tag, observer));
  } catch (error) {
    return writeError(error);
  }
}
