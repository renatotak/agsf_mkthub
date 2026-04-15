-- ============================================================
-- Migration 068: analysis_lenses.kind — task vs viewer lenses
-- ============================================================
-- The `analysis_lenses` table was introduced (mig 036) to back the
-- "Pesquisar na Web" / "Análise IA" buttons in the Diretórios — each
-- row is a prompt template bound to a UI action (generic / industry /
-- retailer / oracle_chat).
--
-- With the agents-repo personas being merged into the Market Hub as
-- runtime-usable viewpoints ("view as CEO" / "view as Head Inteligência"),
-- we need a second flavor of lens: a persona-flavored system prompt
-- that reshapes narrative output without being bound to a specific
-- button. Instead of creating a parallel table, we add a discriminator
-- and keep one registry.
--
--   kind = 'task'   → the legacy action-triggered prompts (mig 036 rows).
--   kind = 'viewer' → persona viewpoints seeded from agents repo
--                     (CEO, Head Inteligência, Head Comercial, …).
--
-- The editor UI splits into two tabs on `kind`; the API routes pick a
-- lens by id as before.
-- ============================================================

ALTER TABLE analysis_lenses
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'task'
  CHECK (kind IN ('task','viewer'));

CREATE INDEX IF NOT EXISTS idx_analysis_lenses_kind ON analysis_lenses(kind);

COMMENT ON COLUMN analysis_lenses.kind IS
  'Lens flavor — task (mig 036 originals, bound to UI actions) or viewer (persona viewpoint seeded from agents repo, mig 068).';
