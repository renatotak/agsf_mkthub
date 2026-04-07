-- ============================================================
-- Migration 027: Scraper Resilience Foundation (Phase 19A)
-- Depends on: nothing (additive, no FK to existing tables)
-- ============================================================
--
-- Establishes the operational telemetry + auto-correction protocol
-- that every new scraper from Phase 19 onward must use. See
-- docs/SCRAPER_PROTOCOL.md for the full design rationale.
--
-- Three tables:
--   1. scraper_registry  — definitions + live health per scraper
--   2. scraper_runs      — per-run telemetry (rows, validation, timing)
--   3. scraper_knowledge — narrative auto-correction memory (failures,
--                          fixes, selector changes, format changes)
--
-- This sits ALONGSIDE existing infrastructure, not on top of it:
--   - migration 007 `data_sources_registry` = catalogue of sources
--     that exist in the world (URL, frequency, automated y/n)
--   - migration 003 `sync_logs`             = legacy flat per-run log
--     consumed by the DataSources UI; runScraper() keeps writing to it
--     for backward compat until that UI is migrated
--   - migration 027 (this file)             = operational scraper layer
--
-- Validation in `scraper_knowledge` and the runScraper() wrapper is
-- 100% deterministic (regex / type / range / enum / row-count). NO LLM
-- anywhere in the auto-correction loop — guardrail #1 from CLAUDE.md.
-- The protocol is human-driven: when a scraper flips to `broken`, a
-- human reads the knowledge rows and updates the code.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── 1. scraper_registry ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS scraper_registry (
  scraper_id           text PRIMARY KEY,
  name                 text NOT NULL,
  description          text,
  source_id            text NOT NULL,                 -- by-convention match to data_sources_registry.id
  kind                 text NOT NULL CHECK (kind IN ('rss','html','api','csv','pdf','json','xlsx')),
  target_table         text,                          -- nullable for ping/healthcheck scrapers
  cadence              text NOT NULL CHECK (cadence IN ('daily','weekly','monthly','quarterly','yearly','manual')),
  grace_period_hours   int  NOT NULL DEFAULT 24,
  schema_check         jsonb NOT NULL,                -- { required_keys, sample_row, numeric_ranges?, enum_values? }
  expected_min_rows    int  NOT NULL DEFAULT 1,
  status               text NOT NULL DEFAULT 'healthy'
                         CHECK (status IN ('healthy','degraded','broken','disabled')),
  last_success_at      timestamptz,
  last_failure_at      timestamptz,
  consecutive_failures int  NOT NULL DEFAULT 0,
  next_due_at          timestamptz,
  owner                text,
  notes                text,
  confidentiality      text NOT NULL DEFAULT 'agrisafe_published'
                         CHECK (confidentiality IN ('public','agrisafe_published','agrisafe_confidential')),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scraper_registry_status ON scraper_registry(status);
CREATE INDEX IF NOT EXISTS idx_scraper_registry_next_due ON scraper_registry(next_due_at);

ALTER TABLE scraper_registry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read scraper_registry"
  ON scraper_registry FOR SELECT USING (true);

CREATE POLICY "Service role write scraper_registry"
  ON scraper_registry FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE scraper_registry IS
  'One row per scraper. Holds the definition (kind, target_table, schema_check) AND the live health (status, last_success_at, consecutive_failures). The single source of truth used by src/lib/scraper-runner.ts.';

-- ─── 2. scraper_runs ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS scraper_runs (
  run_id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scraper_id        text NOT NULL REFERENCES scraper_registry(scraper_id) ON DELETE CASCADE,
  started_at        timestamptz NOT NULL,
  finished_at       timestamptz,
  duration_ms       int,
  triggered_by      text NOT NULL DEFAULT 'cron'
                      CHECK (triggered_by IN ('cron','manual','retry','test')),
  attempt_number    int  NOT NULL DEFAULT 1,
  git_sha           text,
  target_period     text,
  http_status       int,
  bytes_fetched     int,
  rows_fetched      int  NOT NULL DEFAULT 0,
  rows_inserted     int  NOT NULL DEFAULT 0,
  rows_skipped      int  NOT NULL DEFAULT 0,
  validation_errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  sample_payload    jsonb,
  status            text NOT NULL
                      CHECK (status IN ('success','partial','validation_failed','fetch_error','parse_error')),
  error_message     text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scraper_runs_scraper_started
  ON scraper_runs(scraper_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_scraper_runs_status ON scraper_runs(status);

ALTER TABLE scraper_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read scraper_runs"
  ON scraper_runs FOR SELECT USING (true);

CREATE POLICY "Service role write scraper_runs"
  ON scraper_runs FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE scraper_runs IS
  'Per-execution telemetry. Every call to runScraper() creates exactly one row. validation_errors is a JSON array of {key,expected,got,row_index} entries; sample_payload holds the first 3 fetched rows for diagnosis.';

-- ─── 3. scraper_knowledge ────────────────────────────────────

CREATE TABLE IF NOT EXISTS scraper_knowledge (
  knowledge_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scraper_id       text NOT NULL REFERENCES scraper_registry(scraper_id) ON DELETE CASCADE,
  kind             text NOT NULL
                     CHECK (kind IN ('spec','failure','fix','selector_change','url_change','format_change','note')),
  title            text NOT NULL,
  body             text NOT NULL,
  selector_or_url  text,
  severity         text CHECK (severity IN ('info','warn','error','critical')),
  related_run_id   uuid REFERENCES scraper_runs(run_id) ON DELETE SET NULL,
  resolved_at      timestamptz,
  superseded_by    uuid REFERENCES scraper_knowledge(knowledge_id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  created_by       text NOT NULL DEFAULT 'system'
                     CHECK (created_by IN ('system','user','agent')),
  confidentiality  text NOT NULL DEFAULT 'agrisafe_published'
                     CHECK (confidentiality IN ('public','agrisafe_published','agrisafe_confidential'))
);

CREATE INDEX IF NOT EXISTS idx_scraper_knowledge_scraper_kind_created
  ON scraper_knowledge(scraper_id, kind, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scraper_knowledge_unresolved
  ON scraper_knowledge(scraper_id) WHERE resolved_at IS NULL;

ALTER TABLE scraper_knowledge ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read scraper_knowledge"
  ON scraper_knowledge FOR SELECT USING (true);

CREATE POLICY "Service role write scraper_knowledge"
  ON scraper_knowledge FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE scraper_knowledge IS
  'Narrative auto-correction memory. When a run fails, runScraper() inserts a kind=failure row with the diagnostic. When a human fixes the underlying issue, they add a kind=fix or kind=selector_change row and set resolved_at on the failure. This becomes the institutional memory of how each source has changed over time.';

-- ─── Seed: healthcheck scraper ───────────────────────────────
-- A trivial no-op scraper used to validate the runScraper() wiring
-- end-to-end. The route at /api/cron/sync-scraper-healthcheck pings
-- https://api.github.com/zen and writes nothing to a target table
-- (target_table is intentionally null). Safe to delete after the
-- macro pipeline has been running cleanly for a couple of weeks.

INSERT INTO scraper_registry (
  scraper_id, name, description, source_id, kind, target_table,
  cadence, grace_period_hours, schema_check, expected_min_rows,
  owner, notes
) VALUES (
  'sync-scraper-healthcheck',
  'Scraper wiring smoke test',
  'No-op probe that validates the runScraper() wrapper end-to-end. Pings api.github.com/zen and writes only to scraper_runs.',
  'github-zen',
  'json',
  NULL,
  'daily',
  24,
  '{
    "required_keys": ["source", "message", "fetched_at"],
    "sample_row": {
      "source": "string",
      "message": "string",
      "fetched_at": "string"
    }
  }'::jsonb,
  1,
  'agrisafe-mkthub',
  'Safe to delete once Phase 19B macro scraper has been green for 2+ weeks.'
)
ON CONFLICT (scraper_id) DO NOTHING;

-- ─── updated_at trigger for scraper_registry ─────────────────

CREATE OR REPLACE FUNCTION scraper_registry_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS scraper_registry_touch_updated_at ON scraper_registry;
CREATE TRIGGER scraper_registry_touch_updated_at
  BEFORE UPDATE ON scraper_registry
  FOR EACH ROW EXECUTE FUNCTION scraper_registry_touch_updated_at();
