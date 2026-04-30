-- ============================================================
-- Migration 078 — ADAPAR Paraná state-level ag-input registry
-- Depends on: 049 (industry_products UNIQUE agrofit_registro),
--             027 (scraper_registry)
-- ============================================================
--
-- Adds a partial unique index so state-registry rows can be
-- upserted without collision against the federal agrofit rows
-- (which use agrofit_registro as their conflict key).
--
-- State registries may have NULL agrofit_registro, so we key
-- deduplication on (source_dataset, product_name) instead.
--
-- Job module: src/jobs/sync-adapar-parana.ts
-- Cron route: src/app/api/cron/sync-adapar-parana/route.ts
-- Orchestrator: weekly_only on Sunday
-- ============================================================

-- Unique within a source_dataset for state-level registries
-- (agrofit_registro may be null for state-issued products)
CREATE UNIQUE INDEX IF NOT EXISTS uq_ip_state_product
  ON industry_products (source_dataset, product_name)
  WHERE source_dataset IS NOT NULL AND source_dataset != 'agrofit';

-- Register the scraper in the health-check registry
INSERT INTO scraper_registry (name, label, target_table, kind, description)
VALUES (
  'sync-adapar-parana',
  'ADAPAR Paraná — Agrotóxicos Registrados',
  'industry_products',
  'pdf',
  'PDF list of state-registered ag inputs (Paraná ADAPAR). URL: http://www.adapar.pr.gov.br/arquivos/File/DPFI/lista_0.pdf (~135 pages). Phase 30.'
)
ON CONFLICT (name) DO NOTHING;
