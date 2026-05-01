-- ============================================================
-- Migration 080 — Add adapar_parana to industry_products.source_dataset CHECK
-- Depends on: 030 (source_dataset column), 078 (adapar_parana scraper)
-- ============================================================
--
-- sync-adapar-parana (Phase 30) inserts rows with source_dataset='adapar_parana'
-- but migration 030 only allows: manual, agrofit_federal, bioinsumos_federal,
-- state_secretaria_*, other. The CHECK was never updated, so every upsert
-- from that job would be rejected. Also extends v_oracle_brand_alternatives
-- to include adapar_parana rows.
-- ============================================================

-- 1. Drop and recreate the CHECK constraint to include adapar_parana
ALTER TABLE industry_products
  DROP CONSTRAINT IF EXISTS industry_products_source_dataset_check;

ALTER TABLE industry_products
  ADD CONSTRAINT industry_products_source_dataset_check
  CHECK (source_dataset IN (
    'manual',
    'agrofit_federal',
    'bioinsumos_federal',
    'adapar_parana',
    'state_secretaria_mt',
    'state_secretaria_ms',
    'state_secretaria_go',
    'state_secretaria_pr',
    'state_secretaria_rs',
    'state_secretaria_sp',
    'state_secretaria_mg',
    'state_secretaria_ba',
    'other'
  ));

-- 2. Extend v_oracle_brand_alternatives to include adapar_parana rows
DROP VIEW IF EXISTS v_oracle_brand_alternatives;
CREATE VIEW v_oracle_brand_alternatives
WITH (security_invoker=on) AS
SELECT
  ai.ingredient_id,
  ai.name           AS ingredient_name,
  ai.name_display   AS ingredient_display,
  ai.category       AS ingredient_category,
  ai.holder_count,
  ai.brand_count,
  ipu.culture_slug,
  ipu.culture,
  ipu.pest_slug,
  ipu.pest,
  ip.id             AS product_id,
  ip.product_name,
  ip.industry_id,
  ip.titular_registro,
  ip.manufacturer_entity_uid,
  ip.toxicity_class,
  ip.environmental_class,
  ip.formulation,
  ip.url_agrofit,
  COALESCE(le.display_name, ind.name_display, ip.titular_registro) AS manufacturer_display,
  ind.headquarters_country AS manufacturer_country
FROM active_ingredients ai
JOIN industry_product_ingredients ipi USING (ingredient_id)
JOIN industry_products ip            ON ip.id = ipi.product_id
JOIN industry_product_uses ipu       ON ipu.product_id = ip.id
LEFT JOIN industries ind             ON ind.id = ip.industry_id
LEFT JOIN legal_entities le          ON le.entity_uid = ip.manufacturer_entity_uid
WHERE ip.source_dataset IN (
  'agrofit_federal',
  'bioinsumos_federal',
  'adapar_parana',
  'state_secretaria_mt',
  'state_secretaria_ms',
  'state_secretaria_go',
  'state_secretaria_pr',
  'state_secretaria_rs',
  'state_secretaria_sp',
  'state_secretaria_mg',
  'state_secretaria_ba'
);

COMMENT ON VIEW v_oracle_brand_alternatives IS
  'Phase 20/30 Oracle query primitive. Returns one row per (ingredient × product × use). Includes agrofit_federal, bioinsumos_federal, adapar_parana, and state_secretaria_* datasets. Pest-level filtering is best-effort: AGROFIT rows currently have null pest_slug; the API falls back to culture-level when pest filter yields 0 rows.';
