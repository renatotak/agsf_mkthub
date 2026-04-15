-- ============================================================
-- Migration 063 — Financial Institutions directory
-- ============================================================
-- Stores banks, cooperative banks, FIDCs, FIAGROs, development
-- banks, fintechs, and CRA issuers active in agribusiness credit.

CREATE TABLE IF NOT EXISTS financial_institutions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_uid            uuid REFERENCES legal_entities(entity_uid),
  name                  text NOT NULL,
  short_name            text,
  institution_type      text NOT NULL,  -- bank, cooperative_bank, fidc, fiagro, development_bank, fintech, cra_issuer
  cnpj                  text,
  bcb_code              text,
  headquarters_uf       text,
  headquarters_city     text,
  active_rural_credit   boolean DEFAULT true,
  rural_credit_volume_brl numeric,
  specialties           text[],         -- e.g. '{cpr,fiagro,custeio,investimento}'
  website               text,
  notes                 text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_fi_institution_type ON financial_institutions (institution_type);
CREATE INDEX IF NOT EXISTS idx_fi_cnpj             ON financial_institutions (cnpj);
CREATE INDEX IF NOT EXISTS idx_fi_entity_uid       ON financial_institutions (entity_uid);

-- RLS: public read, service-role write
ALTER TABLE financial_institutions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read_financial_institutions"
  ON financial_institutions FOR SELECT
  USING (true);

CREATE POLICY "service_role_write_financial_institutions"
  ON financial_institutions FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
