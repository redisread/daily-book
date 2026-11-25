-- Apply after 0001–0003 and the historical import. Leave all legacy rows intact.
CREATE TABLE book_content (
  book_id TEXT PRIMARY KEY NOT NULL REFERENCES books(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','withdrawn')),
  editor_note TEXT,
  body TEXT NOT NULL DEFAULT '',
  eligible_on TEXT,
  CHECK ((status = 'published') = (eligible_on IS NOT NULL)),
  CHECK (eligible_on IS NULL OR (length(eligible_on) = 10 AND date(eligible_on,'+0 days') IS eligible_on))
);
CREATE INDEX book_content_eligible ON book_content(status, eligible_on, book_id);
CREATE INDEX books_title_order ON books(title COLLATE NOCASE, id);

CREATE TABLE book_quotes (
  book_id TEXT NOT NULL REFERENCES book_content(book_id) ON DELETE RESTRICT,
  id TEXT NOT NULL,
  text TEXT NOT NULL,
  source_label TEXT NOT NULL,
  position INTEGER NOT NULL CHECK (position >= 0),
  PRIMARY KEY (book_id, id),
  UNIQUE (book_id, position)
);

CREATE TABLE daily_recommendations (
  day TEXT PRIMARY KEY NOT NULL CHECK (length(day) = 10 AND date(day,'+0 days') IS day),
  book_id TEXT REFERENCES book_content(book_id) ON DELETE RESTRICT
);

-- Repeated publications collapse to the latest public content. If there is no
-- public issue, preserve the most recent draft, then withdrawn content privately.
WITH ranked_issues AS (
  SELECT book_id, id, status, editor_note, body, row_number() OVER (
    PARTITION BY book_id
    ORDER BY CASE status WHEN 'published' THEN 0 WHEN 'draft' THEN 1 ELSE 2 END,
      publication_date DESC, updated_at DESC, id DESC
  ) AS rank
  FROM issues
)
INSERT INTO book_content (book_id,status,editor_note,body,eligible_on)
SELECT b.id, coalesce(i.status,'draft'), i.editor_note, coalesce(i.body,''),
       CASE WHEN i.status='published' THEN '0001-01-01' END
FROM books b LEFT JOIN ranked_issues i ON i.book_id=b.id AND i.rank=1;

WITH ranked_issues AS (
  SELECT book_id, id, row_number() OVER (
    PARTITION BY book_id
    ORDER BY CASE status WHEN 'published' THEN 0 WHEN 'draft' THEN 1 ELSE 2 END,
      publication_date DESC, updated_at DESC, id DESC
  ) AS rank
  FROM issues
)
INSERT INTO book_quotes (book_id,id,text,source_label,position)
SELECT i.book_id,q.id,q.text,q.source_label,q.position
FROM ranked_issues i JOIN quotes q ON q.issue_id=i.id
WHERE i.rank=1;
