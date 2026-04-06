-- ============================================================
-- Migration 026: Add entity_uid to recuperacao_judicial (Phase 17F)
-- Depends on: 018, 019, 020, 024, 025
-- ============================================================
--
-- Mirrors migration 024 for retailers. Adds a direct FK from RJ rows
-- to legal_entities so the existing select("*") in the
-- RecuperacaoJudicial UI automatically carries entity_uid for any
-- future drill-down. Backfilled via the same CNPJ-basico match the
-- entity_mentions writer (025) used.
-- ============================================================

ALTER TABLE recuperacao_judicial
  ADD COLUMN IF NOT EXISTS entity_uid uuid REFERENCES legal_entities(entity_uid) ON DELETE SET NULL;

UPDATE recuperacao_judicial rj
SET entity_uid = le.entity_uid
FROM legal_entities le
WHERE rj.entity_uid IS NULL
  AND rj.entity_cnpj IS NOT NULL
  AND le.tax_id = substring(regexp_replace(rj.entity_cnpj, '[^0-9]', '', 'g'), 1, 8);

CREATE INDEX IF NOT EXISTS idx_rj_entity_uid ON recuperacao_judicial(entity_uid);

COMMENT ON COLUMN recuperacao_judicial.entity_uid IS
  'FK to legal_entities, backfilled from substring(entity_cnpj,1,8) match. Mirrors retailers.entity_uid (mig 024).';
