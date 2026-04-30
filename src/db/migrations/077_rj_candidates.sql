-- ============================================================
-- Migration 077 — Phase 29 RJ candidates table
-- Depends on: 019 (entity_mentions), 052 (legal_entities.entity_uid UNIQUE),
--             001 (recuperacao_judicial)
-- ============================================================
--
-- Replaces the abandoned Serasa CSV backfill. Surfaces companies that
-- appear in agro_news with RJ / falência keywords but are NOT yet in
-- the canonical recuperacao_judicial table. The user reviews each
-- candidate and either promotes to a full RJ record or rejects.
--
-- Discovery job:        src/jobs/sync-rj-candidates.ts (weekly Sunday)
-- Read API:             src/app/api/rj-candidates/route.ts
-- ============================================================

CREATE TABLE IF NOT EXISTS rj_candidates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_uid      uuid NOT NULL REFERENCES legal_entities(entity_uid) ON DELETE CASCADE,
  news_id         text NOT NULL REFERENCES agro_news(id) ON DELETE CASCADE,
  news_snippet    text NOT NULL,
  news_published_at timestamptz,
  keyword_match   text NOT NULL,           -- which regex pattern matched
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'accepted', 'rejected')),
  detected_at     timestamptz NOT NULL DEFAULT now(),
  resolved_at     timestamptz,
  resolved_by     text,                    -- user email OR 'cron:auto-promoted'
  notes           text,
  -- Each (entity, news) pair is surfaced at most once. Re-running discovery
  -- updates news_snippet / keyword_match if needed but never duplicates.
  UNIQUE (entity_uid, news_id),
  -- RLS-friendly default
  confidentiality text NOT NULL DEFAULT 'public'
                  CHECK (confidentiality IN ('public','agrisafe_published','agrisafe_confidential','client_confidential'))
);

CREATE INDEX IF NOT EXISTS idx_rjcand_status ON rj_candidates(status);
CREATE INDEX IF NOT EXISTS idx_rjcand_entity ON rj_candidates(entity_uid);
CREATE INDEX IF NOT EXISTS idx_rjcand_detected ON rj_candidates(detected_at DESC);

ALTER TABLE rj_candidates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read_rj_candidates"
  ON rj_candidates FOR SELECT USING (true);

CREATE POLICY "service_write_rj_candidates"
  ON rj_candidates FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE rj_candidates IS
  'Phase 29: companies surfaced by sync-rj-candidates from agro_news×entity_mentions cross-reference. Pending until user accepts (promotes to recuperacao_judicial) or rejects. Replaces abandoned Serasa CSV approach.';

COMMENT ON COLUMN rj_candidates.keyword_match IS
  'Which regex pattern triggered this candidate: rj_filing | rj_approved | falencia | dip | similar.';

-- Note: sync-rj-candidates is a pure-Postgres derived job (no external
-- HTTP scraping). Per existing convention (sync-knowledge-agents,
-- sync-oracle-insights, sync-daily-briefing all skip scraper_registry),
-- it does not register here. Observability comes via sync_logs +
-- activity_log inside the job module itself.
