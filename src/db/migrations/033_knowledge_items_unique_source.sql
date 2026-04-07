-- ============================================================
-- Migration 033: knowledge_items unique (source_table, source_id)
-- Depends on: 008
-- ============================================================
--
-- Phase 22 follow-up: the reading-room ingest endpoint and the
-- sync-agro-news cron both call:
--
--   supabase
--     .from('knowledge_items')
--     .upsert(rows, { onConflict: 'source_table,source_id' })
--
-- but knowledge_items only had a PK on `id` — there was no unique
-- constraint matching that ON CONFLICT spec, so PostgREST returned
-- "there is no unique or exclusion constraint matching the ON
-- CONFLICT specification" and the upsert failed silently. Both code
-- paths swallowed the error, so:
--
--   • the 25 existing rows in knowledge_items are leftover from
--     earlier successful inserts (pre-upsert)
--   • new news from the cron has not been getting embedded since
--     the upsert was added
--   • reading-room ingest has never gotten anything into the KB
--
-- Adding a real UNIQUE constraint here makes the upsert work.
--
-- Subtle gotcha discovered the hard way: PostgREST's onConflict spec
-- only recognizes named constraints (PRIMARY KEY / UNIQUE constraints).
-- A bare `CREATE UNIQUE INDEX` — and especially a PARTIAL one with a
-- WHERE clause — does NOT count, even though raw Postgres would happily
-- use it as an ON CONFLICT target. So this migration uses ALTER TABLE
-- ADD CONSTRAINT, not CREATE INDEX.
--
-- Postgres' default NULL semantics still allow multiple rows with
-- (NULL, NULL) — each NULL is treated as distinct from every other —
-- so manual / synthetic knowledge_items rows that don't have a
-- source_table / source_id pair are unaffected.
--
-- Verified before applying: zero existing duplicates on this pair.
-- ============================================================

ALTER TABLE knowledge_items
  ADD CONSTRAINT knowledge_items_source_uniq UNIQUE (source_table, source_id);

COMMENT ON CONSTRAINT knowledge_items_source_uniq ON knowledge_items IS
  'Phase 22 follow-up. Required by .upsert(..., { onConflict: ''source_table,source_id'' }) in /api/cron/sync-agro-news and /api/reading-room/ingest. Default NULL semantics allow multiple manual rows with NULL source columns.';
