-- ============================================================
-- Migration 032: news_sources registry (Phase 22)
-- Depends on: 006 (agro_news), 022 (confidentiality enum convention)
-- ============================================================
--
-- Replaces the hardcoded NEWS_SOURCES constant in src/data/news.ts
-- with a database-backed table so the AgroNews UI can offer CRUD
-- on news providers without code changes. The cron route
-- src/app/api/cron/sync-agro-news/route.ts now reads from this
-- table instead of importing the constant.
--
-- Soft-delete strategy: never DELETE rows (agro_news.source_name
-- references the human-readable name as plain text). Toggle
-- enabled=false to retire a source instead.
--
-- The Reading Room Chrome extension also writes into agro_news,
-- but it does NOT need a row here — it pushes articles directly
-- via /api/reading-room/ingest. We still seed a sentinel row so
-- the UI can show its status alongside RSS feeds.
-- ============================================================

CREATE TABLE IF NOT EXISTS news_sources (
  id              text PRIMARY KEY,
  name            text NOT NULL,
  rss_url         text,
  website_url     text,
  category        text NOT NULL DEFAULT 'general'
                  CHECK (category IN ('commodities','livestock','policy','technology','credit',
                                      'sustainability','judicial','general','reading_room')),
  language        text NOT NULL DEFAULT 'pt'
                  CHECK (language IN ('pt','en','es')),
  enabled         boolean NOT NULL DEFAULT true,
  source_type     text NOT NULL DEFAULT 'rss'
                  CHECK (source_type IN ('rss','reading_room','api','scrape')),
  last_fetched_at timestamptz,
  last_error      text,
  error_count     integer NOT NULL DEFAULT 0,
  confidentiality text NOT NULL DEFAULT 'public'
                  CHECK (confidentiality IN ('public','agrisafe_published','agrisafe_confidential','client_confidential')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_news_sources_enabled  ON news_sources(enabled);
CREATE INDEX IF NOT EXISTS idx_news_sources_category ON news_sources(category);

-- Auto-touch updated_at
CREATE OR REPLACE FUNCTION news_sources_touch_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_news_sources_touch ON news_sources;
CREATE TRIGGER trg_news_sources_touch
  BEFORE UPDATE ON news_sources
  FOR EACH ROW EXECUTE FUNCTION news_sources_touch_updated_at();

-- ─── RLS: public read, service-role write ───────────────────
ALTER TABLE news_sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "news_sources_public_read" ON news_sources;
CREATE POLICY "news_sources_public_read" ON news_sources
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "news_sources_service_write" ON news_sources;
CREATE POLICY "news_sources_service_write" ON news_sources
  FOR ALL USING (auth.role() = 'service_role');

-- ─── Seed: existing 5 RSS feeds from src/data/news.ts ──────
INSERT INTO news_sources (id, name, rss_url, website_url, category, language, enabled, source_type) VALUES
  ('canal-rural',        'Canal Rural',           'https://www.canalrural.com.br/feed/',         'https://www.canalrural.com.br',         'general', 'pt', true, 'rss'),
  ('sucesso-no-campo',   'Sucesso no Campo',      'https://sucessonocampo.com.br/feed/',         'https://sucessonocampo.com.br',         'general', 'pt', true, 'rss'),
  ('portal-agronegocio', 'Portal do Agronegócio', 'https://www.portaldoagronegocio.com.br/feed', 'https://www.portaldoagronegocio.com.br','general', 'pt', true, 'rss'),
  ('sna',                'SNA',                   'https://www.sna.agr.br/feed/',                'https://www.sna.agr.br',                'general', 'pt', true, 'rss'),
  ('beefpoint',          'BeefPoint',             'https://www.beefpoint.com.br/feed/',          'https://www.beefpoint.com.br',          'livestock','pt', true, 'rss')
ON CONFLICT (id) DO NOTHING;

-- Reading Room sentinel (extension pushes via /api/reading-room/ingest)
INSERT INTO news_sources (id, name, rss_url, website_url, category, language, enabled, source_type) VALUES
  ('reading-room', 'Reading Room', NULL, NULL, 'reading_room', 'pt', true, 'reading_room')
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE news_sources IS
  'Phase 22: catalog of news providers. Replaces hardcoded NEWS_SOURCES constant. Soft-delete via enabled=false because agro_news.source_name is plain text.';
