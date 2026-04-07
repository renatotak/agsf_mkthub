-- ============================================================
-- Migration 029: Extend FAOSTAT scraper coverage (Phase 19B)
-- Depends on: 028
-- ============================================================
--
-- Phase 19B initially shipped FAOSTAT for soybeans + maize only.
-- This migration widens the coverage to coffee, wheat, cotton, and
-- sugar cane so the Pulso do Mercado Contexto Macro tab works for
-- all CULTURES slugs except boi-gordo (which lives in FAOSTAT's QL
-- livestock domain — separate scraper, deferred slice).
--
-- The actual code mapping lives in src/lib/macro/faostat-codes.ts.
-- This migration only refreshes the registry metadata so the
-- expected_min_rows + notes match the new coverage. The schema_check
-- itself is unchanged (the row shape did not change — just more rows).
-- ============================================================

UPDATE scraper_registry
SET
  expected_min_rows = 30,
  notes = 'FAOSTAT v1 REST: https://fenixservices.fao.org/faostat/api/v1/en/data/QCL — area/item/element codes mapped algorithmically in src/lib/macro/faostat-codes.ts. Coverage: soybean, corn, coffee, wheat, cotton, sugar cane × Brazil/Argentina/USA/China/World × production+exports × last 5 years.',
  description = 'Pulls last 5 years of crop production + export quantity from the FAOSTAT JSON API for World, Brazil, Argentina, USA, China — soybeans, maize, coffee, wheat, cotton, sugar cane. Backs the Pulso do Mercado Contexto Macro sub-tab.'
WHERE scraper_id = 'sync-faostat-prod';
