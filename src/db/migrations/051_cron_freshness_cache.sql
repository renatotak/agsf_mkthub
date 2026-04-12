-- ============================================================
-- Migration 051 — Cron freshness cache for smart scheduling
-- ============================================================
-- Stores lightweight fingerprints (ETag, Last-Modified, item count,
-- content hash) per source so the orchestrator can skip unchanged sources.

CREATE TABLE IF NOT EXISTS cron_freshness (
  job_name       text PRIMARY KEY,
  last_etag      text,
  last_modified  text,
  last_hash      text,
  last_item_count int,
  last_checked_at timestamptz NOT NULL DEFAULT now(),
  last_changed_at timestamptz,
  skip_count     int NOT NULL DEFAULT 0,
  run_count      int NOT NULL DEFAULT 0
);
