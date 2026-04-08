-- ============================================================
-- Migration 038 — Register World Bank Pink Sheet scraper
-- Depends on: 027 (scraper_registry), 028 (macro_statistics)
-- ============================================================
--
-- Phase 24E adds a World Bank Pink Sheet annual prices scraper to the
-- Pulso do Mercado → Contexto Macro tab. Complements the existing
-- sync-faostat-prod scraper (which writes production + exports per
-- country) by adding the **price** dimension at world level.
--
-- One row per (commodity, year) for the last 15 years. Pure XLSX parse,
-- no LLM, no regex on prose.
-- ============================================================

INSERT INTO scraper_registry (
  scraper_id, name, description, source_id, kind, target_table,
  cadence, grace_period_hours, schema_check, expected_min_rows,
  owner, notes
) VALUES (
  'sync-worldbank-prices',
  'World Bank Pink Sheet Annual Prices',
  'Parses the World Bank Commodity Markets Outlook (CMO) annual Pink Sheet xlsx, mapping fixed columns to AgriSafe commodity slugs (cafe, soja, milho, trigo, acucar, algodao). Writes the last 15 years per commodity into macro_statistics with source_id=worldbank_pinksheet, region=World, indicator=price. Phase 24E.',
  'worldbank.org',
  'xlsx',
  'macro_statistics',
  'monthly',
  720,
  '{
    "required_keys": ["source_id","category","commodity","region","indicator","value","unit","period","reference_date"],
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
    "enum_values": {
      "source_id": ["worldbank_pinksheet"],
      "region": ["World"],
      "indicator": ["price"]
    }
  }'::jsonb,
  60,
  'agrisafe-mkthub',
  '6 commodities × 15 years = 90 rows per run. Header-row sanity check inside the route catches column drift before insert. The Pink Sheet xlsx is updated monthly by World Bank but only one new annual row appears per year, so monthly cadence is intentionally cheap and idempotent via the macro_statistics UNIQUE constraint.'
)
ON CONFLICT (scraper_id) DO NOTHING;
