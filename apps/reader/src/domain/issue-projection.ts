// SQL projections only; callers own visibility/authentication predicates.
export const BOOK_JSON = `json_object('id',b.id,'title',b.title,'author',b.author,'category',b.category,'year',b.year,'pages',b.pages,
    'rating',b.rating,'description',b.description,'coverTitle',b.cover_title,'coverAuthor',b.cover_author,
    'coverUrl',b.cover_url,'alt',b.cover_alt,'version',b.version,'createdAt',b.created_at,'updatedAt',b.updated_at)`;
export const ISSUE_JSON = `json_object(
  'id',i.id,'bookId',i.book_id,'status',i.status,'publicationDate',i.publication_date,'issueNumber',i.issue_number,
  'editorNote',i.editor_note,'body',i.body,'version',i.version,'createdAt',i.created_at,'updatedAt',i.updated_at,
  'book',${BOOK_JSON},
  'quotes',json((SELECT json_group_array(json_object('id',q.id,'issueId',q.issue_id,'text',q.text,'sourceLabel',q.source_label,'position',q.position))
    FROM (SELECT id,issue_id,text,source_label,position FROM quotes WHERE issue_id=i.id ORDER BY position ASC,id ASC) q))
)`;
