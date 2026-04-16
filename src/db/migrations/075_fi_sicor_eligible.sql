-- ============================================================
-- Migration 075 — SICOR eligibility columns on financial_institutions
-- ============================================================
-- Phase 7a: adds columns to track BACEN SICOR-eligible institutions
-- and their original SICOR segment classification.
-- Also adds a UNIQUE constraint on cnpj for idempotent upserts.

ALTER TABLE financial_institutions
  ADD COLUMN IF NOT EXISTS is_sicor_eligible boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS sicor_segment     text;

-- UNIQUE on cnpj — needed for upsert logic in seed-sicor-ifs.
-- Existing seed rows have NULL cnpj for some entries; partial unique handles that.
CREATE UNIQUE INDEX IF NOT EXISTS idx_fi_cnpj_unique
  ON financial_institutions (cnpj) WHERE cnpj IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_fi_sicor_eligible
  ON financial_institutions (is_sicor_eligible) WHERE is_sicor_eligible = true;
