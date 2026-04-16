-- ============================================================
-- Migration 074: culture_canonical_inputs — Phase 5a/5b
-- Depends on: 030 (industry_products, active_ingredients)
-- ============================================================
--
-- Canonical product list extracted from Ivan's AMIS soybean
-- market analysis report. Maps the "buyer's journey" — which
-- products are actually used per culture × category, their
-- market position (rank, market share, cost/ha), and strategic
-- alternatives. Links to industry_products + active_ingredients
-- when AGROFIT matches exist.
--
-- One row = one product recommended for one culture/category.
-- ============================================================

CREATE TABLE IF NOT EXISTS culture_canonical_inputs (
  id                  serial PRIMARY KEY,
  culture             text NOT NULL,                        -- e.g. 'soja', 'milho'
  category            text NOT NULL,                        -- e.g. 'fungicida_premium', 'inseticida_percevejo', 'tsi'
  product_name        text NOT NULL,                        -- commercial brand name
  active_ingredient   text,                                 -- main active ingredient(s)
  purpose             text,                                 -- target pest/disease/use
  industry_name       text,                                 -- manufacturer short name (Bayer, Syngenta, etc.)
  industry_entity_uid uuid REFERENCES legal_entities(entity_uid),  -- resolved FK
  region              text,                                 -- optional regional focus
  rank                integer,                              -- position within category (1 = leader)
  market_share_pct    numeric(5,2),                         -- market share within segment
  cost_usd_ha         numeric(8,2),                         -- application cost per hectare (USD)
  source              text NOT NULL DEFAULT 'AMIS 19/20',   -- provenance of the data
  agrofit_product_id  integer REFERENCES industry_products(id),  -- link to AGROFIT bulk data
  ingredient_id       text REFERENCES active_ingredients(ingredient_id),  -- link to molecule master
  confidentiality     text NOT NULL DEFAULT 'public'
    CHECK (confidentiality IN ('public','agrisafe_published','agrisafe_confidential')),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  UNIQUE (culture, category, product_name)
);

CREATE INDEX IF NOT EXISTS idx_cci_culture ON culture_canonical_inputs(culture);
CREATE INDEX IF NOT EXISTS idx_cci_category ON culture_canonical_inputs(category);
CREATE INDEX IF NOT EXISTS idx_cci_industry ON culture_canonical_inputs(industry_name);

ALTER TABLE culture_canonical_inputs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read culture_canonical_inputs"
  ON culture_canonical_inputs FOR SELECT USING (true);

CREATE POLICY "Service role write culture_canonical_inputs"
  ON culture_canonical_inputs FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE culture_canonical_inputs IS
  'Phase 5 canonical product list. Maps which products are actually used per culture×category based on AMIS/Ivan market analysis. Links to AGROFIT bulk data (industry_products) and molecule master (active_ingredients) when matches exist.';
