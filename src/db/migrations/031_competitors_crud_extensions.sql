-- ============================================================
-- Migration 031: Competitors CRUD extensions (Phase 21)
-- Depends on: 006, 020, 022
-- ============================================================
--
-- Phase 21 — Radar Competitivo: CRUD + Web Enrichment
--
-- Adds the columns needed for the in-app CRUD modal:
--
--   • notes / notes_updated_at — manual analyst notes (textarea)
--   • harvey_ball_scores       — jsonb mirror of the 6 differentiation
--                                dimensions (vertical, depth, precision,
--                                pulse, regulatory, ux). Kept alongside
--                                the legacy score_* columns so the existing
--                                sync-competitors cron and the matrix view
--                                continue to work without churn.
--   • entity_uid               — FK to legal_entities (Phase 17 anchoring)
--                                so newly-CRUD'd competitors get a stable
--                                cross-vertical id like every other entity.
--   • cnpj_basico              — optional 8-digit CNPJ root for the rare
--                                case where the analyst knows the legal id.
--   • country / vertical       — currently `segment` is the only segment
--                                hint; we add explicit `vertical` and
--                                `country` so the modal can render them as
--                                first-class fields.
--   • last_web_enrichment_at   — provenance for the "enrich web" button.
--
-- Score columns are also created defensively (IF NOT EXISTS) — they were
-- introduced ad-hoc by sync-competitors but never made it into a tracked
-- migration. This brings the schema in line with the code.
--
-- Confidentiality column already exists from migration 022 (default
-- 'public'); we leave it as-is.
-- ============================================================

-- ─── 1. Defensive: ensure score_* columns exist ──────────────
-- The sync-competitors cron writes score_pulse and the UI reads
-- score_depth/precision/pulse/regulatory/ux/credit. Make them real.

ALTER TABLE competitors ADD COLUMN IF NOT EXISTS score_depth      smallint NOT NULL DEFAULT 0 CHECK (score_depth      BETWEEN 0 AND 4);
ALTER TABLE competitors ADD COLUMN IF NOT EXISTS score_precision  smallint NOT NULL DEFAULT 0 CHECK (score_precision  BETWEEN 0 AND 4);
ALTER TABLE competitors ADD COLUMN IF NOT EXISTS score_pulse      smallint NOT NULL DEFAULT 0 CHECK (score_pulse      BETWEEN 0 AND 4);
ALTER TABLE competitors ADD COLUMN IF NOT EXISTS score_regulatory smallint NOT NULL DEFAULT 0 CHECK (score_regulatory BETWEEN 0 AND 4);
ALTER TABLE competitors ADD COLUMN IF NOT EXISTS score_ux         smallint NOT NULL DEFAULT 0 CHECK (score_ux         BETWEEN 0 AND 4);
ALTER TABLE competitors ADD COLUMN IF NOT EXISTS score_credit     smallint NOT NULL DEFAULT 0 CHECK (score_credit     BETWEEN 0 AND 4);

-- ─── 2. Phase-21 CRUD columns ────────────────────────────────

ALTER TABLE competitors ADD COLUMN IF NOT EXISTS notes              text;
ALTER TABLE competitors ADD COLUMN IF NOT EXISTS notes_updated_at   timestamptz;
ALTER TABLE competitors ADD COLUMN IF NOT EXISTS harvey_ball_scores jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE competitors ADD COLUMN IF NOT EXISTS vertical           text;
ALTER TABLE competitors ADD COLUMN IF NOT EXISTS country            text;
ALTER TABLE competitors ADD COLUMN IF NOT EXISTS cnpj_basico        text;
ALTER TABLE competitors ADD COLUMN IF NOT EXISTS last_web_enrichment_at timestamptz;
ALTER TABLE competitors ADD COLUMN IF NOT EXISTS created_at         timestamptz NOT NULL DEFAULT now();
ALTER TABLE competitors ADD COLUMN IF NOT EXISTS updated_at         timestamptz NOT NULL DEFAULT now();

COMMENT ON COLUMN competitors.harvey_ball_scores IS
  'Phase 21 6-dimension Harvey Ball matrix: {vertical, depth, precision, pulse, regulatory, ux} each 0-4. Mirrors score_* columns; the column is the canonical store for new CRUD additions.';
COMMENT ON COLUMN competitors.cnpj_basico IS
  'Optional 8-digit CNPJ root. When present, drives entity_uid resolution via ensureLegalEntityUid().';

-- Phase 21 promotes notes from a hypothetical "internal-only" tier; today
-- it stays at the same tier as the rest of the row (default 'public' for
-- legacy rows, 'agrisafe_published' for new ones — see CRUD route).

-- ─── 3. Anchor to legal_entities (Phase 17 alignment) ────────
-- competitors.entity_uid is added as a nullable FK. The 020 backfill already
-- created legal_entities rows for every existing competitor (source_ref
-- 'competitors:<id>'); here we wire the back-pointer.

ALTER TABLE competitors
  ADD COLUMN IF NOT EXISTS entity_uid uuid REFERENCES legal_entities(entity_uid) ON DELETE SET NULL;

-- Backfill: link each competitor row to its 020-seeded legal_entity by source_ref.
UPDATE competitors c
   SET entity_uid = le.entity_uid
  FROM legal_entities le
 WHERE le.source_ref = 'competitors:' || c.id
   AND c.entity_uid IS NULL;

CREATE INDEX IF NOT EXISTS idx_competitors_entity_uid ON competitors(entity_uid);
CREATE INDEX IF NOT EXISTS idx_competitors_cnpj_basico ON competitors(cnpj_basico) WHERE cnpj_basico IS NOT NULL;

-- ─── 4. updated_at trigger (cheap, idempotent) ───────────────

CREATE OR REPLACE FUNCTION competitors_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_competitors_updated_at ON competitors;
CREATE TRIGGER trg_competitors_updated_at
  BEFORE UPDATE ON competitors
  FOR EACH ROW EXECUTE FUNCTION competitors_set_updated_at();

-- ─── 5. Sanity check ─────────────────────────────────────────

DO $$
DECLARE
  n_total int;
  n_with_uid int;
BEGIN
  SELECT COUNT(*) INTO n_total FROM competitors;
  SELECT COUNT(*) INTO n_with_uid FROM competitors WHERE entity_uid IS NOT NULL;
  RAISE NOTICE 'Phase 21 mig 031 complete: % competitors total, % with entity_uid', n_total, n_with_uid;
END $$;
