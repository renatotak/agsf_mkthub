-- ============================================================
-- Migration 085 — noCampo tier management tables
-- ============================================================
--
-- Three tables for the noCampo tiered product (Free / Pro / Enterprise):
--   1. user_plans     — one row per user, tracks tier + caps + billing
--   2. plan_features   — per-tier feature flags and monthly quotas
--   3. usage_events    — per-user usage log for quota enforcement
--
-- Auth: Supabase Auth. All access via mkthub API routes using
-- SUPABASE_SERVICE_ROLE_KEY. Mobile app never queries these tables
-- directly. RLS is OFF — enforcement is at the API layer.
--
-- company_id is a logical FK to legal_entities(entity_uid) in the
-- platform DB. Validated at the API layer, not via DB constraint.
-- ============================================================

-- RLS: explicitly OFF for all three tables.
-- All access goes through mkthub API routes using SUPABASE_SERVICE_ROLE_KEY.
-- nocampo-mobile never queries these tables directly.
-- If direct client access is ever needed, add RLS policies first.

-- 1. User plans
CREATE TABLE IF NOT EXISTS user_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  plan_tier TEXT NOT NULL CHECK (plan_tier IN ('free', 'pro', 'enterprise')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'trial', 'past_due', 'cancelled')),
  farm_cap INTEGER NOT NULL DEFAULT 50,
  client_cap INTEGER NOT NULL DEFAULT 100,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  billing_provider TEXT CHECK (billing_provider IN ('inter', 'manual')),
  billing_external_id TEXT,
  company_id UUID,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_plans_user ON user_plans(user_id);
CREATE INDEX IF NOT EXISTS idx_user_plans_company ON user_plans(company_id) WHERE company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_plans_status ON user_plans(status) WHERE status = 'active';

-- Auto-update updated_at
CREATE EXTENSION IF NOT EXISTS moddatetime;
CREATE TRIGGER user_plans_updated BEFORE UPDATE ON user_plans
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);

-- 2. Plan features (admin-editable feature flags per tier)
CREATE TABLE IF NOT EXISTS plan_features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_tier TEXT NOT NULL CHECK (plan_tier IN ('free', 'pro', 'enterprise')),
  feature_key TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  quota_monthly INTEGER,
  metadata JSONB DEFAULT '{}',
  UNIQUE(plan_tier, feature_key)
);

-- 3. Usage events (per-user, per-feature, for quota enforcement)
CREATE TABLE IF NOT EXISTS usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  feature_key TEXT NOT NULL,
  consumed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_usage_user_feature_date
  ON usage_events(user_id, feature_key, consumed_at DESC);

-- ============================================================
-- Seed: default feature flags for each tier
-- ============================================================

INSERT INTO plan_features (plan_tier, feature_key, enabled, quota_monthly) VALUES
  -- Free tier
  ('free', 'farm_management',    true,  NULL),
  ('free', 'client_management',  true,  NULL),
  ('free', 'visit_recording',    true,  10),
  ('free', 'route_planning',     true,  NULL),
  ('free', 'push_notifications', true,  NULL),
  ('free', 'bureau_lookup',      false, 0),
  ('free', 'market_news',        false, 0),
  ('free', 'commodity_prices',   false, 0),
  ('free', 'input_oracle',       false, 0),
  ('free', 'knowledge_rag',      false, 0),
  ('free', 'executive_briefing', false, 0),
  ('free', 'ndvi_alerts',        false, 0),
  ('free', 'esg_check',          false, 0),
  ('free', 'ai_agent',           false, 0),
  ('free', 'expert_consult',     false, 0),
  ('free', 'api_access',         false, 0),

  -- Pro tier
  ('pro', 'farm_management',    true,  NULL),
  ('pro', 'client_management',  true,  NULL),
  ('pro', 'visit_recording',    true,  NULL),
  ('pro', 'route_planning',     true,  NULL),
  ('pro', 'push_notifications', true,  NULL),
  ('pro', 'bureau_lookup',      true,  NULL),
  ('pro', 'market_news',        true,  NULL),
  ('pro', 'commodity_prices',   true,  NULL),
  ('pro', 'input_oracle',       true,  NULL),
  ('pro', 'knowledge_rag',      true,  NULL),
  ('pro', 'executive_briefing', true,  NULL),
  ('pro', 'ndvi_alerts',        true,  NULL),
  ('pro', 'esg_check',          true,  NULL),
  ('pro', 'ai_agent',           false, 0),
  ('pro', 'expert_consult',     false, 0),
  ('pro', 'api_access',         false, 0),

  -- Enterprise tier
  ('enterprise', 'farm_management',    true,  NULL),
  ('enterprise', 'client_management',  true,  NULL),
  ('enterprise', 'visit_recording',    true,  NULL),
  ('enterprise', 'route_planning',     true,  NULL),
  ('enterprise', 'push_notifications', true,  NULL),
  ('enterprise', 'bureau_lookup',      true,  NULL),
  ('enterprise', 'market_news',        true,  NULL),
  ('enterprise', 'commodity_prices',   true,  NULL),
  ('enterprise', 'input_oracle',       true,  NULL),
  ('enterprise', 'knowledge_rag',      true,  NULL),
  ('enterprise', 'executive_briefing', true,  NULL),
  ('enterprise', 'ndvi_alerts',        true,  NULL),
  ('enterprise', 'esg_check',          true,  NULL),
  ('enterprise', 'ai_agent',           true,  NULL),
  ('enterprise', 'expert_consult',     true,  5),
  ('enterprise', 'api_access',         true,  NULL)
ON CONFLICT (plan_tier, feature_key) DO NOTHING;

-- ============================================================
-- RPC: usage count per feature for a user since a given date
-- Used by GET /api/nocampo/user-plan to build the feature map
-- ============================================================
CREATE OR REPLACE FUNCTION nocampo_usage_counts(p_user_id UUID, p_since TIMESTAMPTZ)
RETURNS TABLE(feature_key TEXT, count BIGINT)
LANGUAGE sql STABLE
AS $$
  SELECT ue.feature_key, count(*)::BIGINT
  FROM usage_events ue
  WHERE ue.user_id = p_user_id
    AND ue.consumed_at >= p_since
  GROUP BY ue.feature_key;
$$;
