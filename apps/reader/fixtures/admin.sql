-- Additional synthetic fixtures ONLY for isolated dummy57, never historical data.
INSERT INTO books(id) VALUES('admin-incomplete-book');
INSERT INTO books(id,title) VALUES('admin-orphan-book','ADMIN_PRIVATE_ORPHAN_BOOK');
WITH RECURSIVE n(x) AS (SELECT 0 UNION ALL SELECT x+1 FROM n WHERE x<7)
INSERT INTO issues(id,book_id,editor_note,body)
SELECT printf('admin-draft-%02d',x),CASE WHEN x=0 THEN 'admin-incomplete-book' ELSE 'shared-book' END,
  CASE WHEN x=0 THEN NULL ELSE 'ADMIN_PRIVATE_NOTE_'||x END,'ADMIN_PRIVATE_BODY_'||x FROM n;
INSERT INTO issues(id,book_id,status,publication_date,issue_number,editor_note,body)
VALUES('admin-withdrawn-shared','shared-book','withdrawn','2026-12-01',9001,'ADMIN_PRIVATE_WITHDRAWN_NOTE','ADMIN_PRIVATE_WITHDRAWN_BODY');
INSERT INTO quotes(id,issue_id,text,source_label,position) VALUES
('admin-draft-q2','admin-draft-00','ADMIN_PRIVATE_QUOTE_SECOND','第二章',1),
('admin-draft-q1','admin-draft-00','ADMIN_PRIVATE_QUOTE_FIRST'||char(10)||'原样','第1页',0),
('admin-withdrawn-q','admin-withdrawn-shared','ADMIN_PRIVATE_WITHDRAWN_QUOTE','原出处',0);
