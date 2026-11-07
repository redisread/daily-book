-- Formal content model. Drafts may be incomplete; new-publication validation belongs to future write APIs.
CREATE TABLE books (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) BETWEEN 1 AND 128 AND id NOT GLOB '*[^A-Za-z0-9_-]*' AND substr(id,1,1) GLOB '[A-Za-z0-9]'),
  title TEXT NOT NULL DEFAULT '',
  author TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  year INTEGER CHECK (year IS NULL OR typeof(year) = 'integer'),
  pages INTEGER CHECK (pages IS NULL OR (typeof(pages) = 'integer' AND pages > 0)),
  rating REAL CHECK (rating IS NULL OR (typeof(rating) IN ('integer','real') AND rating > 0)),
  description TEXT NOT NULL DEFAULT '',
  cover_title TEXT NOT NULL DEFAULT '',
  cover_author TEXT NOT NULL DEFAULT '',
  cover_url TEXT,
  cover_alt TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (typeof(version) = 'integer' AND version > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE issues (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) BETWEEN 1 AND 128 AND id NOT GLOB '*[^A-Za-z0-9_-]*' AND substr(id,1,1) GLOB '[A-Za-z0-9]'),
  book_id TEXT NOT NULL REFERENCES books(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  editor_note TEXT,
  body TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','withdrawn')),
  publication_date TEXT UNIQUE,
  issue_number INTEGER UNIQUE CHECK (issue_number IS NULL OR (typeof(issue_number) = 'integer' AND issue_number > 0)),
  version INTEGER NOT NULL DEFAULT 1 CHECK (typeof(version) = 'integer' AND version > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (publication_date IS NULL OR (
    length(publication_date) = 10 AND
    publication_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND
    date(publication_date,'+0 days') IS publication_date
  )),
  CHECK (
    (status = 'draft' AND publication_date IS NULL AND issue_number IS NULL) OR
    (status IN ('published','withdrawn') AND publication_date IS NOT NULL AND issue_number IS NOT NULL)
  )
);

CREATE TABLE quotes (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) BETWEEN 1 AND 160 AND id NOT GLOB '*[^A-Za-z0-9_-]*' AND substr(id,1,1) GLOB '[A-Za-z0-9]'),
  issue_id TEXT NOT NULL REFERENCES issues(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  text TEXT NOT NULL DEFAULT '',
  source_label TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL CHECK (typeof(position) = 'integer' AND position >= 0),
  UNIQUE (issue_id, position)
);
CREATE INDEX issues_public_order ON issues(status, publication_date DESC, id DESC);

-- First publication reserves the date and number even after withdrawal/restoration.
CREATE TRIGGER issue_publication_identity_immutable
BEFORE UPDATE OF publication_date, issue_number ON issues
WHEN OLD.publication_date IS NOT NULL AND
  (NEW.publication_date IS NOT OLD.publication_date OR NEW.issue_number IS NOT OLD.issue_number)
BEGIN SELECT RAISE(ABORT, 'publication identity is immutable'); END;

CREATE TRIGGER book_id_immutable BEFORE UPDATE OF id ON books WHEN NEW.id IS NOT OLD.id
BEGIN SELECT RAISE(ABORT, 'book id is immutable'); END;
CREATE TRIGGER issue_id_immutable BEFORE UPDATE OF id ON issues WHEN NEW.id IS NOT OLD.id
BEGIN SELECT RAISE(ABORT, 'issue id is immutable'); END;
CREATE TRIGGER quote_id_immutable BEFORE UPDATE OF id ON quotes WHEN NEW.id IS NOT OLD.id
BEGIN SELECT RAISE(ABORT, 'quote id is immutable'); END;
