-- Migration 081 — extend search_retailers to include le.display_name
-- Fixes: searching by trade name / curated name (e.g. "CASUL") returns no results
-- display_name is the curated human-readable name stored on legal_entities,
-- distinct from razao_social (RF official name) and nome_fantasia (retailer table).

CREATE INDEX IF NOT EXISTS legal_entities_display_name_trgm_idx
  ON legal_entities USING GIN (display_name gin_trgm_ops);

CREATE OR REPLACE FUNCTION search_retailers(
    search_term text DEFAULT NULL,
    param_uf text DEFAULT NULL,
    param_grupo text DEFAULT NULL,
    param_classificacao text DEFAULT NULL
)
RETURNS SETOF retailers AS $$
BEGIN
  RETURN QUERY
  SELECT r.*
  FROM retailers r
  LEFT JOIN legal_entities le ON r.entity_uid = le.entity_uid
  WHERE
    -- 1. Full-text / Trigram Search
    (
      search_term IS NULL
      OR search_term = ''
      OR r.razao_social ILIKE '%' || search_term || '%'
      OR r.nome_fantasia ILIKE '%' || search_term || '%'
      OR le.display_name ILIKE '%' || search_term || '%'
      -- Strip non-numeric characters from the search term for tax_id lookup
      OR (
        regexp_replace(search_term, '\D', '', 'g') != ''
        AND le.tax_id ILIKE '%' || regexp_replace(search_term, '\D', '', 'g') || '%'
      )
    )
    -- 2. Exact Match Filters
    AND (
      param_uf IS NULL OR param_uf = '' OR param_uf = 'Todos' OR
      EXISTS (
        SELECT 1 FROM retailer_locations rl
        WHERE rl.uf = param_uf
        AND rl.cnpj_raiz = substring(le.tax_id FROM 1 FOR 8)
      )
    )
    AND (param_grupo IS NULL OR param_grupo = '' OR param_grupo = 'Todos' OR r.grupo_acesso = param_grupo)
    AND (param_classificacao IS NULL OR param_classificacao = '' OR param_classificacao = 'Todos' OR r.classificacao = param_classificacao);
END;
$$ LANGUAGE plpgsql;
