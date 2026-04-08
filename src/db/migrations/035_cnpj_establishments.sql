-- Migration 035 — Generic CNPJ establishments cache (Phase 24B).
--
-- Until now establishment-level data lived only in `retailer_locations`,
-- which has an FK to `retailers.cnpj_raiz`. That blocks reuse for other
-- entity types (industries, competitors, judicial-recovery targets, etc.).
--
-- Phase 24B introduces an on-demand "Buscar filiais" action on the
-- Diretório de Indústrias expanded row. To support that without breaking
-- the retailers schema, we add a NEW generic table that any feature can
-- read/write by `cnpj_raiz` regardless of which roles the entity holds.
--
-- Long-term, retailer_locations should fold into this table once the
-- entity-model migration completes (Phase 17 follow-up).

CREATE TABLE IF NOT EXISTS cnpj_establishments (
  cnpj           text PRIMARY KEY,            -- 14-digit full CNPJ
  cnpj_raiz      text NOT NULL,               -- 8-digit base
  ordem          text,                        -- 4-digit estabelecimento ordem
  matriz_filial  text,                        -- '1' = matriz, '2' = filial
  razao_social   text,
  nome_fantasia  text,
  situacao_cadastral text,
  data_inicio_atividade date,

  -- Address
  logradouro     text,
  numero         text,
  complemento    text,
  bairro         text,
  cep            text,
  municipio      text,
  uf             text,

  -- Geocoding (optional, populated by a future job)
  latitude       numeric,
  longitude      numeric,
  geo_precision  text,

  -- Contact
  email          text,
  telefone       text,

  -- Provenance
  source         text,                        -- 'BrasilAPI' / 'CNPJ.ws' / etc.
  fetched_at     timestamptz DEFAULT now(),
  raw_response   jsonb
);

CREATE INDEX IF NOT EXISTS idx_cnpj_est_raiz ON cnpj_establishments(cnpj_raiz);
CREATE INDEX IF NOT EXISTS idx_cnpj_est_uf   ON cnpj_establishments(uf);

ALTER TABLE cnpj_establishments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read_cnpj_establishments"
  ON cnpj_establishments FOR SELECT USING (true);

CREATE POLICY "service_write_cnpj_establishments"
  ON cnpj_establishments FOR ALL USING (auth.role() = 'service_role');

-- ────────────────────────────────────────────────────────────
-- Phase 24B — analysis_type on company_research
-- ────────────────────────────────────────────────────────────
--
-- /api/company-research now selects between role-specific OpenAI prompts
-- (retailer / industry / generic). Persisting which lens generated each
-- row lets the UI label results and lets future analytics segment by
-- analysis intent. Defaults to 'retailer' for back-compat with existing
-- rows that were all retailer-driven.

ALTER TABLE company_research
  ADD COLUMN IF NOT EXISTS analysis_type text NOT NULL DEFAULT 'retailer';

CREATE INDEX IF NOT EXISTS idx_cr_analysis_type ON company_research(analysis_type);
