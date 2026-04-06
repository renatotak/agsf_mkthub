-- ============================================================
-- Migration 021: Re-key satellite tables to entity_uid (Phase 17B)
-- Depends on: 018, 019, 020
-- ============================================================
--
-- Adds nullable `entity_uid uuid` + FK to `legal_entities` on the
-- satellite tables that currently use cnpj_basico / cnpj_raiz text
-- keys. Backfills the new column via JOIN, then indexes it.
--
-- Existing text columns (cnpj_basico / cnpj_raiz) are **kept** for
-- now as secondary keys. They will be dropped in a later phase after
-- the UI and API routes have switched to entity_uid.
--
-- Tables touched:
--   - company_enrichment     (cnpj_basico → entity_uid)
--   - company_notes          (cnpj_basico → entity_uid)
--   - company_research       (cnpj_basico → entity_uid)
--   - retailer_intelligence  (cnpj_raiz   → entity_uid)
--   - retailer_industries    (cnpj_raiz   → entity_uid, industry_id → industry_entity_uid)
-- ============================================================

-- ─── company_enrichment ─────────────────────────────────────
ALTER TABLE company_enrichment
  ADD COLUMN IF NOT EXISTS entity_uid uuid REFERENCES legal_entities(entity_uid) ON DELETE SET NULL;

UPDATE company_enrichment ce
SET entity_uid = le.entity_uid
FROM legal_entities le
WHERE ce.entity_uid IS NULL
  AND le.tax_id = ce.cnpj_basico;

CREATE INDEX IF NOT EXISTS idx_ce_entity_uid ON company_enrichment(entity_uid);

-- ─── company_notes ──────────────────────────────────────────
ALTER TABLE company_notes
  ADD COLUMN IF NOT EXISTS entity_uid uuid REFERENCES legal_entities(entity_uid) ON DELETE CASCADE;

UPDATE company_notes cn
SET entity_uid = le.entity_uid
FROM legal_entities le
WHERE cn.entity_uid IS NULL
  AND le.tax_id = cn.cnpj_basico;

CREATE INDEX IF NOT EXISTS idx_cn_entity_uid ON company_notes(entity_uid);

-- ─── company_research ───────────────────────────────────────
ALTER TABLE company_research
  ADD COLUMN IF NOT EXISTS entity_uid uuid REFERENCES legal_entities(entity_uid) ON DELETE CASCADE;

UPDATE company_research cr
SET entity_uid = le.entity_uid
FROM legal_entities le
WHERE cr.entity_uid IS NULL
  AND le.tax_id = cr.cnpj_basico;

CREATE INDEX IF NOT EXISTS idx_cr_entity_uid ON company_research(entity_uid);

-- ─── retailer_intelligence ──────────────────────────────────
ALTER TABLE retailer_intelligence
  ADD COLUMN IF NOT EXISTS entity_uid uuid REFERENCES legal_entities(entity_uid) ON DELETE CASCADE;

UPDATE retailer_intelligence ri
SET entity_uid = le.entity_uid
FROM legal_entities le
WHERE ri.entity_uid IS NULL
  AND le.tax_id = ri.cnpj_raiz;

CREATE INDEX IF NOT EXISTS idx_ri_entity_uid ON retailer_intelligence(entity_uid);

-- ─── retailer_industries ────────────────────────────────────
-- This table is a junction between a retailer (cnpj_raiz) and an
-- industry (industry_id). Both sides are now legal_entities, so we
-- add two entity_uid columns: one for the retailer side, one for
-- the industry side.

ALTER TABLE retailer_industries
  ADD COLUMN IF NOT EXISTS retailer_entity_uid uuid REFERENCES legal_entities(entity_uid) ON DELETE CASCADE;

ALTER TABLE retailer_industries
  ADD COLUMN IF NOT EXISTS industry_entity_uid uuid REFERENCES legal_entities(entity_uid) ON DELETE CASCADE;

-- Backfill retailer side from legal_entities where tax_id = cnpj_raiz
UPDATE retailer_industries ri
SET retailer_entity_uid = le.entity_uid
FROM legal_entities le
WHERE ri.retailer_entity_uid IS NULL
  AND le.tax_id = ri.cnpj_raiz;

-- Backfill industry side from legal_entities where source_ref = 'industries:<id>'
UPDATE retailer_industries ri
SET industry_entity_uid = le.entity_uid
FROM legal_entities le
WHERE ri.industry_entity_uid IS NULL
  AND le.source_ref = 'industries:' || ri.industry_id;

CREATE INDEX IF NOT EXISTS idx_ri_retailer_entity ON retailer_industries(retailer_entity_uid);
CREATE INDEX IF NOT EXISTS idx_ri_industry_entity ON retailer_industries(industry_entity_uid);

-- ─── Sanity check ────────────────────────────────────────────
DO $$
DECLARE
  n_ce int; n_cn int; n_cr int; n_ri int; n_rind_retailer int; n_rind_industry int;
BEGIN
  SELECT COUNT(*) INTO n_ce FROM company_enrichment WHERE entity_uid IS NOT NULL;
  SELECT COUNT(*) INTO n_cn FROM company_notes WHERE entity_uid IS NOT NULL;
  SELECT COUNT(*) INTO n_cr FROM company_research WHERE entity_uid IS NOT NULL;
  SELECT COUNT(*) INTO n_ri FROM retailer_intelligence WHERE entity_uid IS NOT NULL;
  SELECT COUNT(*) INTO n_rind_retailer FROM retailer_industries WHERE retailer_entity_uid IS NOT NULL;
  SELECT COUNT(*) INTO n_rind_industry FROM retailer_industries WHERE industry_entity_uid IS NOT NULL;
  RAISE NOTICE 'Re-key 021 complete: ce=%, cn=%, cr=%, ri=%, retailer_industries(retailer/industry)=%/%',
    n_ce, n_cn, n_cr, n_ri, n_rind_retailer, n_rind_industry;
END $$;
