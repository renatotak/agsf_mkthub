-- ============================================================
-- Migration 076 — Phase 29 OECD-FAO Agricultural Outlook scraper
-- Depends on: 027 (scraper_registry), 028 (macro_statistics)
-- ============================================================
--
-- Registers the new sync-oecd scraper that pulls the OECD-FAO Agricultural
-- Outlook 10-year projection (production / consumption / exports / imports
-- by country and commodity) from the public OECD SDMX REST endpoint.
--
-- Job module: src/jobs/sync-oecd.ts
-- Codes file: src/lib/macro/oecd-outlook-codes.ts
-- Cron route: src/app/api/cron/sync-oecd/route.ts
-- Orchestrator: weekly_only on Sunday (registered in src/jobs/sync-orchestrator.ts)
--
-- Writes to macro_statistics with the standard
-- (source_id, commodity, region, indicator, period) conflict key.
-- ============================================================

INSERT INTO scraper_registry (
  scraper_id, name, description, source_id, kind, target_table,
  cadence, grace_period_hours, schema_check, expected_min_rows,
  owner, notes
) VALUES (
  'sync-oecd',
  'OECD-FAO Agricultural Outlook',
  'Pulls 10-year projections (production, consumption, exports, imports) for major commodities (wheat, maize, soybeans, rice, sugar, cotton, oilseeds, coarse grains) from the OECD-FAO Agricultural Outlook SDMX dataset (DSD_AGR@DF_OUTLOOK_2023_2032). Country allowlist: BRA, WLD, OECD, USA, ARG, CHN, IND, AUS, EUR. Phase 29.',
  'src-macro-3',
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
      "source_id": ["oecd_outlook"],
      "category": ["oecd_outlook_production", "oecd_outlook_consumption", "oecd_outlook_trade"],
      "indicator": ["production", "consumption", "exports", "imports"]
    }
  }'::jsonb,
  10,
  'agrisafe-mkthub',
  'CSV at https://sdmx.oecd.org/public/rest/data/OECD.TAD.ATM,DSD_AGR@DF_OUTLOOK_2023_2032/?format=csvfile — REF_AREA / COMMODITY / MEASURE / UNIT_MEASURE codes mapped algorithmically in src/lib/macro/oecd-outlook-codes.ts. Window = 3 historical + 5 projection years.'
)
ON CONFLICT (scraper_id) DO NOTHING;
