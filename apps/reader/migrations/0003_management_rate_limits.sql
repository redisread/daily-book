-- One row per identity, category, and UTC minute. Upserts in D1 serialize
-- concurrent isolates; no per-isolate memory or client-provided identity.
CREATE TABLE admin_rate_limit_buckets (
  actor TEXT NOT NULL CHECK(actor='content-api'),
  bucket TEXT NOT NULL CHECK(bucket IN ('read','write')),
  window_start INTEGER NOT NULL CHECK(window_start >= 0),
  request_count INTEGER NOT NULL CHECK(
    (bucket='read' AND request_count BETWEEN 1 AND 121) OR
    (bucket='write' AND request_count BETWEEN 1 AND 31)
  ),
  PRIMARY KEY(actor,bucket,window_start)
);
