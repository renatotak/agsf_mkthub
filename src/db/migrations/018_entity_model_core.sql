-- ============================================================
-- Migration 018: 5 Core Node Tables (Phase 17A)
-- Foundation of the locked entity model — see docs/ENTITY_MODEL.md
-- ============================================================
--
-- This migration creates the 5 canonical nodes that every feature
-- in the AgriSafe Market Hub resolves back to. NO data is moved
-- yet — backfill happens in migration 020.
--
-- 1. legal_entities            — universal actor (CPF or CNPJ)
-- 2. farms                     — physical land units (CAR / INCRA / centroid)
-- 3. assets                    — financial instruments (CPR, loan, note, ...)
-- 4. commercial_activities     — sales, barters, trades
-- 5. agrisafe_service_contracts — AgriSafe service contracts (monitoring, collection, ...)
--
-- All tables use uuid PKs generated server-side, RLS enabled with
-- public-read + service-role-write, and a `confidentiality` column
-- where proprietary data may live.
-- ============================================================

-- Ensure required extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── 1. legal_entities ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS legal_entities (
  entity_uid    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tax_id        text UNIQUE NOT NULL,
  tax_id_type   text NOT NULL CHECK (tax_id_type IN ('cpf','cnpj')),
  -- Generated 8-digit CNPJ root for fast joins with existing `cnpj_raiz` columns
  cnpj_basico   text GENERATED ALWAYS AS (
    CASE WHEN tax_id_type='cnpj' AND length(tax_id) >= 8 THEN substring(tax_id, 1, 8) ELSE NULL END
  ) STORED,
  legal_name    text,
  display_name  text,
  confidentiality text NOT NULL DEFAULT 'public'
    CHECK (confidentiality IN ('public','agrisafe_published','agrisafe_confidential','client_confidential')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_le_cnpj_basico
  ON legal_entities(cnpj_basico)
  WHERE cnpj_basico IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_le_tax_id_type ON legal_entities(tax_id_type);

ALTER TABLE legal_entities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_legal_entities" ON legal_entities;
CREATE POLICY "public_read_legal_entities" ON legal_entities
  FOR SELECT USING (confidentiality = 'public');

DROP POLICY IF EXISTS "service_write_legal_entities" ON legal_entities;
CREATE POLICY "service_write_legal_entities" ON legal_entities
  FOR ALL USING (auth.role() = 'service_role');

COMMENT ON TABLE legal_entities IS
  'Universal actor — one row per CPF or CNPJ. The root of the 5-entity model. See docs/ENTITY_MODEL.md.';
COMMENT ON COLUMN legal_entities.cnpj_basico IS
  'Generated 8-digit CNPJ root for fast joins with legacy cnpj_raiz text columns.';

-- ─── 2. farms ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS farms (
  farm_uid        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  car_code        text UNIQUE,
  incra_code      text UNIQUE,
  centroid_lat    numeric(9,6),
  centroid_lng    numeric(9,6),
  area_ha         numeric(12,2),
  uf              char(2),
  municipio       text,
  name            text,
  confidentiality text NOT NULL DEFAULT 'public'
    CHECK (confidentiality IN ('public','agrisafe_published','agrisafe_confidential','client_confidential')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_farms_uf ON farms(uf);
CREATE INDEX IF NOT EXISTS idx_farms_car ON farms(car_code) WHERE car_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_farms_incra ON farms(incra_code) WHERE incra_code IS NOT NULL;

ALTER TABLE farms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_farms" ON farms;
CREATE POLICY "public_read_farms" ON farms
  FOR SELECT USING (confidentiality = 'public');

DROP POLICY IF EXISTS "service_write_farms" ON farms;
CREATE POLICY "service_write_farms" ON farms
  FOR ALL USING (auth.role() = 'service_role');

COMMENT ON TABLE farms IS
  'Physical land unit. Identified by CAR (Cadastro Ambiental Rural), INCRA SNCR code, or geo-centroid. Multi-shareholder ownership via farm_ownership junction.';

-- ─── 3. assets ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS assets (
  asset_uid       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_type      text NOT NULL
    CHECK (asset_type IN ('cpr','loan','commercial_note','insurance','barter','other')),
  amount          numeric(18,2),
  currency        text NOT NULL DEFAULT 'BRL',
  start_date      date,
  maturity_date   date,
  farm_uid        uuid REFERENCES farms(farm_uid) ON DELETE SET NULL,
  commodity_id    text,
  status          text NOT NULL DEFAULT 'active',
  confidentiality text NOT NULL DEFAULT 'public'
    CHECK (confidentiality IN ('public','agrisafe_published','agrisafe_confidential','client_confidential')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assets_type ON assets(asset_type);
CREATE INDEX IF NOT EXISTS idx_assets_farm ON assets(farm_uid) WHERE farm_uid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_assets_maturity ON assets(maturity_date);

ALTER TABLE assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_assets" ON assets;
CREATE POLICY "public_read_assets" ON assets
  FOR SELECT USING (confidentiality = 'public');

DROP POLICY IF EXISTS "service_write_assets" ON assets;
CREATE POLICY "service_write_assets" ON assets
  FOR ALL USING (auth.role() = 'service_role');

COMMENT ON TABLE assets IS
  'Financial instruments: CPR, loan, commercial note, insurance, barter. Multi-party stakeholders via asset_parties junction.';

-- ─── 4. commercial_activities ────────────────────────────────

CREATE TABLE IF NOT EXISTS commercial_activities (
  activity_uid        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_type       text NOT NULL
    CHECK (activity_type IN ('ag_input_sale','barter','grain_trade','livestock_sale','other')),
  retailer_entity_uid uuid REFERENCES legal_entities(entity_uid) ON DELETE SET NULL,
  buyer_entity_uid    uuid REFERENCES legal_entities(entity_uid) ON DELETE SET NULL,
  farm_uid            uuid REFERENCES farms(farm_uid) ON DELETE SET NULL,
  product_id          text,
  quantity            numeric(18,2),
  unit                text,
  value               numeric(18,2),
  currency            text NOT NULL DEFAULT 'BRL',
  date                date,
  confidentiality     text NOT NULL DEFAULT 'public'
    CHECK (confidentiality IN ('public','agrisafe_published','agrisafe_confidential','client_confidential')),
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ca_type ON commercial_activities(activity_type);
CREATE INDEX IF NOT EXISTS idx_ca_retailer ON commercial_activities(retailer_entity_uid);
CREATE INDEX IF NOT EXISTS idx_ca_buyer ON commercial_activities(buyer_entity_uid);
CREATE INDEX IF NOT EXISTS idx_ca_date ON commercial_activities(date DESC);

ALTER TABLE commercial_activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_commercial_activities" ON commercial_activities;
CREATE POLICY "public_read_commercial_activities" ON commercial_activities
  FOR SELECT USING (confidentiality = 'public');

DROP POLICY IF EXISTS "service_write_commercial_activities" ON commercial_activities;
CREATE POLICY "service_write_commercial_activities" ON commercial_activities
  FOR ALL USING (auth.role() = 'service_role');

COMMENT ON TABLE commercial_activities IS
  'Commercial transactions: ag-input sale, barter, grain trade, livestock sale. Always links retailer -> buyer -> farm -> product.';

-- ─── 5. agrisafe_service_contracts ───────────────────────────
-- NOTE: the FK to groups() is added in migration 019 (after groups exists).

CREATE TABLE IF NOT EXISTS agrisafe_service_contracts (
  service_uid       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_type      text NOT NULL
    CHECK (service_type IN ('credit_intelligence','monitoring','collection','market_hub_access','custom')),
  -- client_group_uid FK added in migration 019 after groups table exists
  client_group_uid  uuid,
  start_date        date,
  end_date          date,
  status            text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','paused','ended')),
  confidentiality   text NOT NULL DEFAULT 'agrisafe_confidential'
    CHECK (confidentiality IN ('public','agrisafe_published','agrisafe_confidential','client_confidential')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_asc_type ON agrisafe_service_contracts(service_type);
CREATE INDEX IF NOT EXISTS idx_asc_status ON agrisafe_service_contracts(status);
CREATE INDEX IF NOT EXISTS idx_asc_client ON agrisafe_service_contracts(client_group_uid);

ALTER TABLE agrisafe_service_contracts ENABLE ROW LEVEL SECURITY;

-- Service contracts are agrisafe_confidential by default — no public read
DROP POLICY IF EXISTS "service_all_asc" ON agrisafe_service_contracts;
CREATE POLICY "service_all_asc" ON agrisafe_service_contracts
  FOR ALL USING (auth.role() = 'service_role');

COMMENT ON TABLE agrisafe_service_contracts IS
  'AgriSafe service contracts (credit intelligence, monitoring, collection, market_hub_access). Client side is always a Group (junction in 019). Targets are polymorphic via agrisafe_service_targets.';
