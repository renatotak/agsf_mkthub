-- Migration 036 — Editable analysis lenses for /api/company-research (Phase 24B).
--
-- Phase 24B introduced an `analysis_type` column on company_research and a
-- code-side `ANALYSIS_LENSES` registry that selects a different OpenAI prompt
-- per role (retailer / industry / generic). The user follow-up: lift the
-- prompts out of code into a DB-backed table so they can be edited from the
-- Settings UI without redeploying.
--
-- Each lens has a stable text key (used by the UI + the route handler), a
-- bilingual label, a search-query template (with {{name}} placeholder), and
-- a system_prompt fed to OpenAI.

CREATE TABLE IF NOT EXISTS analysis_lenses (
  id            text PRIMARY KEY,         -- 'retailer', 'industry', 'generic', ...
  label_pt      text NOT NULL,
  label_en      text,
  description   text,                     -- internal note for the editor

  -- Search query template — supports {{name}} placeholder
  search_template text NOT NULL,

  -- OpenAI system prompt
  system_prompt   text NOT NULL,
  model           text DEFAULT 'gpt-4o-mini',
  temperature     numeric(3,2) DEFAULT 0.30,
  max_tokens      integer DEFAULT 400,

  -- Lifecycle
  enabled       boolean NOT NULL DEFAULT true,
  is_builtin    boolean NOT NULL DEFAULT false,  -- true for the seed rows; UI prevents delete
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

ALTER TABLE analysis_lenses ENABLE ROW LEVEL SECURITY;

-- Read: anyone (the UI needs to list lenses to render buttons).
-- Write: service-role only — Settings UI will gate edits behind the same
-- service-role API path used by other admin actions today.
CREATE POLICY "public_read_analysis_lenses"
  ON analysis_lenses FOR SELECT USING (true);

CREATE POLICY "service_write_analysis_lenses"
  ON analysis_lenses FOR ALL USING (auth.role() = 'service_role');

-- ─── Seed: 3 built-in lenses ──────────────────────────────────────
-- Mirrors the in-code ANALYSIS_LENSES registry from
-- src/app/api/company-research/route.ts so behaviour is identical
-- the moment the migration runs and the route swaps to DB-backed lookup.

INSERT INTO analysis_lenses (id, label_pt, label_en, description, search_template, system_prompt, is_builtin)
VALUES
  (
    'retailer',
    'Revenda / Canal',
    'Retailer / Channel',
    'Lente original — análise de canais de distribuição agro (revendas, cooperativas, plataformas).',
    '{{name}} agronegócio Brasil',
    'Você é um analista de inteligência do agronegócio brasileiro. Com base nos resultados de busca, escreva um resumo executivo de 3-5 frases sobre a empresa, sua posição no mercado e relevância no agro. Seja conciso e factual.',
    true
  ),
  (
    'industry',
    'Indústria de Insumos',
    'Input Industry',
    'Lente focada em fabricantes — produtos, moléculas / ingredientes ativos, canais de distribuição parceiros, posicionamento competitivo.',
    '{{name}} fabricante defensivos fertilizantes sementes biológicos moléculas portfólio Brasil',
    'Você é um analista de inteligência da indústria de insumos agrícolas. Com base nos resultados de busca, escreva um resumo executivo de 4-6 frases cobrindo: (1) categorias de produto (defensivos, fertilizantes, sementes, biológicos, etc.), (2) moléculas / ingredientes ativos ou tecnologias notáveis, (3) canais de distribuição e revendas parceiras no Brasil, (4) posicionamento competitivo. Seja factual e específico — cite produtos e moléculas quando aparecerem nos snippets.',
    true
  ),
  (
    'generic',
    'Genérica',
    'Generic',
    'Resumo corporativo neutro — usado quando nenhuma lente específica se aplica.',
    '{{name}} Brasil',
    'Você é um analista corporativo. Resuma em 3-4 frases o que se sabe sobre a empresa com base nos resultados de busca. Seja factual.',
    true
  )
ON CONFLICT (id) DO NOTHING;

-- Updated-at trigger so the editor can show "last edited"
CREATE OR REPLACE FUNCTION trg_analysis_lenses_touch() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS analysis_lenses_touch ON analysis_lenses;
CREATE TRIGGER analysis_lenses_touch
  BEFORE UPDATE ON analysis_lenses
  FOR EACH ROW EXECUTE FUNCTION trg_analysis_lenses_touch();
