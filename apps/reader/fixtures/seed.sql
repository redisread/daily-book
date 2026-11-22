-- Only synthetic local fixtures. Never import this file into a real environment.
INSERT INTO books (id,title,author,category,year,pages,rating,description,cover_title,cover_author,created_at,updated_at)
VALUES ('shared-book','公开书籍 <proof>','测试作者','测试',2026,200,8.5,'PUBLISHED_DESCRIPTION <proof> & 中文','公开'||char(10)||'书籍','测试作者','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z')
ON CONFLICT(id) DO UPDATE SET title=excluded.title,description=excluded.description;
INSERT INTO books(id,title,description) VALUES ('draft-book','DRAFT_ONLY_BOOK_TITLE_SENTINEL','DRAFT_ONLY_BOOK_DESCRIPTION_SENTINEL') ON CONFLICT(id) DO NOTHING;
INSERT INTO books(id,title,description) VALUES ('withdrawn-book','WITHDRAWN_ONLY_BOOK_TITLE_SENTINEL','WITHDRAWN_ONLY_BOOK_DESCRIPTION_SENTINEL') ON CONFLICT(id) DO NOTHING;

INSERT INTO issues(id,book_id,status,publication_date,issue_number,editor_note,body,created_at,updated_at) VALUES
('published-first','shared-book','published','2026-10-01',1,NULL,'PUBLISHED_BODY_STORED_NOT_RENDERED_FIRST','2026-10-01T00:00:00.000Z','2026-10-01T00:00:00.000Z'),
('published-middle','shared-book','published','2026-10-30',2,NULL,'PUBLISHED_BODY_STORED_NOT_RENDERED_MIDDLE','2026-10-30T00:00:00.000Z','2026-10-30T00:00:00.000Z'),
('published-latest','shared-book','published','2026-11-01',3,'公开编辑的话','PUBLISHED_BODY_STORED_NOT_RENDERED_LATEST','2026-11-01T00:00:00.000Z','2026-11-01T00:00:00.000Z'),
('draft-hidden','draft-book','draft',NULL,NULL,'DRAFT_EDITOR_NOTE_SENTINEL','DRAFT_BODY_SENTINEL','2026-11-01T00:00:00.000Z','2026-11-01T00:00:00.000Z'),
('draft-shared','shared-book','draft',NULL,NULL,'DRAFT_SHARED_EDITOR_NOTE_SENTINEL','DRAFT_SHARED_BODY_SENTINEL','2026-11-01T00:00:00.000Z','2026-11-01T00:00:00.000Z'),
('withdrawn-hidden','withdrawn-book','withdrawn','2026-11-05',4,'WITHDRAWN_EDITOR_NOTE_SENTINEL','WITHDRAWN_BODY_SENTINEL','2026-11-05T00:00:00.000Z','2026-11-05T00:00:00.000Z')
ON CONFLICT(id) DO UPDATE SET status=excluded.status,editor_note=excluded.editor_note,body=excluded.body;

-- Deliberately insert quotes out of order to check position ordering.
INSERT INTO quotes(id,issue_id,text,source_label,position) VALUES
('latest-q2','published-latest','公开第二条书摘','第二章',1),
('latest-q1','published-latest','公开第一条书摘 <proof>','第一章',0),
('first-q1','published-first','公开早期书摘','第10页',0),
('middle-q1','published-middle','公开中期书摘','第20页',0),
('draft-q1','draft-hidden','DRAFT_QUOTE_SENTINEL','DRAFT_QUOTE_SOURCE_SENTINEL',0),
('draft-shared-q1','draft-shared','DRAFT_SHARED_QUOTE_SENTINEL','DRAFT_SHARED_QUOTE_SOURCE_SENTINEL',0),
('withdrawn-q1','withdrawn-hidden','WITHDRAWN_QUOTE_SENTINEL','WITHDRAWN_QUOTE_SOURCE_SENTINEL',0)
ON CONFLICT(id) DO NOTHING;

WITH RECURSIVE days(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM days WHERE n<25)
INSERT INTO issues(id,book_id,status,publication_date,issue_number,body,created_at,updated_at)
SELECT printf('published-extra-%02d',n),'shared-book','published',printf('2026-09-%02d',n),1000+n,'EXTRA_PUBLISHED_BODY_NOT_RENDERED','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z' FROM days WHERE 1
ON CONFLICT(id) DO UPDATE SET status=excluded.status;
INSERT INTO quotes(id,issue_id,text,source_label,position)
SELECT id||'-q1',id,'公开扩展书摘','测试出处',0 FROM issues WHERE id LIKE 'published-extra-%'
ON CONFLICT(id) DO NOTHING;
