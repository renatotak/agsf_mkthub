-- ============================================================
-- Migration 047 — Daily Executive Briefing
-- Depends on: 043 (activity_log)
-- ============================================================

CREATE TABLE IF NOT EXISTS executive_briefings (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  briefing_date    date NOT NULL,
  generated_at     timestamptz NOT NULL DEFAULT now(),

  -- Structured sections
  executive_summary text,
  market_moves      jsonb DEFAULT '[]'::jsonb,
  top_news          jsonb DEFAULT '[]'::jsonb,
  regulatory_updates jsonb DEFAULT '[]'::jsonb,
  rj_alerts         jsonb DEFAULT '[]'::jsonb,
  upcoming_events   jsonb DEFAULT '[]'::jsonb,
  source_health     jsonb DEFAULT '{}'::jsonb,

  -- Metadata
  data_window_hours int NOT NULL DEFAULT 24,
  model_used        text,
  confidentiality   text NOT NULL DEFAULT 'agrisafe_published',
  created_at        timestamptz NOT NULL DEFAULT now(),

  UNIQUE (briefing_date)
);

CREATE INDEX IF NOT EXISTS idx_briefings_date ON executive_briefings(briefing_date DESC);
