-- ============================================================
-- Migration 015: Foreign Keys, Missing Columns, Schema Cleanup
-- Connects tables for referential integrity across the platform
-- Run in Supabase Dashboard > SQL Editor
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Add missing columns
-- ────────────────────────────────────────────────────────────

-- Add debt_value to recuperacao_judicial (capital social from Receita Federal)
ALTER TABLE recuperacao_judicial ADD COLUMN IF NOT EXISTS debt_value numeric;

-- Add cnpj_basico index to recuperacao_judicial for joins
CREATE INDEX IF NOT EXISTS idx_rj_entity_cnpj ON recuperacao_judicial(entity_cnpj);
CREATE INDEX IF NOT EXISTS idx_rj_entity_type ON recuperacao_judicial(entity_type);
CREATE INDEX IF NOT EXISTS idx_rj_state ON recuperacao_judicial(state);
CREATE INDEX IF NOT EXISTS idx_rj_status ON recuperacao_judicial(status);

-- Add cnpj_raiz index to retailer_locations for FK
CREATE INDEX IF NOT EXISTS idx_rl_cnpj_raiz ON retailer_locations(cnpj_raiz);

-- ────────────────────────────────────────────────────────────
-- 2. Foreign Keys: retailer_locations → retailers
-- ────────────────────────────────────────────────────────────

-- retailer_locations.cnpj_raiz → retailers.cnpj_raiz
-- (soft: SET NULL on delete, since locations can outlive a retailer record)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_rl_retailer' AND table_name = 'retailer_locations'
  ) THEN
    ALTER TABLE retailer_locations
      ADD CONSTRAINT fk_rl_retailer
      FOREIGN KEY (cnpj_raiz) REFERENCES retailers(cnpj_raiz) ON DELETE SET NULL;
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- 3. Foreign Keys: company_enrichment → retailers
-- ────────────────────────────────────────────────────────────

-- company_enrichment.cnpj_basico → retailers.cnpj_raiz
-- (soft: no cascade — enrichment is a cache, not dependent)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_ce_retailer' AND table_name = 'company_enrichment'
  ) THEN
    ALTER TABLE company_enrichment
      ADD CONSTRAINT fk_ce_retailer
      FOREIGN KEY (cnpj_basico) REFERENCES retailers(cnpj_raiz) ON DELETE SET NULL;
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- 4. Foreign Keys: company_notes → retailers
-- ────────────────────────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_cn_retailer' AND table_name = 'company_notes'
  ) THEN
    ALTER TABLE company_notes
      ADD CONSTRAINT fk_cn_retailer
      FOREIGN KEY (cnpj_basico) REFERENCES retailers(cnpj_raiz) ON DELETE CASCADE;
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- 5. Foreign Keys: retailer_intelligence → retailers
-- ────────────────────────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_rint_retailer' AND table_name = 'retailer_intelligence'
  ) THEN
    ALTER TABLE retailer_intelligence
      ADD CONSTRAINT fk_rint_retailer
      FOREIGN KEY (cnpj_raiz) REFERENCES retailers(cnpj_raiz) ON DELETE CASCADE;
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- 6. Foreign Keys: retailer_industries → retailers + industries
-- ────────────────────────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_ri_retailer' AND table_name = 'retailer_industries'
  ) THEN
    ALTER TABLE retailer_industries
      ADD CONSTRAINT fk_ri_retailer
      FOREIGN KEY (cnpj_raiz) REFERENCES retailers(cnpj_raiz) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_ri_industry' AND table_name = 'retailer_industries'
  ) THEN
    ALTER TABLE retailer_industries
      ADD CONSTRAINT fk_ri_industry
      FOREIGN KEY (industry_id) REFERENCES industries(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- 7. Foreign Keys: industry_products → industries
-- ────────────────────────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_ip_industry' AND table_name = 'industry_products'
  ) THEN
    ALTER TABLE industry_products
      ADD CONSTRAINT fk_ip_industry
      FOREIGN KEY (industry_id) REFERENCES industries(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- 8. Foreign Keys: content_topics → published_articles
-- ────────────────────────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_ct_article' AND table_name = 'content_topics'
  ) THEN
    ALTER TABLE content_topics
      ADD CONSTRAINT fk_ct_article
      FOREIGN KEY (published_article_id) REFERENCES published_articles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- 9. Foreign Keys: commodity_price_history → commodity_prices
-- ────────────────────────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_cph_commodity' AND table_name = 'commodity_price_history'
  ) THEN
    ALTER TABLE commodity_price_history
      ADD CONSTRAINT fk_cph_commodity
      FOREIGN KEY (commodity_id) REFERENCES commodity_prices(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- 10. Helpful views for cross-table intelligence
-- ────────────────────────────────────────────────────────────

-- View: retailers that are also in recuperacao_judicial
CREATE OR REPLACE VIEW v_retailers_in_rj AS
SELECT
  r.cnpj_raiz,
  r.razao_social,
  r.nome_fantasia,
  r.classificacao,
  r.faixa_faturamento,
  r.porte_name,
  rj.status AS rj_status,
  rj.filing_date AS rj_filing_date,
  rj.summary AS rj_summary,
  rj.source_name AS rj_source
FROM retailers r
INNER JOIN recuperacao_judicial rj
  ON rj.entity_cnpj LIKE r.cnpj_raiz || '%'
  OR rj.entity_name ILIKE '%' || r.nome_fantasia || '%'
WHERE rj.status IN ('em_andamento', 'deferido');

-- View: retailer full profile (enrichment + notes + intelligence)
CREATE OR REPLACE VIEW v_retailer_profile AS
SELECT
  r.cnpj_raiz,
  r.razao_social,
  r.nome_fantasia,
  r.classificacao,
  r.faixa_faturamento,
  r.porte_name,
  r.grupo_acesso,
  r.tipo_acesso,
  ce.cnae_fiscal,
  ce.cnae_fiscal_descricao,
  ce.situacao_cadastral,
  ce.capital_social AS rf_capital_social,
  ri.market_position,
  ri.executive_summary,
  ri.news_mentions,
  ri.branch_count_current
FROM retailers r
LEFT JOIN company_enrichment ce ON ce.cnpj_basico = r.cnpj_raiz
LEFT JOIN retailer_intelligence ri ON ri.cnpj_raiz = r.cnpj_raiz;

COMMENT ON VIEW v_retailers_in_rj IS 'Retailers from Diretório that appear in Recuperação Judicial — cross-reference for risk signals';
COMMENT ON VIEW v_retailer_profile IS 'Complete retailer profile joining enrichment, intelligence, and base data';

-- ============================================================
-- Done! Verify FK relationships:
-- SELECT tc.table_name, tc.constraint_name, kcu.column_name, ccu.table_name AS foreign_table
-- FROM information_schema.table_constraints tc
-- JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
-- JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
-- WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
-- ORDER BY tc.table_name;
-- ============================================================
