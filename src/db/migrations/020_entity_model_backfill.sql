-- ============================================================
-- Migration 020: Backfill legal_entities (Phase 17B)
-- Depends on: 018, 019
-- ============================================================
--
-- Backfills legal_entities from existing tables:
--   - retailers            → tax_id = cnpj_raiz (8-digit basico), role=retailer
--   - recuperacao_judicial → tax_id = substr(digits, 1, 8),       (no role; relation via entity_mentions later)
--   - industries           → tax_id NULL,                         role=industry
--   - competitors          → tax_id NULL,                         role=competitor
--
-- Industries and competitors have no CNPJ in the current schema, so we
-- need to relax `legal_entities` to accept tax-id-less entities. We also
-- add a `source_ref` column so the backfill is idempotent (safe to re-run).
-- ============================================================

-- ─── Relax legal_entities constraints ────────────────────────
-- 1. Make tax_id nullable
-- 2. Drop the UNIQUE constraint on tax_id (we'll replace with a partial unique index)
-- 3. Allow tax_id_type='unknown' for tax-id-less seed entities
-- 4. Add source_ref column for idempotent backfill tracking

ALTER TABLE legal_entities
  ALTER COLUMN tax_id DROP NOT NULL;

-- Drop the original UNIQUE constraint (auto-named on tax_id)
DO $$ DECLARE cname text;
BEGIN
  SELECT tc.constraint_name INTO cname
  FROM information_schema.table_constraints tc
  JOIN information_schema.constraint_column_usage ccu USING (constraint_name, table_schema)
  WHERE tc.table_name = 'legal_entities'
    AND tc.constraint_type = 'UNIQUE'
    AND ccu.column_name = 'tax_id';
  IF cname IS NOT NULL THEN
    EXECUTE 'ALTER TABLE legal_entities DROP CONSTRAINT ' || quote_ident(cname);
  END IF;
END $$;

-- Partial unique: one row per tax_id, but tax_id can be NULL for seed entities
CREATE UNIQUE INDEX IF NOT EXISTS ux_le_tax_id
  ON legal_entities(tax_id)
  WHERE tax_id IS NOT NULL;

-- Replace tax_id_type CHECK to allow 'unknown'
ALTER TABLE legal_entities DROP CONSTRAINT IF EXISTS legal_entities_tax_id_type_check;
ALTER TABLE legal_entities
  ADD CONSTRAINT legal_entities_tax_id_type_check
  CHECK (tax_id_type IN ('cpf','cnpj','unknown'));

-- source_ref: 'retailers:<cnpj_raiz>', 'rj:<id>', 'industries:<id>', 'competitors:<id>'
-- Gives us idempotent backfill + a stable pointer back to the origin row.
ALTER TABLE legal_entities
  ADD COLUMN IF NOT EXISTS source_ref text;

CREATE UNIQUE INDEX IF NOT EXISTS ux_le_source_ref
  ON legal_entities(source_ref)
  WHERE source_ref IS NOT NULL;

COMMENT ON COLUMN legal_entities.source_ref IS
  'Backfill provenance: "<source_table>:<source_id>". Used for idempotent re-backfill and lineage.';

-- ─── Backfill from retailers ─────────────────────────────────
-- retailers.cnpj_raiz is the 8-digit CNPJ basico.
-- Use source_ref (unique) to make this idempotent across re-runs.

INSERT INTO legal_entities (tax_id, tax_id_type, legal_name, display_name, confidentiality, source_ref)
SELECT
  r.cnpj_raiz,
  'cnpj',
  r.razao_social,
  COALESCE(NULLIF(r.nome_fantasia, ''), r.razao_social),
  'public',
  'retailers:' || r.cnpj_raiz
FROM retailers r
WHERE r.cnpj_raiz IS NOT NULL
  AND length(r.cnpj_raiz) >= 8
ON CONFLICT DO NOTHING;  -- skip on any unique conflict (tax_id or source_ref)

-- Attach 'retailer' role for every backfilled retailer
INSERT INTO entity_roles (entity_uid, role_type)
SELECT le.entity_uid, 'retailer'
FROM legal_entities le
WHERE le.source_ref LIKE 'retailers:%'
ON CONFLICT DO NOTHING;

-- ─── Backfill from recuperacao_judicial ──────────────────────
-- Some rows have entity_cnpj (14-digit formatted), some don't.
-- We normalize to 8-digit basico. Rows without a CNPJ are skipped
-- (they'll be linked later via entity_mentions with entity_name matching).

WITH rj_clean AS (
  SELECT
    rj.id,
    rj.entity_name,
    substring(regexp_replace(rj.entity_cnpj, '[^0-9]', '', 'g'), 1, 8) AS cnpj_basico_8
  FROM recuperacao_judicial rj
  WHERE rj.entity_cnpj IS NOT NULL
    AND length(regexp_replace(rj.entity_cnpj, '[^0-9]', '', 'g')) >= 8
)
INSERT INTO legal_entities (tax_id, tax_id_type, legal_name, display_name, confidentiality, source_ref)
SELECT
  rc.cnpj_basico_8,
  'cnpj',
  rc.entity_name,
  rc.entity_name,
  'public',
  'rj:' || rc.cnpj_basico_8
FROM rj_clean rc
-- If a retailer already owns this tax_id, skip: that entity is the canonical
-- one and the RJ record will link to it via entity_mentions in a later phase.
WHERE NOT EXISTS (SELECT 1 FROM legal_entities le WHERE le.tax_id = rc.cnpj_basico_8)
ON CONFLICT DO NOTHING;

-- NOTE: no automatic role attached for RJ rows — being in RJ is a state, not a
-- role. The link to the RJ record itself is expressed via entity_mentions in
-- a later phase when the RJ ingestion writes mentions directly.

-- ─── Backfill from industries ────────────────────────────────
-- industries has no CNPJ; we seed with tax_id=NULL, tax_id_type='unknown'.
-- source_ref='industries:<id>' makes it idempotent.

INSERT INTO legal_entities (tax_id, tax_id_type, legal_name, display_name, confidentiality, source_ref)
SELECT
  NULL,
  'unknown',
  i.name,
  COALESCE(i.name_display, i.name),
  'public',
  'industries:' || i.id
FROM industries i
ON CONFLICT DO NOTHING;

INSERT INTO entity_roles (entity_uid, role_type)
SELECT le.entity_uid, 'industry'
FROM legal_entities le
WHERE le.source_ref LIKE 'industries:%'
ON CONFLICT DO NOTHING;

-- ─── Backfill from competitors ───────────────────────────────

INSERT INTO legal_entities (tax_id, tax_id_type, legal_name, display_name, confidentiality, source_ref)
SELECT
  NULL,
  'unknown',
  c.name,
  c.name,
  'public',
  'competitors:' || c.id
FROM competitors c
ON CONFLICT DO NOTHING;

INSERT INTO entity_roles (entity_uid, role_type)
SELECT le.entity_uid, 'competitor'
FROM legal_entities le
WHERE le.source_ref LIKE 'competitors:%'
ON CONFLICT DO NOTHING;

-- ─── Sanity check counts ─────────────────────────────────────
-- These SELECTs are informational; they get executed as part of the
-- migration but the results are only visible in the Supabase MCP log.

DO $$
DECLARE
  n_total int;
  n_retailers int;
  n_industries int;
  n_competitors int;
  n_rj int;
  n_roles int;
BEGIN
  SELECT COUNT(*) INTO n_total FROM legal_entities;
  SELECT COUNT(*) INTO n_retailers FROM legal_entities WHERE source_ref LIKE 'retailers:%';
  SELECT COUNT(*) INTO n_industries FROM legal_entities WHERE source_ref LIKE 'industries:%';
  SELECT COUNT(*) INTO n_competitors FROM legal_entities WHERE source_ref LIKE 'competitors:%';
  SELECT COUNT(*) INTO n_rj FROM legal_entities WHERE source_ref LIKE 'rj:%';
  SELECT COUNT(*) INTO n_roles FROM entity_roles;
  RAISE NOTICE 'Backfill 020 complete: % legal_entities total (retailers=%, industries=%, competitors=%, rj=%), % entity_roles rows',
    n_total, n_retailers, n_industries, n_competitors, n_rj, n_roles;
END $$;
