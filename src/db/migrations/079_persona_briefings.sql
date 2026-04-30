-- ============================================================
-- Migration 079 — Persona-based briefings
-- Phase 7a: on-demand persona variants for CEO, Head Comercial,
--            Head Crédito, and Marketing.
-- Depends on: 047 (executive_briefings)
-- ============================================================

CREATE TABLE IF NOT EXISTS persona_briefings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  briefing_date   date NOT NULL,
  persona         text NOT NULL CHECK (persona IN ('ceo','head_comercial','head_credito','marketing')),
  generated_at    timestamptz NOT NULL DEFAULT now(),
  summary         text,
  highlights      jsonb DEFAULT '[]'::jsonb,  -- [{title, body, priority}]
  model_used      text,
  confidentiality text NOT NULL DEFAULT 'agrisafe_published',

  UNIQUE (briefing_date, persona)
);

CREATE INDEX IF NOT EXISTS idx_persona_briefings_date ON persona_briefings(briefing_date DESC);

ALTER TABLE persona_briefings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read_persona_briefings" ON persona_briefings
  FOR SELECT USING (true);

CREATE POLICY "service_write_persona_briefings" ON persona_briefings
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
