-- ============================================================
-- Migration 078 — meeting entity match confidence column
-- Depends on: 041 (crm_tables — meetings table)
--             056 (crm_meeting_views — v_meetings_enriched)
-- Phase: CRM entity re-matcher
-- ============================================================
--
-- 1. Adds an `entity_match_confidence` column to `meetings` so the
--    re-match job can flag rows that need human review without
--    overwriting entity_uid on uncertain matches.
--
-- Values:
--   auto          — high-confidence auto-match (score > 0.85)
--   needs_review  — ambiguous match (score 0.5..0.85)
--   no_match      — no suitable candidate found (score < 0.5)
--   manual        — user confirmed or manually assigned
--
-- NULL means the row has never been through the matcher (pre-migration
-- rows and manually created rows with a known entity_uid).
--
-- 2. Rebuilds v_meetings_enriched to expose entity_match_confidence
--    so the MeetingsLog UI can show the badge without extra round-trips.
-- ============================================================

-- ─── 1. Add column ──────────────────────────────────────────────────

ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS entity_match_confidence text
    CHECK (entity_match_confidence IN ('auto', 'needs_review', 'no_match', 'manual'));

COMMENT ON COLUMN meetings.entity_match_confidence IS
  'Populated by /api/crm/meetings/rematch: auto=high-confidence auto-match, needs_review=ambiguous, no_match=no candidate found, manual=user-confirmed or manually created.';

-- Index to let the rematch job efficiently find rows that need re-processing.
CREATE INDEX IF NOT EXISTS idx_meetings_match_confidence
  ON meetings(entity_match_confidence)
  WHERE entity_match_confidence IN ('needs_review', 'no_match');

-- Index to find meetings that have never been through the rematch pipeline.
-- Targets onenote imports that have not yet received a confidence score.
CREATE INDEX IF NOT EXISTS idx_meetings_onenote_unreviewed
  ON meetings(id)
  WHERE source = 'onenote_import' AND entity_match_confidence IS NULL;

-- ─── 2. Rebuild v_meetings_enriched ─────────────────────────────────
-- Adds entity_match_confidence to the flat projection.
-- Security invoker is preserved from the original view (mig 056).

DROP VIEW IF EXISTS v_meetings_enriched;

CREATE VIEW v_meetings_enriched
WITH (security_invoker = on) AS
SELECT
  m.id,
  m.entity_uid,
  le.display_name                    AS entity_name,
  le.legal_name                      AS entity_legal_name,
  le.tax_id                          AS entity_tax_id,
  (SELECT array_agg(er.role_type ORDER BY er.role_type)
     FROM entity_roles er
     WHERE er.entity_uid = m.entity_uid)        AS entity_roles,
  m.meeting_date,
  m.meeting_type,
  m.attendees,
  m.agenda,
  m.summary,
  m.next_steps,
  m.outcome,
  m.source,
  m.external_id,
  m.confidentiality,
  m.entity_match_confidence,
  m.created_at,
  m.updated_at,
  -- Flattened metadata (OneNote-imported rows) — arrays may be null
  -- for manually-entered meetings, the UI handles that.
  COALESCE(
    (SELECT array_agg(v::text)
       FROM jsonb_array_elements_text(m.metadata -> 'competitor_tech') v),
    ARRAY[]::text[]
  )                                  AS competitor_tech,
  COALESCE(
    (SELECT array_agg(v::text)
       FROM jsonb_array_elements_text(m.metadata -> 'service_interest') v),
    ARRAY[]::text[]
  )                                  AS service_interest,
  m.metadata ->> 'financial_info'    AS financial_info,
  m.metadata ->> 'mood'              AS mood,
  m.metadata ->> 'plans'             AS plans,
  m.metadata ->> 'import_source'     AS import_source
FROM meetings m
JOIN legal_entities le ON le.entity_uid = m.entity_uid;

COMMENT ON VIEW v_meetings_enriched IS
  'Flat projection of meetings with metadata jsonb unpacked + entity name joined. Powers the cross-entity Meeting Log and the /api/crm/meetings/feed endpoint. Updated in mig 078 to expose entity_match_confidence.';
