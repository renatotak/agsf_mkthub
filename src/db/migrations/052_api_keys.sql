-- ============================================================
-- Migration 052 — API key management + access logs (Phase 29: App Campo)
-- Depends on: nothing (additive)
-- ============================================================

-- api_keys: stores hashed API keys for external consumers (App Campo, partners)
CREATE TABLE IF NOT EXISTS api_keys (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  key_hash        text NOT NULL UNIQUE,
  key_prefix      text NOT NULL,
  permissions     jsonb NOT NULL DEFAULT '["events:read"]'::jsonb,
  active          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_used_at    timestamptz,
  access_count    int NOT NULL DEFAULT 0,
  created_by      text
);

CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_active ON api_keys(active) WHERE active = true;

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read api_keys" ON api_keys;
CREATE POLICY "Public read api_keys" ON api_keys FOR SELECT USING (true);
DROP POLICY IF EXISTS "Service role write api_keys" ON api_keys;
CREATE POLICY "Service role write api_keys" ON api_keys FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE api_keys IS 'API keys for external consumers (App Campo, partners). Raw key shown once; only SHA-256 hash stored.';

-- api_access_logs: per-request access log for API key usage
CREATE TABLE IF NOT EXISTS api_access_logs (
  id              bigserial PRIMARY KEY,
  api_key_id      uuid REFERENCES api_keys(id) ON DELETE SET NULL,
  endpoint        text NOT NULL,
  method          text NOT NULL DEFAULT 'GET',
  status_code     int,
  ip_address      text,
  user_agent      text,
  response_time_ms int,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_api_access_logs_created ON api_access_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_access_logs_key ON api_access_logs(api_key_id);
CREATE INDEX IF NOT EXISTS idx_api_access_logs_endpoint ON api_access_logs(endpoint);

ALTER TABLE api_access_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read api_access_logs" ON api_access_logs;
CREATE POLICY "Public read api_access_logs" ON api_access_logs FOR SELECT USING (true);
DROP POLICY IF EXISTS "Service role write api_access_logs" ON api_access_logs;
CREATE POLICY "Service role write api_access_logs" ON api_access_logs FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE api_access_logs IS 'Per-request access log for API key usage. Enables rate-limit monitoring and usage analytics.';
