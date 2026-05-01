-- ============================================================
-- Migration 083 — Mailing workflow (client briefing fan-out)
-- Depends on: 018 (legal_entities), 022 (confidentiality enum),
--             041 (CRM-style RLS pattern), 047 (executive_briefings)
-- ============================================================
--
-- Schema layer for the AgriSafe client-mailing workflow:
--   AI agent drafts a daily executive briefing
--     → human reviewer edits
--       → click "Send"
--         → fans out via Resend (email) and future App Campo /
--           AgriSafe app channels
--
-- Each client subscribes to a persona (CEO / Head Inteligência /
-- Marketing / Crédito) AND a list of cultures. Same template,
-- different content per (persona × culture) combination.
--
-- Anchoring (5-entity model — guardrail #2):
--   • mailing_clients.entity_uid → legal_entities(entity_uid)
--     so each recipient is tied to the canonical client company.
--     Nullable so free-emails (consultants, partners, journalists)
--     can still be subscribed without a CNPJ on file.
--   • mailing_drafts.briefing_id → executive_briefings(id)
--     so every send traces back to the briefing it materialized.
--
-- Confidentiality (guardrail #3):
--   Default = 'agrisafe_confidential' on mailing_clients and
--   mailing_drafts because the recipient list and the per-persona
--   draft content are internal CRM data — not public.
--
-- Bilingual (guardrail #4):
--   subject + body fields are stored as `_pt` / `_en` pairs.
--
-- RLS pattern (matches mig 041 + 047):
--   - SELECT permissive (public reads via anon/authenticated)
--   - INSERT/UPDATE/DELETE only via service_role
--   The API routes use service-role and run server-side; tier
--   enforcement is layered on top in src/lib/confidentiality.ts.
-- ============================================================

-- ─── 1. mailing_clients ───────────────────────────────────────
-- Recipient directory. One row per human person at a client
-- company. Multiple rows per CNPJ are allowed (e.g. CEO + Head
-- Comercial at the same retailer).

CREATE TABLE IF NOT EXISTS mailing_clients (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_uid      uuid REFERENCES legal_entities(entity_uid) ON DELETE SET NULL,
  full_name       text NOT NULL,
  email           text NOT NULL,
  persona         text NOT NULL
                    CHECK (persona IN ('ceo','intel','marketing','credit')),
  phone           text,                              -- E.164 format ideally; for future WhatsApp channel
  notes           text,
  active          boolean NOT NULL DEFAULT true,
  confidentiality text NOT NULL DEFAULT 'agrisafe_confidential'
                    CHECK (confidentiality IN ('public','agrisafe_published','agrisafe_confidential','client_confidential')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (email)
);

CREATE INDEX IF NOT EXISTS idx_mailing_clients_persona
  ON mailing_clients(persona) WHERE active;
CREATE INDEX IF NOT EXISTS idx_mailing_clients_entity_uid
  ON mailing_clients(entity_uid) WHERE entity_uid IS NOT NULL;

ALTER TABLE mailing_clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read mailing_clients"  ON mailing_clients FOR SELECT USING (true);
CREATE POLICY "Service write mailing_clients" ON mailing_clients FOR ALL    USING (auth.role() = 'service_role');

COMMENT ON TABLE mailing_clients IS
  'Mig 083 — recipient directory for client-briefing fan-out. Anchored to legal_entities (nullable for free-emails). Defaults to agrisafe_confidential.';

-- ─── 2. mailing_client_cultures ───────────────────────────────
-- Junction: which cultures each client cares about. Many-to-many.
-- culture_slug is free-text on purpose: cultures evolve faster
-- than enums and we already use slug-based culture keys across
-- the codebase (soja, milho, cafe, cana-de-acucar, algodao, boi,
-- trigo, arroz, feijao, ...).

CREATE TABLE IF NOT EXISTS mailing_client_cultures (
  client_id    uuid NOT NULL REFERENCES mailing_clients(id) ON DELETE CASCADE,
  culture_slug text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (client_id, culture_slug)
);

ALTER TABLE mailing_client_cultures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read mailing_client_cultures"  ON mailing_client_cultures FOR SELECT USING (true);
CREATE POLICY "Service write mailing_client_cultures" ON mailing_client_cultures FOR ALL    USING (auth.role() = 'service_role');

COMMENT ON TABLE mailing_client_cultures IS
  'Mig 083 — per-client culture subscriptions. Drives the (persona × culture) fan-out matrix.';

-- ─── 3. mailing_templates ─────────────────────────────────────
-- Master HTML template. Start with one row, but the table is
-- designed for multiple (briefing-diario-v1, briefing-semanal-v1,
-- alerta-credito-v1, ...). Subject and body templates support
-- {{handlebars}}-style placeholders that the renderer substitutes
-- at send time.

CREATE TABLE IF NOT EXISTS mailing_templates (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                text NOT NULL UNIQUE,
  name_pt             text NOT NULL,
  name_en             text NOT NULL,
  subject_template_pt text NOT NULL,
  subject_template_en text NOT NULL,
  body_html           text NOT NULL,                 -- master HTML wrapper with {{placeholders}}
  body_mjml           text,                          -- optional MJML source for easier editing
  active              boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE mailing_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read mailing_templates"  ON mailing_templates FOR SELECT USING (true);
CREATE POLICY "Service write mailing_templates" ON mailing_templates FOR ALL    USING (auth.role() = 'service_role');

COMMENT ON TABLE mailing_templates IS
  'Mig 083 — bilingual master HTML templates with handlebars placeholders ({{subject}}, {{body}}, {{recipient_name}}, {{unsubscribe_url}}).';

-- ─── 4. mailing_drafts ────────────────────────────────────────
-- One draft per (briefing × persona × culture-bundle). Reviewer
-- edits this before sending. ai_draft_raw snapshots what the AI
-- initially produced — useful as audit trail and as training
-- data for prompt-tuning later.

CREATE TABLE IF NOT EXISTS mailing_drafts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  briefing_id     uuid NOT NULL REFERENCES executive_briefings(id) ON DELETE CASCADE,
  template_id     uuid NOT NULL REFERENCES mailing_templates(id) ON DELETE RESTRICT,
  persona         text NOT NULL
                    CHECK (persona IN ('ceo','intel','marketing','credit')),
  culture_filter  text[] NOT NULL DEFAULT '{}',     -- empty = all cultures
  status          text NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','reviewing','approved','sent','archived','failed')),
  subject_pt      text NOT NULL,                    -- AI-generated initially, human-editable
  subject_en      text,
  body_html_pt    text NOT NULL,                    -- AI-generated initially, human-editable
  body_html_en    text,
  ai_draft_raw    jsonb,                            -- snapshot of original AI output (audit / training data)
  reviewer_uid    uuid,                             -- supabase auth user that approved
  reviewed_at     timestamptz,
  sent_at         timestamptz,
  recipient_count int,                              -- denormalized, set when sent
  confidentiality text NOT NULL DEFAULT 'agrisafe_confidential'
                    CHECK (confidentiality IN ('public','agrisafe_published','agrisafe_confidential','client_confidential')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mailing_drafts_briefing_status
  ON mailing_drafts(briefing_id, status);
CREATE INDEX IF NOT EXISTS idx_mailing_drafts_status_persona
  ON mailing_drafts(status, persona);

ALTER TABLE mailing_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read mailing_drafts"  ON mailing_drafts FOR SELECT USING (true);
CREATE POLICY "Service write mailing_drafts" ON mailing_drafts FOR ALL    USING (auth.role() = 'service_role');

COMMENT ON TABLE mailing_drafts IS
  'Mig 083 — one draft per (briefing × persona × culture-bundle). Reviewer edits subject_*/body_html_* before status flips to approved → sent. ai_draft_raw is the immutable original.';

-- ─── 5. mailing_log ───────────────────────────────────────────
-- Per-recipient send log. One row per (draft × client × channel).
-- channel anticipates future fan-out targets beyond email; today
-- only 'email' is wired up.

CREATE TABLE IF NOT EXISTS mailing_log (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id          uuid NOT NULL REFERENCES mailing_drafts(id) ON DELETE CASCADE,
  client_id         uuid REFERENCES mailing_clients(id) ON DELETE SET NULL,
  channel           text NOT NULL
                      CHECK (channel IN ('email','app_campo','agrisafe_app','whatsapp')),
  recipient_address text NOT NULL,                  -- email/phone/user_id snapshotted at send time
  provider          text,                           -- 'resend', 'app_campo_api', etc.
  provider_msg_id   text,                           -- e.g. Resend's id
  status            text NOT NULL DEFAULT 'queued'
                      CHECK (status IN ('queued','sent','delivered','opened','clicked','bounced','failed')),
  error_message     text,
  sent_at           timestamptz,
  delivered_at      timestamptz,
  opened_at         timestamptz,
  clicked_at        timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mailing_log_draft
  ON mailing_log(draft_id);
CREATE INDEX IF NOT EXISTS idx_mailing_log_client
  ON mailing_log(client_id);
CREATE INDEX IF NOT EXISTS idx_mailing_log_status_created
  ON mailing_log(status, created_at DESC);

ALTER TABLE mailing_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read mailing_log"  ON mailing_log FOR SELECT USING (true);
CREATE POLICY "Service write mailing_log" ON mailing_log FOR ALL    USING (auth.role() = 'service_role');

COMMENT ON TABLE mailing_log IS
  'Mig 083 — per-recipient delivery log. One row per (draft × client × channel). Status mirrors Resend webhook events (queued → sent → delivered → opened → clicked, or bounced/failed).';

-- ─── 6. updated_at triggers ───────────────────────────────────
-- Match the convention from mig 031 (competitors_set_updated_at):
-- one trigger function per table, BEFORE UPDATE, NEW.updated_at = now().
-- Idempotent CREATE OR REPLACE so re-running is a no-op.

CREATE OR REPLACE FUNCTION mailing_clients_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_mailing_clients_updated_at ON mailing_clients;
CREATE TRIGGER trg_mailing_clients_updated_at
  BEFORE UPDATE ON mailing_clients
  FOR EACH ROW EXECUTE FUNCTION mailing_clients_set_updated_at();

CREATE OR REPLACE FUNCTION mailing_templates_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_mailing_templates_updated_at ON mailing_templates;
CREATE TRIGGER trg_mailing_templates_updated_at
  BEFORE UPDATE ON mailing_templates
  FOR EACH ROW EXECUTE FUNCTION mailing_templates_set_updated_at();

CREATE OR REPLACE FUNCTION mailing_drafts_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_mailing_drafts_updated_at ON mailing_drafts;
CREATE TRIGGER trg_mailing_drafts_updated_at
  BEFORE UPDATE ON mailing_drafts
  FOR EACH ROW EXECUTE FUNCTION mailing_drafts_set_updated_at();

-- ─── 7. Seed: one starter template ────────────────────────────
-- Placeholder bilingual layout — works as a starting point;
-- production polish happens in the template editor UI.
-- Brand tokens: primary #5B7A2F, secondary #7FA02B, font Inter.

INSERT INTO mailing_templates (slug, name_pt, name_en, subject_template_pt, subject_template_en, body_html)
VALUES (
  'briefing-diario-v1',
  'Briefing Diário — v1',
  'Daily Briefing — v1',
  'AgriSafe — Briefing Executivo {{date_pt}}',
  'AgriSafe — Executive Briefing {{date_en}}',
  $HTML$<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>{{subject}}</title>
  <style>
    body { margin: 0; padding: 0; background: #F7F4EF; font-family: 'Inter', Arial, sans-serif; color: #3D382F; }
    .wrap { max-width: 640px; margin: 0 auto; background: #ffffff; }
    .header { background: #5B7A2F; padding: 24px 32px; color: #ffffff; }
    .header h1 { margin: 0; font-size: 18px; font-weight: 600; letter-spacing: 0.2px; }
    .accent { height: 4px; background: #7FA02B; }
    .content { padding: 32px; font-size: 15px; line-height: 1.6; }
    .greeting { font-size: 16px; margin-bottom: 16px; color: #3D382F; }
    .footer { padding: 24px 32px; background: #F7F4EF; font-size: 12px; color: #6b6357; border-top: 1px solid #e8e3d8; }
    .footer a { color: #5B7A2F; text-decoration: none; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="header"><h1>AgriSafe Market Hub</h1></div>
    <div class="accent"></div>
    <div class="content">
      <p class="greeting">Olá, {{recipient_name}}.</p>
      {{body}}
    </div>
    <div class="footer">
      Você está recebendo este briefing porque assina a inteligência da AgriSafe.<br>
      <a href="{{unsubscribe_url}}">Cancelar inscrição</a> · AgriSafe Consultoria
    </div>
  </div>
</body>
</html>$HTML$
)
ON CONFLICT (slug) DO NOTHING;

-- ─── 8. Sanity check ──────────────────────────────────────────

DO $$
DECLARE
  n_clients   int;
  n_cultures  int;
  n_templates int;
  n_drafts    int;
  n_log       int;
BEGIN
  SELECT COUNT(*) INTO n_clients   FROM mailing_clients;
  SELECT COUNT(*) INTO n_cultures  FROM mailing_client_cultures;
  SELECT COUNT(*) INTO n_templates FROM mailing_templates;
  SELECT COUNT(*) INTO n_drafts    FROM mailing_drafts;
  SELECT COUNT(*) INTO n_log       FROM mailing_log;
  RAISE NOTICE 'Mig 083 complete: mailing_clients=%, mailing_client_cultures=%, mailing_templates=%, mailing_drafts=%, mailing_log=%',
    n_clients, n_cultures, n_templates, n_drafts, n_log;
END $$;
