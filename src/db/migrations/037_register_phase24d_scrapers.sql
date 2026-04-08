-- ============================================================
-- Migration 037 — Register Phase 24D scrapers
-- Depends on: 027 (scraper_registry table)
-- ============================================================
--
-- Three new scrapers registered for Marco Regulatório expansion:
--
--   1. sync-cvm-agro      — CVM agro/rural/FIAGRO/CPR instructions
--   2. sync-bcb-rural     — BCB Crédito Rural + SICOR notícias
--   3. sync-key-agro-laws — Curated foundational laws (CPR, Falências,
--                            Nova Lei do Agro) + DDG news mentions
--
-- All three use the runScraper() wrapper. Validation is intentionally
-- loose because:
--   - DuckDuckGo result counts vary day-to-day; expected_min_rows=1
--     accommodates indexing lag
--   - The CVM scraper depends on whether DDG has indexed CVM pages for
--     a given keyword set; some runs return zero, which is OK
--
-- The Saúde dos Scrapers tab will surface broken/degraded if any of
-- these flips. The DDG-based fetch is fragile to Cloudflare changes,
-- so this is the early-warning channel.
-- ============================================================

INSERT INTO scraper_registry (
  scraper_id, name, description, source_id, kind, target_table,
  cadence, grace_period_hours, schema_check, expected_min_rows,
  owner, notes
) VALUES
(
  'sync-cvm-agro',
  'CVM Agro/Rural/FIAGRO/CPR Instructions',
  'Scrapes CVM legislacao tree for instruções normativas and resoluções that touch agribusiness (FIAGRO, CPR, crédito rural, agronegócio). Two-stage: DuckDuckGo site:conteudo.cvm.gov.br/legislacao filter for each keyword, then Cheerio re-fetch of each candidate page to re-validate the agro hit and extract title/date/body. Pure regex, no LLM. Phase 24D.',
  'conteudo.cvm.gov.br',
  'html',
  'regulatory_norms',
  'weekly',
  168,
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
      "body": ["CVM"]
    }
  }'::jsonb,
  1,
  'agrisafe-mkthub',
  'DuckDuckGo HTML search + Cheerio fetch. CVM has no JSON API and walking all ~600 instruções is wasteful — search-then-fetch is the cheapest deterministic path. Re-runs are idempotent (upsert by id=cvm-<inst-number>).'
),
(
  'sync-bcb-rural',
  'BCB Crédito Rural + SICOR Notícias',
  'Indexes the two BCB landing pages (estabilidadefinanceira/creditorural and estabilidadefinanceira/sicornoticias) via DuckDuckGo site filter. The BCB site is JS-rendered (SharePoint) so Cheerio cannot read the body directly — DDG snippets carry the indexed metadata we need. Classifies each result as either a normativo (Resolução/Circular/etc) or news, then writes to regulatory_norms and/or agro_news accordingly. Phase 24D.',
  'bcb.gov.br',
  'html',
  'regulatory_norms',
  'weekly',
  168,
  '{
    "required_keys": ["kind","source_url","title","summary","published_at"],
    "sample_row": {
      "kind": "string",
      "source_url": "string",
      "title": "string",
      "summary": "string",
      "published_at": "string"
    },
    "enum_values": {
      "kind": ["norm","news"]
    }
  }'::jsonb,
  1,
  'agrisafe-mkthub',
  'BCB pages are SharePoint + JS-rendered → Cheerio cannot read the body. DDG snippet-only strategy is the algorithmic alternative to a Playwright headless browser. Trade-off: limited to whatever DDG has indexed. Idempotent via stable hash IDs.'
),
(
  'sync-key-agro-laws',
  'Key Agribusiness Laws (CPR, Falências, Nova Lei do Agro)',
  'Curated seed of foundational Brazilian agribusiness statutes. Two passes per run: (1) idempotent upsert of each law into regulatory_norms with its Planalto URL, real norm number, and short summary; (2) DuckDuckGo search for recent commentary on each law and upsert top results into agro_news under category=regulatorio. Pure regex, no LLM. Phase 24D.',
  'planalto.gov.br',
  'html',
  'regulatory_norms',
  'weekly',
  168,
  '{
    "required_keys": ["kind","source_url","title","summary","published_at"],
    "sample_row": {
      "kind": "string",
      "source_url": "string",
      "title": "string",
      "summary": "string",
      "published_at": "string"
    },
    "enum_values": {
      "kind": ["law","mention"]
    }
  }'::jsonb,
  3,
  'agrisafe-mkthub',
  'Catalog of 3 key laws lives in the route file (KEY_LAWS const). Adding a new law = adding a const entry, no migration. Each run also pings DuckDuckGo for fresh commentary, so re-runs are useful even when the catalog itself is unchanged.'
)
ON CONFLICT (scraper_id) DO NOTHING;

-- ─── Knowledge note ────────────────────────────────────────────
-- Document the BCB JS-rendered page constraint for future maintainers.

INSERT INTO scraper_knowledge (
  scraper_id, kind, title, body, severity, created_by
) VALUES (
  'sync-bcb-rural',
  'note',
  'Phase 24D — Why DDG-snippet-only instead of headless browser',
  'The BCB landing pages bcb.gov.br/estabilidadefinanceira/creditorural and bcb.gov.br/estabilidadefinanceira/sicornoticias are SharePoint pages whose body is hydrated by JavaScript. A plain Cheerio fetch returns ONLY the boilerplate "Essa pagina depende do javascript para abrir, favor habilitar o javascript do seu browser!" message — no items, no titles, no dates, no links. We considered three approaches and chose DuckDuckGo snippet-only:

1. **Playwright headless browser** — would work but is heavy, slow, fragile under Vercel''s serverless runtime, and adds 100MB+ to the deploy. Rejected.

2. **Olinda OData API** — exposes SICOR credit operation data (https://olinda.bcb.gov.br/olinda/servico/SICOR/versao/v2/odata/) but does NOT expose the news/normativos pages; that data is only on the SharePoint pages.

3. **DuckDuckGo site:bcb.gov.br/estabilidadefinanceira/creditorural** — DDG has indexed both pages and serves title + snippet + URL for each indexed item. We get title, summary, source URL, and a parseable date in the snippet. Limited to whatever DDG has crawled (~recent items only) but covers the user''s actual need: surface recent normativos and notícias.

If/when BCB ships an RSS feed or proper REST endpoint for these pages, replace this scraper with that direct path.',
  'info',
  'system'
)
ON CONFLICT DO NOTHING;
