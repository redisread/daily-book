-- Dedicated dummy53 database only; these are not historical/user records.
CREATE TABLE IF NOT EXISTS reader_test_barrier (
  id TEXT PRIMARY KEY CHECK(id='current'), issue_id TEXT NOT NULL,
  armed INTEGER NOT NULL DEFAULT 0, claimed INTEGER NOT NULL DEFAULT 0,
  released INTEGER NOT NULL DEFAULT 0, request_id TEXT, observed_kind TEXT,
  physical_reads INTEGER
);
INSERT OR IGNORE INTO reader_test_barrier(id,issue_id) VALUES('current','race-issue');
INSERT OR IGNORE INTO books(id,title,author,description,cover_title) VALUES(
  'race-book','PUBLIC_INITIAL_TITLE','PUBLIC_INITIAL_AUTHOR','PUBLIC_INITIAL_DESCRIPTION','PUBLIC_INITIAL_COVER'
);
INSERT OR IGNORE INTO issues(id,book_id,status,publication_date,issue_number,editor_note,body) VALUES(
  'race-issue','race-book','published','2026-01-02',1,'PUBLIC_INITIAL_NOTE','PUBLIC_INITIAL_BODY'
);
INSERT OR IGNORE INTO quotes(id,issue_id,text,source_label,position) VALUES(
  'race-quote','race-issue','PUBLIC_INITIAL_QUOTE','PUBLIC_INITIAL_SOURCE',0
);
