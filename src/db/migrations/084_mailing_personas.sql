-- ============================================================
-- Migration 084 — Table-driven mailing personas
-- ============================================================
--
-- The four hardcoded mailing personas in mig 083 (ceo / intel /
-- marketing / credit) are insufficient for AgriSafe's actual roster.
-- The team needs to add roles like Comercial, Vendas Campo, and to
-- iterate on the system-prompt for each role over weeks (so a
-- Marketing recipient gets event-rich content, a Crédito recipient
-- gets regulatory + RJ content, etc.).
--
-- This migration:
--   1. Creates `mailing_personas` (slug-keyed, prompt-bearing)
--   2. Seeds 6 starter personas (existing 4 + Comercial + Vendas Campo)
--   3. Drops the inline CHECK constraints on
--      mailing_clients.persona / mailing_drafts.persona
--   4. Adds FK from those columns to mailing_personas(slug)
--      (ON UPDATE CASCADE so a slug rename is safe; ON DELETE RESTRICT
--      so deleting a persona that has clients/drafts is blocked).
--
-- Slug convention: lowercase, snake_case, ASCII only. Stable forever
-- once created — display names are localized via name_pt / name_en.
-- ============================================================

-- ─── 1. Create personas table ──────────────────────────────

CREATE TABLE IF NOT EXISTS mailing_personas (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                     text NOT NULL UNIQUE,
  name_pt                  text NOT NULL,
  name_en                  text NOT NULL,
  description_pt           text,
  description_en           text,
  -- The persona's AI prompt — used by the briefing cron to generate
  -- per-persona drafts. Edited iteratively in Settings → Mailings → Personas.
  system_prompt_pt         text,
  system_prompt_en         text,
  -- Which content categories matter most for this persona. Used as a
  -- soft hint by the draft-generation pipeline. Free-form strings;
  -- start with: news, events, regulatory, market_prices,
  -- rj_recovery, content_opportunities, agtech_radar, agro_inputs,
  -- price_anomalies, briefings.
  content_focus            text[] NOT NULL DEFAULT '{}',
  -- Default culture set when creating a new client of this persona
  default_culture_filter   text[] NOT NULL DEFAULT '{}',
  -- UI ordering (lower first). Built-in personas use 10/20/.../60 to
  -- leave room between for inserted custom roles.
  position                 int NOT NULL DEFAULT 100,
  active                   bool NOT NULL DEFAULT true,
  is_builtin               bool NOT NULL DEFAULT false,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mailing_personas_active_position
  ON mailing_personas(active, position);

COMMENT ON TABLE  mailing_personas IS
  'Phase 30 — Persona registry for the mailing workflow. One row per job role; the system_prompt_* fields are AI prompt templates used by sync-daily-briefing to generate per-persona drafts.';
COMMENT ON COLUMN mailing_personas.slug IS
  'Stable identifier — never rename without ON UPDATE CASCADE flowing through to mailing_clients/_drafts.';
COMMENT ON COLUMN mailing_personas.content_focus IS
  'Soft hint to the briefing cron about which data categories to emphasise for this persona.';

-- ─── 2. updated_at trigger ─────────────────────────────────

CREATE OR REPLACE FUNCTION mailing_personas_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_mailing_personas_updated_at ON mailing_personas;
CREATE TRIGGER trg_mailing_personas_updated_at
  BEFORE UPDATE ON mailing_personas
  FOR EACH ROW EXECUTE FUNCTION mailing_personas_set_updated_at();

-- ─── 3. RLS — match the mig-083 pattern ────────────────────

ALTER TABLE mailing_personas ENABLE ROW LEVEL SECURITY;

-- Permissive SELECT (the dropdowns in Mailing.tsx must read this).
DROP POLICY IF EXISTS "mailing_personas read"   ON mailing_personas;
CREATE POLICY "mailing_personas read"
  ON mailing_personas FOR SELECT
  USING (true);

-- service_role-only writes (everything from /api/mailing/personas runs
-- server-side with the service-role key, like every other write path).
DROP POLICY IF EXISTS "mailing_personas insert" ON mailing_personas;
CREATE POLICY "mailing_personas insert"
  ON mailing_personas FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "mailing_personas update" ON mailing_personas;
CREATE POLICY "mailing_personas update"
  ON mailing_personas FOR UPDATE
  USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "mailing_personas delete" ON mailing_personas;
CREATE POLICY "mailing_personas delete"
  ON mailing_personas FOR DELETE
  USING (auth.role() = 'service_role');

-- ─── 4. Seed the 6 starter personas ────────────────────────

INSERT INTO mailing_personas (slug, name_pt, name_en, description_pt, description_en, system_prompt_pt, system_prompt_en, content_focus, position, is_builtin)
VALUES
(
  'ceo',
  'CEO',
  'CEO',
  'Visão estratégica de alto nível — síntese de mercado, sinais regulatórios críticos, movimentos da concorrência.',
  'Strategic high-level view — market synthesis, critical regulatory signals, competitor moves.',
  E'Você está escrevendo um briefing executivo para um CEO do agronegócio brasileiro.\nEnfatize: (1) movimentações de preço relevantes (>2σ) em commodities-âncora (soja, milho, café, açúcar/etanol, algodão, boi); (2) sinalização regulatória de alto impacto (planos de safra, normas BCB, leis em tramitação); (3) movimentos estratégicos de concorrentes/agtechs (rodadas de captação, M&A, novos produtos); (4) recuperações judiciais e inadimplências relevantes do setor.\nFormato: 5-7 bullets de no máximo 2 linhas cada. Linguagem direta, sem jargão técnico desnecessário. Comece com o tópico mais crítico.',
  E'You are writing an executive briefing for a Brazilian agribusiness CEO.\nEmphasise: (1) material price moves (>2σ) on anchor commodities (soybean, corn, coffee, sugar/ethanol, cotton, cattle); (2) high-impact regulatory signals (Plano Safra, BCB norms, pending laws); (3) strategic competitor/agtech moves (funding rounds, M&A, new products); (4) sector judicial recoveries and material delinquencies.\nFormat: 5-7 bullets, 2 lines max each. Direct language, minimal jargon. Lead with the most critical topic.',
  ARRAY['market_prices','regulatory','agtech_radar','rj_recovery','price_anomalies'],
  10,
  true
),
(
  'intel',
  'Head Inteligência',
  'Head of Intelligence',
  'Análise técnica profunda — séries históricas, anomalias estatísticas, projeções, contexto macro.',
  'Deep technical analysis — historical series, statistical anomalies, projections, macro context.',
  E'Você está escrevendo um briefing analítico para o Head de Inteligência da AgriSafe.\nIncluir: (1) anomalias de preço com magnitude (σ) e fonte; (2) divergências entre projeções (CONAB vs USDA vs COGO) com comentário; (3) contexto macro (FAOSTAT, World Bank Pink Sheet, câmbio) quando relevante; (4) sinais de scrapers (saúde de fontes, mudanças de cobertura); (5) eventos regulatórios com análise de impacto técnico.\nFormato: parágrafos curtos com números explícitos. Cite fontes sempre que possível. Não diluir com generalidades.',
  E'You are writing an analytical briefing for AgriSafe''s Head of Intelligence.\nInclude: (1) price anomalies with magnitude (σ) and source; (2) divergences between projections (CONAB vs USDA vs COGO) with commentary; (3) macro context (FAOSTAT, World Bank Pink Sheet, FX) when relevant; (4) scraper signals (source health, coverage changes); (5) regulatory events with technical-impact analysis.\nFormat: short paragraphs with explicit numbers. Cite sources whenever possible. No filler.',
  ARRAY['price_anomalies','market_prices','regulatory','agtech_radar','briefings'],
  20,
  true
),
(
  'commercial',
  'Comercial',
  'Commercial',
  'Pipeline de leads — distribuidores em RJ, novos canais, oportunidades comerciais.',
  'Lead pipeline — channels in restructuring, new contacts, commercial opportunities.',
  E'Você está escrevendo um briefing comercial para a equipe de Comercial da AgriSafe.\nFoco principal: (1) recuperações judiciais novas em distribuidores/produtores (com nome, CNPJ, valor envolvido, tribunal); (2) sinais de inadimplência via Notícias Agro; (3) novos canais ou indústrias mapeadas no diretório; (4) movimentações de M&A entre distribuidores e indústrias; (5) oportunidades de leads detectadas a partir de eventos.\nFormato: lista priorizada por urgência comercial. Inclua dados de contato/CNPJ quando disponíveis. Direcione cada item para uma ação ("ligar", "agendar visita", "monitorar").',
  E'You are writing a commercial briefing for AgriSafe''s commercial team.\nMain focus: (1) new judicial recoveries among distributors/producers (with name, CNPJ, amount, court); (2) delinquency signals from Agro News; (3) new channels or industries mapped in the directory; (4) distributor/industry M&A moves; (5) lead opportunities flagged from events.\nFormat: priority-ordered list by commercial urgency. Include contact data/CNPJ when available. Tag each item with an action ("call", "schedule visit", "monitor").',
  ARRAY['rj_recovery','news','events','agtech_radar'],
  30,
  true
),
(
  'marketing',
  'Marketing',
  'Marketing',
  'Eventos, oportunidades de conteúdo, sinais de tendência cultural no setor.',
  'Events, content opportunities, sector cultural-trend signals.',
  E'Você está escrevendo um briefing de marketing para o time de Marketing da AgriSafe.\nFoco principal: (1) eventos do agro nas próximas 4 semanas (Agrishow, Agroadvance, AgRural, encontros regionais) com data, local, e por que importam; (2) tópicos quentes em Notícias Agro nas últimas 24h (palavras-chave em alta, novos termos); (3) oportunidades de conteúdo identificadas pelo motor de Central de Conteúdo (gaps de assunto, ângulos LinkedIn); (4) movimentos de concorrentes em comunicação/branding (lançamentos, posts, palestras).\nFormato: cada item como uma "ideia de conteúdo" acionável. Inclua hook narrativo + 1 fato específico + canal sugerido (LinkedIn / Instagram / newsletter).',
  E'You are writing a marketing briefing for AgriSafe''s marketing team.\nMain focus: (1) agribusiness events in the next 4 weeks (Agrishow, Agroadvance, AgRural, regional gatherings) with date, location, why they matter; (2) hot topics in Agro News in the last 24h (trending keywords, emerging terms); (3) content opportunities flagged by the Content Hub engine (topic gaps, LinkedIn angles); (4) competitor comms/branding moves (launches, posts, talks).\nFormat: each item as an actionable "content idea". Include narrative hook + 1 specific fact + suggested channel (LinkedIn / Instagram / newsletter).',
  ARRAY['events','news','content_opportunities','agtech_radar'],
  40,
  true
),
(
  'credit',
  'Crédito',
  'Credit',
  'Risco de crédito, inadimplência, regulação BCB, recuperações judiciais.',
  'Credit risk, delinquency, BCB regulation, judicial recoveries.',
  E'Você está escrevendo um briefing de crédito para analistas de crédito da AgriSafe.\nFoco principal: (1) novas normas BCB / CMN / CNJ relevantes para crédito rural (com link e impacto operacional); (2) movimentações do Plano Safra e seus efeitos em modalidades específicas (Pronaf, Pronamp, custeio, investimento); (3) novas recuperações judiciais no agro com valor declarado e cenário processual; (4) inadimplência SCR (BCB) por UF/cultura — alterações materiais; (5) eventos do Conselho Monetário e Câmara de Comércio Exterior (CAMEX) que afetam o setor.\nFormato: cada item com (a) o que mudou, (b) data efetiva, (c) impacto operacional na esteira de crédito.',
  E'You are writing a credit briefing for AgriSafe credit analysts.\nMain focus: (1) new BCB/CMN/CNJ norms relevant to rural credit (with link and operational impact); (2) Plano Safra moves and effects on specific modalities (Pronaf, Pronamp, custeio, investimento); (3) new agribusiness judicial recoveries with declared amount and procedural status; (4) SCR delinquency (BCB) by UF/culture — material changes; (5) Monetary Council and CAMEX events affecting the sector.\nFormat: each item with (a) what changed, (b) effective date, (c) operational impact on the credit pipeline.',
  ARRAY['regulatory','rj_recovery','briefings','news'],
  50,
  true
),
(
  'field_sales',
  'Vendas Campo',
  'Field Sales',
  'Companion para Representantes Técnicos de Vendas — produtos novos, alternativas, clima, normas estaduais.',
  'Companion for Field Sales Reps — new products, alternatives, weather, state regulations.',
  E'Você está escrevendo um briefing para Representantes Técnicos de Vendas (RTV) que conversam com produtores rurais no campo.\nFoco principal: (1) produtos AGROFIT recém-registrados nas últimas 30 dias (cultura, ingrediente ativo, fabricante, alternativas genéricas); (2) eventos climáticos da semana que afetem regiões com clientes (chuva, geada, estiagem); (3) normas estaduais novas (ADAPAR, IDARON, IAGRO) que impactem o uso de defensivos; (4) preços de fertilizantes e relações de troca atualizadas; (5) alertas de pragas/doenças com base em sinais regionais.\nFormato: cada item curto, em linguagem prática para conversa de campo. Inclua "o que dizer ao produtor" como linha de fechamento. Sem economês.',
  E'You are writing a briefing for Field Sales Reps (RTVs) talking with rural producers in the field.\nMain focus: (1) AGROFIT products newly registered in the last 30 days (culture, active ingredient, manufacturer, generic alternatives); (2) weather events of the week affecting client regions (rain, frost, drought); (3) new state regulations (ADAPAR, IDARON, IAGRO) impacting pesticide use; (4) updated fertilizer prices and exchange ratios; (5) pest/disease alerts based on regional signals.\nFormat: each item short, practical language for a field conversation. Include "what to tell the producer" as a closing line. No economist-speak.',
  ARRAY['agro_inputs','market_prices','regulatory','events','news'],
  60,
  true
)
ON CONFLICT (slug) DO NOTHING;

-- ─── 5. Drop CHECK constraints, add FK references ──────────
-- The constraints were anonymous in mig 083 (CHECK inside the column
-- definition), so PostgreSQL auto-named them. Use a DO block to find
-- and drop them by introspection — safer than guessing the name.

DO $$
DECLARE
  c text;
BEGIN
  -- mailing_clients.persona CHECK
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.mailing_clients'::regclass
      AND contype  = 'c'
      AND pg_get_constraintdef(oid) LIKE '%persona%IN%ceo%'
  LOOP
    EXECUTE format('ALTER TABLE mailing_clients DROP CONSTRAINT %I', c);
    RAISE NOTICE 'Dropped CHECK %.% on mailing_clients', 'public', c;
  END LOOP;

  -- mailing_drafts.persona CHECK
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.mailing_drafts'::regclass
      AND contype  = 'c'
      AND pg_get_constraintdef(oid) LIKE '%persona%IN%ceo%'
  LOOP
    EXECUTE format('ALTER TABLE mailing_drafts DROP CONSTRAINT %I', c);
    RAISE NOTICE 'Dropped CHECK %.% on mailing_drafts', 'public', c;
  END LOOP;
END $$;

-- Add FKs (idempotent guard via constraint-name uniqueness)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'mailing_clients_persona_fkey'
      AND conrelid = 'public.mailing_clients'::regclass
  ) THEN
    ALTER TABLE mailing_clients
      ADD CONSTRAINT mailing_clients_persona_fkey
      FOREIGN KEY (persona)
      REFERENCES mailing_personas(slug)
      ON UPDATE CASCADE
      ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'mailing_drafts_persona_fkey'
      AND conrelid = 'public.mailing_drafts'::regclass
  ) THEN
    ALTER TABLE mailing_drafts
      ADD CONSTRAINT mailing_drafts_persona_fkey
      FOREIGN KEY (persona)
      REFERENCES mailing_personas(slug)
      ON UPDATE CASCADE
      ON DELETE RESTRICT;
  END IF;
END $$;

-- ─── 6. Sanity check ───────────────────────────────────────

DO $$
DECLARE
  n_personas int;
  n_clients int;
  n_drafts int;
BEGIN
  SELECT COUNT(*) INTO n_personas FROM mailing_personas;
  SELECT COUNT(*) INTO n_clients FROM mailing_clients;
  SELECT COUNT(*) INTO n_drafts FROM mailing_drafts;
  RAISE NOTICE 'Phase 30 mig 084 complete: % personas (% builtin), % clients, % drafts',
    n_personas,
    (SELECT COUNT(*) FROM mailing_personas WHERE is_builtin),
    n_clients,
    n_drafts;
END $$;
