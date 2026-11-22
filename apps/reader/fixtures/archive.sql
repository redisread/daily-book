-- Synthetic archive fixtures ONLY, fixed dummy61; no historical importer.
WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<15)
INSERT INTO issues(id,book_id,status,publication_date,issue_number,body)
SELECT printf('archive-extra-%02d',x),'shared-book','published',printf('2026-08-%02d',x),2000+x,'ARCHIVE_BODY_MUST_NOT_RENDER' FROM n;
INSERT INTO books(id,title,author,description,cover_title,cover_author)
VALUES('archive-long-book','长标题归档测试：完整保留中文和NeverTruncateAnUnbrokenLongTitleInArchiveCards','LongAuthorWithoutAnyBreaksForKeyboardAndMobileReading','仅供界面验收的测试资料，不是真实书稿。','归档测试','测试作者');
INSERT INTO issues(id,book_id,status,publication_date,issue_number,editor_note,body)
VALUES('archive-long','archive-long-book','published','2026-12-01',80001,NULL,'ARCHIVE_BODY_MUST_NOT_RENDER_LONG');
