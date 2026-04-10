-- ============================================================
-- Migration 044 — v_norms_affecting_entity view (Phase 25)
-- Depends on: 042 (regulatory_norms.affected_cnaes), 018 (legal_entities)
-- ============================================================
--
-- Surfaces "this norm affects N entities in your portfolio" for the
-- Marco Regulatório UI. Joins regulatory_norms.affected_cnaes with
-- legal_entities by primary CNAE code.
--
-- Two views:
--   1. v_norms_affecting_entity   — one row per (norm × entity) match
--   2. v_norm_entity_counts       — aggregated count per norm
--
-- Both are SECURITY INVOKER so the caller's RLS applies. Used by the
-- Marco Reg chapter to render an "X empresas afetadas" badge per norm.
--
-- Why a view instead of a materialized one: regulatory_norms is small
-- (currently ~16 rows, will grow slowly), legal_entities has ~10k
-- rows but only ~200 have a primary_cnae set today. The unnest +
-- IN-list join is cheap. Re-evaluate if regulatory_norms exceeds 5k
-- rows or response time exceeds 100ms in practice.

-- ─── 1. Per-row matches ──────────────────────────────────────────────

create or replace view v_norms_affecting_entity
with (security_invoker = on)
as
select
  rn.id              as norm_id,
  rn.body            as norm_body,
  rn.norm_type,
  rn.norm_number,
  rn.title           as norm_title,
  rn.published_at,
  rn.impact_level,
  rn.affected_areas,
  rn.affected_cnaes,
  le.entity_uid,
  le.tax_id,
  le.tax_id_type,
  le.legal_name,
  le.display_name,
  le.primary_cnae,
  le.uf
from regulatory_norms rn
join legal_entities le
  on le.primary_cnae = any(rn.affected_cnaes)
where
  rn.affected_cnaes is not null
  and array_length(rn.affected_cnaes, 1) > 0
  and le.primary_cnae is not null
  and le.primary_cnae <> '';

comment on view v_norms_affecting_entity is
  'Phase 25: per-row join of regulatory_norms × legal_entities by primary_cnae. '
  'One row per (norm, affected entity). Use for the Marco Regulatório "empresas afetadas" panel.';

-- ─── 2. Aggregated counts per norm ───────────────────────────────────

create or replace view v_norm_entity_counts
with (security_invoker = on)
as
select
  norm_id,
  norm_body,
  norm_type,
  norm_number,
  norm_title,
  published_at,
  impact_level,
  affected_areas,
  affected_cnaes,
  count(distinct entity_uid)::int as affected_entity_count,
  count(distinct uf)::int         as affected_uf_count
from v_norms_affecting_entity
group by norm_id, norm_body, norm_type, norm_number, norm_title,
         published_at, impact_level, affected_areas, affected_cnaes;

comment on view v_norm_entity_counts is
  'Phase 25: aggregated count of affected legal_entities per regulatory_norm. '
  'Powers the "X empresas afetadas" badge in the Marco Regulatório list.';

-- ─── 3. Indexes that help the view perform ───────────────────────────
-- regulatory_norms.affected_cnaes already has a GIN index from migration 042.
-- legal_entities.primary_cnae could use a btree if it doesn't already have one.

do $$
begin
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename = 'legal_entities'
      and indexname = 'idx_legal_entities_primary_cnae'
  ) then
    create index idx_legal_entities_primary_cnae
      on legal_entities (primary_cnae)
      where primary_cnae is not null and primary_cnae <> '';
  end if;
end $$;
