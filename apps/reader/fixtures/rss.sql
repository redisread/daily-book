-- Synthetic only; fixed dummy64. None is historical import data.
INSERT INTO books(id,title,author,description)
VALUES('rss-special-book','RSS <script> & "quoted" ''中文😀','作者 <A> & "Q"', '简介 <xml> & "quote" ''apostrophe'' 中文😀' || char(0) || char(11));
INSERT INTO issues(id,book_id,status,publication_date,issue_number,editor_note,body)
VALUES('rss-special','rss-special-book','published','2027-01-01',900064,'RSS_EDITOR_NOTE_MUST_NOT_RENDER','RSS_RAW_BODY_MUST_NOT_RENDER');
INSERT INTO quotes(id,issue_id,position,text)VALUES('rss-special-q1','rss-special',1,'RSS_QUOTE_MUST_NOT_RENDER');
