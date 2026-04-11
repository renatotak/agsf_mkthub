-- ============================================================
-- Migration 046 — Phase 26 Market Pulse expansion
-- Depends on: 027 (scraper_registry), 028 (macro_statistics)
-- ============================================================
--
-- Registers four new macro_statistics scrapers that expand the Pulso
-- do Mercado → Contexto Macro tab:
--
--   1. sync-faostat-livestock — FAOSTAT QL domain (cattle/chicken/swine
--      production), closes the boi-gordo gap noted in faostat-codes.ts
--   2. sync-usda-psd          — USDA FAS PSD Online CSV ZIPs (oilseeds,
--      grains, cotton supply/demand by country)
--   3. sync-conab-safra       — CONAB Série Histórica de Safras XLS
--      (Brazilian grain production/area/yield by crop)
--   4. sync-mdic-comexstat    — MDIC ComexStat REST API (Brazilian
--      agro export volumes + FOB values per NCM)
--
-- All four write to macro_statistics with the standard
-- (source_id, commodity, region, indicator, period) conflict key, so
-- re-runs are idempotent.
-- ============================================================

-- ─── 1. FAOSTAT livestock ────────────────────────────────────
INSERT INTO scraper_registry (
  scraper_id, name, description, source_id, kind, target_table,
  cadence, grace_period_hours, schema_check, expected_min_rows,
  owner, notes
) VALUES (
  'sync-faostat-livestock',
  'FAOSTAT Livestock Production',
  'Pulls last 5 years of livestock production (cattle, chicken, swine, dairy) from the FAOSTAT QL JSON API for World, Brazil, Argentina, USA, China, India, Australia. Companion to sync-faostat-prod (crops). Phase 26.',
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
      "source_id": ["faostat_livestock"],
      "category": ["production", "trade"],
      "indicator": ["production", "producing_animals"]
    }
  }'::jsonb,
  10,
  'agrisafe-mkthub',
  'FAOSTAT v1 REST: https://fenixservices.fao.org/faostat/api/v1/en/data/QL — area/item/element codes mapped algorithmically in src/lib/macro/faostat-livestock-codes.ts'
)
ON CONFLICT (scraper_id) DO NOTHING;

-- ─── 2. USDA FAS PSD Online ──────────────────────────────────
INSERT INTO scraper_registry (
  scraper_id, name, description, source_id, kind, target_table,
  cadence, grace_period_hours, schema_check, expected_min_rows,
  owner, notes
) VALUES (
  'sync-usda-psd',
  'USDA FAS PSD Online',
  'Pulls country-level Production/Supply/Distribution data for soybeans, corn, wheat, cotton, rice from three USDA PSD CSV ZIP downloads (oilseeds, grains, cotton). Filtered to last 5 marketing years and key producer countries. Phase 26.',
  'src-macro-1',
  'csv',
  'macro_statistics',
  'weekly',
  192,
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
      "source_id": ["usda_psd"],
      "category": ["production", "trade"],
      "indicator": ["production", "exports", "imports", "ending_stocks"]
    }
  }'::jsonb,
  20,
  'agrisafe-mkthub',
  'CSV ZIPs at https://apps.fas.usda.gov/psdonline/downloads/psd_<group>_csv.zip — parsed inline with adm-zip. Commodity/country/attribute codes mapped in src/lib/macro/usda-psd-codes.ts'
)
ON CONFLICT (scraper_id) DO NOTHING;

-- ─── 3. CONAB Série Histórica de Safras ──────────────────────
INSERT INTO scraper_registry (
  scraper_id, name, description, source_id, kind, target_table,
  cadence, grace_period_hours, schema_check, expected_min_rows,
  owner, notes
) VALUES (
  'sync-conab-safra',
  'CONAB Série Histórica de Safras',
  'Parses the Brazilian Série Histórica de Safras XLS workbook published by CONAB. One sheet per crop; we extract production, area planted and yield for the last 5 safras and emit one macro_statistics row per (commodity, indicator, period) with region=Brazil. Phase 26.',
  'src-macro-5',
  'xlsx',
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
      "source_id": ["conab"],
      "category": ["production"],
      "indicator": ["production", "area_planted", "yield"]
    }
  }'::jsonb,
  5,
  'agrisafe-mkthub',
  'XLS at https://portaldeinformacoes.conab.gov.br/downloads/arquivos/SerieHistoricaGraos.xls — sheet/column mapping is heuristic (header detection by safra+indicator keywords) so it survives minor layout changes.'
)
ON CONFLICT (scraper_id) DO NOTHING;

-- ─── 4. MDIC ComexStat ───────────────────────────────────────
INSERT INTO scraper_registry (
  scraper_id, name, description, source_id, kind, target_table,
  cadence, grace_period_hours, schema_check, expected_min_rows,
  owner, notes
) VALUES (
  'sync-mdic-comexstat',
  'MDIC ComexStat — Brazilian Agro Exports',
  'Posts an annual NCM-filtered query to the public ComexStat REST API and aggregates the response into one macro_statistics row per (commodity, indicator, year). Indicators: exports_volume (kg) and exports_value (FOB USD). Covers soybeans, corn, coffee, sugar, cotton, beef, poultry, pork, soy oil, soy meal. Phase 26.',
  'src-macro-4',
  'api',
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
      "value": { "min": 0, "max": 1000000000000000 }
    },
    "enum_values": {
      "source_id": ["mdic_comexstat"],
      "region": ["Brazil"],
      "category": ["trade"],
      "indicator": ["exports_volume", "exports_value"]
    }
  }'::jsonb,
  10,
  'agrisafe-mkthub',
  'POST https://api.comexstat.mdic.gov.br/general — NCM 4-digit prefixes mapped to commodity slugs in src/lib/macro/mdic-comexstat-codes.ts'
)
ON CONFLICT (scraper_id) DO NOTHING;
