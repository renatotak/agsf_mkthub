-- ============================================================
-- Migration 025: Backfill entity_mentions from RJ (Phase 17D)
-- Depends on: 018, 019, 020, 024
-- ============================================================
--
-- Populates entity_mentions from recuperacao_judicial. Every RJ row
-- with a valid CNPJ becomes one mention row linking the RJ record to
-- the matching legal_entity (mention_type='subject', sentiment=
-- 'negative' because being in RJ is always a negative signal).
--
-- This backfill is intentionally one-way: we do NOT delete or merge
-- the RJ table. entity_mentions is the cross-cutting graph edge,
-- not a replacement for the source-of-truth RJ feed.
-- ============================================================

WITH rj_matched AS (
  SELECT
    rj.id AS rj_id,
    le.entity_uid
  FROM recuperacao_judicial rj
  JOIN legal_entities le
    ON le.tax_id = substring(regexp_replace(rj.entity_cnpj, '[^0-9]', '', 'g'), 1, 8)
  WHERE rj.entity_cnpj IS NOT NULL
    AND length(regexp_replace(rj.entity_cnpj, '[^0-9]', '', 'g')) >= 8
)
INSERT INTO entity_mentions (
  entity_uid, source_table, source_id, mention_type, sentiment, extracted_by
)
SELECT
  rm.entity_uid,
  'recuperacao_judicial',
  rm.rj_id,
  'subject',
  'negative',
  'backfill_025'
FROM rj_matched rm
ON CONFLICT DO NOTHING;

DO $$
DECLARE n int;
BEGIN
  SELECT COUNT(*) INTO n FROM entity_mentions WHERE source_table='recuperacao_judicial';
  RAISE NOTICE 'entity_mentions backfill 025: % rows for recuperacao_judicial', n;
END $$;
