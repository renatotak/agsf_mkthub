-- ============================================================
-- Migration 028: macro_statistics table (Phase 19B)
-- Depends on: 027 (scraper_registry seed for sync-faostat-prod)
-- ============================================================
--
-- Backing store for the Pulso do Mercado "Contexto Macro" sub-tab.
-- Holds higher-latency macro data from official agencies (FAOSTAT,
-- USDA WASDE, OECD-FAO Outlook, MDIC ComexStat, CONAB Safra, World
-- Bank Pink Sheet) — see ROADMAP Phase 19.
--
-- ENTITY-MODEL CARVE-OUT (guardrail #2 from CLAUDE.md):
-- This table has NO foreign key to legal_entities, farms, assets,
-- commercial_activities, or agrisafe_service_contracts. Macro
-- statistics are commodity-dimension aggregates (world/country totals
-- of production, exports, stocks), not records about a specific
-- actor. The `commodity NOT NULL` constraint enforces the dimension
-- and prevents accidental misuse for entity-keyed data. Cross-cutting
-- queries that need to relate macro context to a company should join
-- on commodity, not on entity_uid.
--
-- The schema mirrors the upsert payload in src/scripts/scrape_macro.py
-- (now DEPRECATED — TS scraper at /api/cron/sync-faostat is the writer).
-- ============================================================

CREATE TABLE IF NOT EXISTS macro_statistics (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id       text NOT NULL,            -- 'faostat' | 'usda_wasde' | 'pinksheet' | 'conab' | ...
  category        text NOT NULL,            -- 'production' | 'trade' | 'price_index' | 'projection'
  commodity       text NOT NULL,            -- enforces commodity-dimension; see header
  region          text NOT NULL,            -- 'World' | 'Brazil' | 'Argentina' | 'United States' | ...
  indicator       text NOT NULL,            -- 'production' | 'exports' | 'ending_stocks' | 'price_index' | ...
  value           numeric NOT NULL,
  unit            text NOT NULL,            -- 'tonnes' | 'million_metric_tons' | 'USD' | 'index' | ...
  period          text NOT NULL,            -- '2024' | '2025/26'
  reference_date  date NOT NULL,
  metadata        jsonb DEFAULT '{}'::jsonb,
  confidentiality text NOT NULL DEFAULT 'public'
                    CHECK (confidentiality IN ('public','agrisafe_published','agrisafe_confidential')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_id, commodity, region, indicator, period)
);

CREATE INDEX IF NOT EXISTS idx_macro_stats_commodity_indicator
  ON macro_statistics(commodity, indicator, reference_date DESC);
CREATE INDEX IF NOT EXISTS idx_macro_stats_source ON macro_statistics(source_id);
CREATE INDEX IF NOT EXISTS idx_macro_stats_region ON macro_statistics(region);

ALTER TABLE macro_statistics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read macro_statistics"
  ON macro_statistics FOR SELECT USING (true);

CREATE POLICY "Service role write macro_statistics"
  ON macro_statistics FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE macro_statistics IS
  'Macro / aggregate agricultural statistics from official agencies (FAOSTAT, USDA WASDE, OECD-FAO Outlook, World Bank Pink Sheet, MDIC ComexStat, CONAB Safra). Commodity-dimension — NO entity FK by design. See migration 028 header for the guardrail #2 carve-out.';

-- ─── Seed: FAOSTAT crop-production scraper ───────────────────
-- Creates the scraper_registry row consumed by
-- /api/cron/sync-faostat. The schema_check is enforced by
-- src/lib/scraper-runner.ts validatePayload() — no LLM in the loop.

INSERT INTO scraper_registry (
  scraper_id, name, description, source_id, kind, target_table,
  cadence, grace_period_hours, schema_check, expected_min_rows,
  owner, notes
) VALUES (
  'sync-faostat-prod',
  'FAOSTAT Crop Production',
  'Pulls last 5 years of crop production + export quantity from the FAOSTAT JSON API for World, Brazil, Argentina, USA, China — soybeans and maize. Backs the Pulso do Mercado Contexto Macro sub-tab.',
  'src-macro-2',
  'json',
  'macro_statistics',
  'monthly',
  96,
  '{
    "required_keys": ["source_id", "category", "commodity", "region", "indicator", "value", "unit", "period", "reference_date"],
    "sample_row": {
      "source_id": "string",
      "category": "string",
      "commodity": "string",
      "region": "string",
      "indicator": "string",
      "value": "number",
      "unit": "string",
      "period": "string",
      "reference_date": "string"
    },
    "numeric_ranges": {
      "value": { "min": 0, "max": 1000000000000 }
    },
    "enum_values": {
      "category": ["production", "trade", "price_index", "projection"],
      "indicator": ["production", "exports", "imports", "ending_stocks", "price_index", "yield"]
    }
  }'::jsonb,
  10,
  'agrisafe-mkthub',
  'FAOSTAT v1 REST: https://fenixservices.fao.org/faostat/api/v1/en/data/QCL — area/item/element codes mapped algorithmically in src/lib/macro/faostat-codes.ts'
)
ON CONFLICT (scraper_id) DO NOTHING;
