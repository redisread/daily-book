-- Additive management metadata. 0001 and historical content remain unchanged.
-- Neither table is a lease: only a complete atomic batch can commit a receipt.
CREATE TABLE admin_write_receipts (
  idempotency_key TEXT PRIMARY KEY NOT NULL,
  request_hash TEXT NOT NULL CHECK(length(request_hash)=64),
  operation_id TEXT NOT NULL UNIQUE REFERENCES admin_audit_events(event_id) DEFERRABLE INITIALLY DEFERRED,
  resource_type TEXT NOT NULL CHECK(resource_type IN ('book','issue')),
  resource_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  method TEXT NOT NULL CHECK(method IN ('POST','PATCH')),
  canonical_path TEXT NOT NULL,
  actor TEXT NOT NULL CHECK(actor='content-api'),
  request_id TEXT NOT NULL,
  started_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  before_json TEXT CHECK(before_json IS NULL OR json_valid(before_json)),
  condition_ok INTEGER NOT NULL CHECK(condition_ok=1),
  mutation_ok INTEGER CHECK(mutation_ok IS NULL OR mutation_ok=1),
  audit_ok INTEGER CHECK(audit_ok IS NULL OR audit_ok=1),
  completed INTEGER NOT NULL DEFAULT 0 CHECK(completed IN (0,1)),
  response_status INTEGER CHECK(response_status IN (200,201)),
  response_body TEXT CHECK(response_body IS NULL OR json_valid(response_body)),
  response_etag TEXT,
  response_location TEXT,
  UNIQUE(operation_id,completed),
  CHECK(completed=0 OR (mutation_ok IS 1 AND audit_ok IS 1 AND response_status IS NOT NULL
    AND response_body IS NOT NULL AND response_etag IS NOT NULL))
);
CREATE TABLE admin_audit_events (
  event_id TEXT PRIMARY KEY NOT NULL,
  receipt_completed INTEGER NOT NULL DEFAULT 1 CHECK(receipt_completed=1),
  resource_type TEXT NOT NULL CHECK(resource_type IN ('book','issue')),
  resource_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  before_version INTEGER,
  after_version INTEGER NOT NULL CHECK(after_version BETWEEN 1 AND 9007199254740991),
  before_json TEXT CHECK(before_json IS NULL OR json_valid(before_json)),
  after_json TEXT NOT NULL CHECK(json_valid(after_json)),
  created_at TEXT NOT NULL,
  request_id TEXT NOT NULL,
  actor TEXT NOT NULL CHECK(actor='content-api'),
  CHECK((before_version IS NULL AND after_version=1) OR (before_version IS NOT NULL AND after_version=before_version+1)),
  -- If final receipt completion is absent/ignored, commit fails, not just HTTP.
  FOREIGN KEY(event_id,receipt_completed) REFERENCES admin_write_receipts(operation_id,completed) DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX admin_audit_resource_order ON admin_audit_events(resource_type,resource_id,created_at DESC,event_id DESC);
