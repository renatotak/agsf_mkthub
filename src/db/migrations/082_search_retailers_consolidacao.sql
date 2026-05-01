-- Migration 082 — extend search_retailers to include r.consolidacao (economic group)
-- Fixes: searching by economic group name (e.g. LAVORO, NUTRIEN, AGROGALAXY, CASUL)
-- returns no results because consolidacao was not included in the WHERE clause.
-- pg_trgm must already be enabled (it was enabled for earlier indexes).

CREATE INDEX IF NOT EXISTS retailers_consolidacao_trgm_idx
  ON retailers USING GIN (consolidacao gin_trgm_ops);

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
      OR r.consolidacao ILIKE '%' || search_term || '%'
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
