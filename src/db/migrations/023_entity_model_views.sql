-- ============================================================
-- Migration 023: Rebuild views on entity_uid (Phase 17B)
-- Depends on: 018, 019, 020, 021, 022
-- ============================================================
--
-- Rebuilds the existing views so they:
--   1. Expose `entity_uid` as the canonical key (new first column)
--   2. Join satellite tables via `entity_uid` instead of text keys
--   3. Keep the legacy `cnpj_raiz` column for backward-compat with
--      UI/API code that hasn't migrated yet
--
-- Also adds a new canonical view `v_entity_profile` — a single
-- "everything I know about entity X" lookup keyed by `entity_uid`.
-- ============================================================

-- ─── Rebuild v_retailer_profile ─────────────────────────────

DROP VIEW IF EXISTS v_retailer_profile;

-- security_invoker=on makes the view respect the querying user's RLS policies
-- instead of the view-creator's. Required to pass the Supabase database-linter
-- (rule 0010_security_definer_view).
CREATE OR REPLACE VIEW v_retailer_profile
WITH (security_invoker = on) AS
SELECT
  le.entity_uid,
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
  ri.branch_count_current,
  le.confidentiality
FROM retailers r
JOIN legal_entities       le ON le.tax_id = r.cnpj_raiz
LEFT JOIN company_enrichment   ce ON ce.entity_uid = le.entity_uid
LEFT JOIN retailer_intelligence ri ON ri.entity_uid = le.entity_uid;

COMMENT ON VIEW v_retailer_profile IS
  'Canonical retailer profile (Phase 17B). Keyed on entity_uid; cnpj_raiz kept for backward compat.';

-- ─── Rebuild v_retailers_in_rj ──────────────────────────────

DROP VIEW IF EXISTS v_retailers_in_rj;

CREATE OR REPLACE VIEW v_retailers_in_rj
WITH (security_invoker = on) AS
SELECT DISTINCT ON (le.entity_uid)
  le.entity_uid,
  r.cnpj_raiz,
  r.razao_social,
  r.nome_fantasia,
  r.classificacao,
  r.faixa_faturamento,
  r.porte_name,
  r.grupo_acesso,
  rj.status       AS rj_status,
  rj.filing_date  AS rj_filing_date,
  rj.summary      AS rj_summary,
  rj.source_name  AS rj_source,
  rj.debt_value   AS rj_debt_value,
  rj.state        AS rj_state,
  rj.entity_type  AS rj_entity_type
FROM retailers r
JOIN legal_entities le ON le.tax_id = r.cnpj_raiz
JOIN recuperacao_judicial rj
  ON rj.entity_cnpj LIKE r.cnpj_raiz || '%'
ORDER BY le.entity_uid, rj.filing_date DESC NULLS LAST;

COMMENT ON VIEW v_retailers_in_rj IS
  'Retailers intersected with recuperacao judicial filings (Phase 17B). Keyed on entity_uid.';

-- ─── NEW: v_entity_profile ──────────────────────────────────
-- Canonical "everything about entity X" lookup.
-- Aggregates roles, retailer data (if any), enrichment, notes,
-- intelligence, and RJ state into a single row per entity_uid.

CREATE OR REPLACE VIEW v_entity_profile
WITH (security_invoker = on) AS
SELECT
  le.entity_uid,
  le.tax_id,
  le.tax_id_type,
  le.legal_name,
  le.display_name,
  le.confidentiality,
  le.source_ref,
  -- Roles as an array so a single entity can carry many
  (SELECT array_agg(er.role_type ORDER BY er.role_type)
     FROM entity_roles er WHERE er.entity_uid = le.entity_uid) AS roles,
  -- Retailer facts (NULL if not a retailer)
  r.classificacao      AS retailer_classificacao,
  r.faixa_faturamento  AS retailer_faixa_faturamento,
  r.porte_name         AS retailer_porte,
  r.grupo_acesso       AS retailer_grupo,
  r.tipo_acesso        AS retailer_tipo_acesso,
  -- Receita Federal enrichment
  ce.cnae_fiscal,
  ce.cnae_fiscal_descricao,
  ce.situacao_cadastral,
  ce.capital_social    AS rf_capital_social,
  -- AgriSafe-curated intelligence
  ri.market_position,
  ri.executive_summary,
  ri.news_mentions,
  ri.branch_count_current,
  -- Any active recuperacao judicial record (first by filing date)
  (SELECT rj.status FROM recuperacao_judicial rj
    WHERE rj.entity_cnpj LIKE le.tax_id || '%'
    ORDER BY rj.filing_date DESC NULLS LAST LIMIT 1) AS rj_status,
  (SELECT rj.filing_date FROM recuperacao_judicial rj
    WHERE rj.entity_cnpj LIKE le.tax_id || '%'
    ORDER BY rj.filing_date DESC NULLS LAST LIMIT 1) AS rj_filing_date,
  (SELECT rj.debt_value FROM recuperacao_judicial rj
    WHERE rj.entity_cnpj LIKE le.tax_id || '%'
    ORDER BY rj.filing_date DESC NULLS LAST LIMIT 1) AS rj_debt_value
FROM legal_entities le
LEFT JOIN retailers r               ON r.cnpj_raiz  = le.tax_id
LEFT JOIN company_enrichment ce     ON ce.entity_uid = le.entity_uid
LEFT JOIN retailer_intelligence ri  ON ri.entity_uid = le.entity_uid;

COMMENT ON VIEW v_entity_profile IS
  'Canonical one-entity lookup. Aggregates roles, retailer data, Receita Federal enrichment, AgriSafe intelligence, and RJ state into a single row per entity_uid.';
