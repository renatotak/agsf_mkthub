-- ============================================================
-- Migration 039 — Register CNJ atos scraper (Phase 24F)
-- Depends on: 027 (scraper_registry)
-- ============================================================
--
-- Phase 24F adds two complementary mechanisms for tracking new legal
-- norms that affect agribusiness:
--
--   1. /api/cron/sync-cnj-atos — direct scraper of the CNJ atos JSON API
--      (https://atos.cnj.jus.br/api/atos). Walks the first 10 pages, regex-
--      filters by agro keywords, upserts hits to regulatory_norms with
--      body='CNJ'. Catches Provimentos like 216/2026 (recuperação judicial
--      de produtores rurais) that the existing ConJur/Migalhas/JOTA RSS
--      pass would only see if a news outlet wrote about it first.
--
--   2. src/lib/extract-norms-from-news.ts — pure-regex norm-citation
--      detector run inline by sync-agro-news. Each ingested article is
--      scanned for "Provimento N/YYYY", "Resolução N", "Lei N.NNN", etc.
--      Hits in agro context get auto-upserted into regulatory_norms with
--      stable ids of the form `news-<body>-<type>-<number>`. Catches the
--      same norms via the news-coverage path.
--
-- The two mechanisms intentionally overlap: CNJ scraper is the
-- authoritative source (catches the ato within 24h of publication),
-- the news extractor is the safety net (catches norms from any body
-- that ConJur/Migalhas/JOTA write about).
-- ============================================================

INSERT INTO scraper_registry (
  scraper_id, name, description, source_id, kind, target_table,
  cadence, grace_period_hours, schema_check, expected_min_rows,
  owner, notes
) VALUES (
  'sync-cnj-atos',
  'CNJ Atos (Provimentos, Resoluções, Portarias)',
  'Walks the first 10 pages of https://atos.cnj.jus.br/api/atos (200 most recent atos), regex-filters by agro keywords on the ementa field, upserts hits into regulatory_norms with body=CNJ. Catches CNJ provimentos like 216/2026 (recuperação judicial de produtores rurais) that the news-RSS-driven sync-regulatory pass misses. Pure regex, no LLM. Phase 24F.',
  'atos.cnj.jus.br',
  'json',
  'regulatory_norms',
  'daily',
  48,
  '{
    "required_keys": ["id","body","norm_type","norm_number","title","published_at","source_url"],
    "sample_row": {
      "id": "string",
      "body": "string",
      "norm_type": "string",
      "norm_number": "string",
      "title": "string",
      "published_at": "string",
      "source_url": "string"
    },
    "enum_values": {
      "body": ["CNJ"]
    }
  }'::jsonb,
  0,
  'agrisafe-mkthub',
  'expected_min_rows=0 because most days will yield zero new agro hits — CNJ publishes ~5-10 atos/day across all themes; agro hits are sparse. The scraper is still useful daily because the run logs prove the API is alive (Health tab visibility) and a single hit per week is enough to justify the cost.'
)
ON CONFLICT (scraper_id) DO NOTHING;

-- ─── Knowledge note ────────────────────────────────────────────
-- Document the CNJ API filter quirk for future maintainers.

INSERT INTO scraper_knowledge (
  scraper_id, kind, title, body, severity, created_by
) VALUES (
  'sync-cnj-atos',
  'note',
  'Phase 24F — CNJ API filter parameters are silently ignored',
  'Probed the CNJ atos JSON API (https://atos.cnj.jus.br/api/atos) and confirmed: query parameters ?tipo, ?busca, ?q, ?filtro are ALL silently ignored. The endpoint always returns the same chronological-most-recent-first list regardless. Verified by passing tipo=Provimento and tipo=Resolução and getting identical results.

The scraper compensates by walking pages 1-10 (200 most recent atos) and regex-filtering client-side on the ementa field. CNJ publishes roughly 5-10 atos per day across all themes; agro hits are 0-2 per week. Daily runs with a 48h grace period.

If CNJ ever fixes the filter params or adds a search-by-keyword endpoint, swap to it and reduce expected_min_rows to its real floor.',
  'info',
  'system'
)
ON CONFLICT DO NOTHING;
