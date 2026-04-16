-- Enable pg_trgm extension for fast substring matching / ILIKE acceleration
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create GIN trigram indexes on the retailers table text fields
CREATE INDEX IF NOT EXISTS retailers_razao_social_trgm_idx 
ON retailers USING GIN (razao_social gin_trgm_ops);

CREATE INDEX IF NOT EXISTS retailers_nome_fantasia_trgm_idx 
ON retailers USING GIN (nome_fantasia gin_trgm_ops);

-- Create a GIN trigram index on the legal_entities tax_id for fast CNPJ lookups
CREATE INDEX IF NOT EXISTS legal_entities_tax_id_trgm_idx 
ON legal_entities USING GIN (tax_id gin_trgm_ops);

-- Encapsulate the complex OR logic and ILIKE searches into a single RPC.
-- This effectively replaces the frontend's sequential search and handles 
-- cross-table taxonomy (retailers <-> legal_entities) in a single hop.
-- We also include optional parameters for UF, Grupo Econômico, and Classificação
-- so the frontend can send all its current active filters in one go.
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
