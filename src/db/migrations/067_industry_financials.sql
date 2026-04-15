-- ============================================================
-- Migration 067: industry_financials — proprietary revenue + market-share
-- ============================================================
-- Annual revenue (US$ millions) and market-share (% of defensives panel)
-- for the major ag-input industries operating in Brazil.
--
-- Source: AgriSafe proprietary dataset (internal compilation). The data
-- is NOT public and is NOT redistributable. Rows default to the
-- `agrisafe_confidential` tier — only authenticated AgriSafe sessions
-- (and, in future, `client_confidential` partners) may read them.
--
-- Time key is `fiscal_year` (int). A compound unique on
-- (industry_id, fiscal_year, source) lets us layer additional series
-- (e.g. a future benchmark source) without overwriting existing rows.
-- ============================================================

CREATE TABLE IF NOT EXISTS industry_financials (
  id               bigserial PRIMARY KEY,
  industry_id      text NOT NULL REFERENCES industries(id) ON DELETE CASCADE,
  fiscal_year      int  NOT NULL CHECK (fiscal_year BETWEEN 1990 AND 2100),
  revenue_usd_millions numeric(10,2),
  market_share_pct     numeric(5,2),                      -- % of defensives panel, e.g. 19.50
  currency             text NOT NULL DEFAULT 'USD',
  source               text NOT NULL DEFAULT 'agrisafe-proprietary',
  source_note          text,
  confidentiality      text NOT NULL DEFAULT 'agrisafe_confidential'
                       CHECK (confidentiality IN ('public','agrisafe_published','agrisafe_confidential','client_confidential')),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (industry_id, fiscal_year, source)
);

CREATE INDEX IF NOT EXISTS idx_ind_fin_industry  ON industry_financials(industry_id);
CREATE INDEX IF NOT EXISTS idx_ind_fin_year      ON industry_financials(fiscal_year DESC);
CREATE INDEX IF NOT EXISTS idx_ind_fin_conf      ON industry_financials(confidentiality);

ALTER TABLE industry_financials ENABLE ROW LEVEL SECURITY;

-- Public tier sees nothing here — the default rows are confidential.
-- Authenticated AgriSafe sessions read via service role in API routes
-- (which already pass `visibleTiers(tier)` through the filter).
CREATE POLICY "tier_read_industry_financials" ON industry_financials
  FOR SELECT USING (confidentiality = 'public');

CREATE POLICY "service_write_industry_financials" ON industry_financials
  FOR ALL USING (auth.role() = 'service_role');

COMMENT ON TABLE  industry_financials IS
  'Annual revenue (US$ m) and market-share (%) per industry. AgriSafe proprietary dataset (mig 067). Default tier: agrisafe_confidential.';
COMMENT ON COLUMN industry_financials.revenue_usd_millions IS 'Annual revenue in US$ millions. NULL when not disclosed for that year.';
COMMENT ON COLUMN industry_financials.market_share_pct IS 'Share of the reference defensives panel, expressed as a percent (19.50 = 19.5%).';
COMMENT ON COLUMN industry_financials.source IS 'Data-source tag. Default agrisafe-proprietary. Future sources may coexist via the (industry_id, fiscal_year, source) unique.';
