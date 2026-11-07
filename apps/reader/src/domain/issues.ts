import { env } from 'cloudflare:workers';
import { encodeCursor, validId, type PageInput } from './pagination';
import type { IssueLookup, IssuePage, PublicIssue } from './types';
import { readIssueOnce } from '../request-reads';

// Build JSON only for published records: private body/book/quote values are never returned to callers.
const PUBLIC_JSON = `json_object(
  'id',i.id,'bookId',i.book_id,'status',i.status,'publicationDate',i.publication_date,'issueNumber',i.issue_number,
  'editorNote',i.editor_note,'body',i.body,'version',i.version,'createdAt',i.created_at,'updatedAt',i.updated_at,
  'book',json_object('id',b.id,'title',b.title,'author',b.author,'category',b.category,'year',b.year,'pages',b.pages,
    'rating',b.rating,'description',b.description,'coverTitle',b.cover_title,'coverAuthor',b.cover_author,
    'coverUrl',b.cover_url,'alt',b.cover_alt,'version',b.version,'createdAt',b.created_at,'updatedAt',b.updated_at),
  'quotes',json((SELECT json_group_array(json_object('id',q.id,'issueId',q.issue_id,'text',q.text,'sourceLabel',q.source_label,'position',q.position))
    FROM (SELECT id,issue_id,text,source_label,position FROM quotes WHERE issue_id=i.id ORDER BY position ASC,id ASC) q))
)`;
interface Row { status: 'draft' | 'published' | 'withdrawn'; public_json: string | null }
export function classifyVisibility(status: Row['status'] | undefined): IssueLookup['kind'] {
  return status === 'published' ? 'published' : status === 'withdrawn' ? 'withdrawn' : 'not-found';
}
export async function readIssue(id: string): Promise<IssueLookup> {
  if (!validId(id)) return { kind: 'not-found' };
  return readIssueOnce(id, () => loadIssue(id));
}
async function loadIssue(id: string): Promise<IssueLookup> {
  // Linearization point: this single SQL statement's snapshot supplies both the
  // visibility decision and the complete public projection for this request.
  const row = await env.DB.prepare(`SELECT i.status,CASE WHEN i.status='published' THEN ${PUBLIC_JSON} ELSE NULL END AS public_json
    FROM issues i JOIN books b ON b.id=i.book_id WHERE i.id=?`).bind(id).first<Row>();
  const kind = classifyVisibility(row?.status);
  if (kind !== 'published') return { kind };
  if (!row?.public_json) throw new Error('Published row missing');
  return { kind: 'published', issue: JSON.parse(row.public_json) as PublicIssue };
}
export async function readIssueVisibility(id: string): Promise<IssueLookup['kind']> {
  return (await readIssue(id)).kind;
}
export async function listPublishedIssues({ limit, cursor }: PageInput): Promise<IssuePage> {
  // Boundaries originate from the validated cursor; SQL ordering matches its two keys exactly.
  const boundary = cursor ? 'AND (i.publication_date < ? OR (i.publication_date = ? AND i.id < ?))' : '';
  const query = env.DB.prepare(`SELECT ${PUBLIC_JSON} AS public_json FROM issues i JOIN books b ON b.id=i.book_id
    WHERE i.status='published' ${boundary} ORDER BY i.publication_date DESC,i.id DESC LIMIT ?`);
  const bindings = cursor ? [cursor.publicationDate, cursor.publicationDate, cursor.id, limit + 1] : [limit + 1];
  const result = await query.bind(...bindings).all<{ public_json: string }>();
  const rows = result.results.map((row) => JSON.parse(row.public_json) as PublicIssue);
  const items = rows.slice(0, limit);
  const nextCursor = rows.length > limit ? encodeCursor(items.at(-1)!) : null;
  return { items, nextCursor };
}
