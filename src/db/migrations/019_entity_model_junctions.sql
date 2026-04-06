-- ============================================================
-- Migration 019: Junction & Support Tables (Phase 17A)
-- Depends on: 018_entity_model_core.sql
-- ============================================================
--
-- This migration adds the connective tissue between the 5 core
-- nodes from migration 018, plus the groups/client layer.
--
-- - entity_roles              — multi-role per entity (retailer + producer + client at once)
-- - groups + group_members    — named collections (clients, cooperatives, portfolios)
-- - farm_ownership            — multi-shareholder farms (mixing CPF + CNPJ)
-- - asset_parties             — multi-stakeholder assets (borrower, lender, guarantor)
-- - agrisafe_service_targets  — polymorphic targeting (farm | entity | group | asset)
-- - entity_mentions           — cross-cutting facts (news, regs, events mention entities)
--
-- Also adds the deferred FK from agrisafe_service_contracts to groups
-- (couldn't be added in 018 because groups didn't exist yet).
-- ============================================================

-- ─── entity_roles ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS entity_roles (
  entity_uid  uuid NOT NULL REFERENCES legal_entities(entity_uid) ON DELETE CASCADE,
  role_type   text NOT NULL
    CHECK (role_type IN (
      'industry','retailer','cooperative','frigorifico','trader','distribuidor',
      'rural_producer','professional','government','competitor',
      'agrisafe_client','agrisafe_partner','other'
    )),
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (entity_uid, role_type)
);

CREATE INDEX IF NOT EXISTS idx_er_role ON entity_roles(role_type);

ALTER TABLE entity_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_entity_roles" ON entity_roles;
CREATE POLICY "public_read_entity_roles" ON entity_roles FOR SELECT USING (true);

DROP POLICY IF EXISTS "service_write_entity_roles" ON entity_roles;
CREATE POLICY "service_write_entity_roles" ON entity_roles
  FOR ALL USING (auth.role() = 'service_role');

COMMENT ON TABLE entity_roles IS
  'Multi-role per entity. A single CNPJ can simultaneously be retailer + producer + agrisafe_client.';

-- ─── groups + group_members ──────────────────────────────────

CREATE TABLE IF NOT EXISTS groups (
  group_uid                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_type               text NOT NULL
    CHECK (group_type IN (
      'client_household','client_corporate_group',
      'cooperative_membership','monitoring_portfolio',
      'lead_segment','newsletter_audience','other'
    )),
  name                     text NOT NULL,
  billing_email            text,
  primary_payer_entity_uid uuid REFERENCES legal_entities(entity_uid) ON DELETE SET NULL,
  confidentiality          text NOT NULL DEFAULT 'agrisafe_confidential'
    CHECK (confidentiality IN ('public','agrisafe_published','agrisafe_confidential','client_confidential')),
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_groups_type ON groups(group_type);

ALTER TABLE groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_all_groups" ON groups;
CREATE POLICY "service_all_groups" ON groups
  FOR ALL USING (auth.role() = 'service_role');

COMMENT ON TABLE groups IS
  'Named collection of legal entities — clients, cooperatives, AgriSafe portfolios, audiences.';

CREATE TABLE IF NOT EXISTS group_members (
  group_uid   uuid NOT NULL REFERENCES groups(group_uid) ON DELETE CASCADE,
  entity_uid  uuid NOT NULL REFERENCES legal_entities(entity_uid) ON DELETE CASCADE,
  joined_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_uid, entity_uid)
);

CREATE INDEX IF NOT EXISTS idx_gm_entity ON group_members(entity_uid);

ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_all_group_members" ON group_members;
CREATE POLICY "service_all_group_members" ON group_members
  FOR ALL USING (auth.role() = 'service_role');

-- Add the deferred FK from service contracts to groups
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_asc_client_group'
      AND table_name = 'agrisafe_service_contracts'
  ) THEN
    ALTER TABLE agrisafe_service_contracts
      ADD CONSTRAINT fk_asc_client_group
      FOREIGN KEY (client_group_uid) REFERENCES groups(group_uid) ON DELETE RESTRICT;
  END IF;
END $$;

-- ─── farm_ownership ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS farm_ownership (
  farm_uid       uuid NOT NULL REFERENCES farms(farm_uid) ON DELETE CASCADE,
  entity_uid     uuid NOT NULL REFERENCES legal_entities(entity_uid) ON DELETE CASCADE,
  ownership_type text NOT NULL DEFAULT 'sole'
    CHECK (ownership_type IN ('sole','joint','partnership','heir','lessee','manager','other')),
  share_pct      numeric(5,2) CHECK (share_pct IS NULL OR (share_pct >= 0 AND share_pct <= 100)),
  since_date     date,
  PRIMARY KEY (farm_uid, entity_uid, ownership_type)
);

CREATE INDEX IF NOT EXISTS idx_fo_entity ON farm_ownership(entity_uid);

ALTER TABLE farm_ownership ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_farm_ownership" ON farm_ownership;
CREATE POLICY "public_read_farm_ownership" ON farm_ownership FOR SELECT USING (true);

DROP POLICY IF EXISTS "service_write_farm_ownership" ON farm_ownership;
CREATE POLICY "service_write_farm_ownership" ON farm_ownership
  FOR ALL USING (auth.role() = 'service_role');

COMMENT ON TABLE farm_ownership IS
  'Multi-shareholder farms. One row per owner entity, with optional share_pct. CPF + CNPJ can mix freely.';

-- ─── asset_parties ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS asset_parties (
  asset_uid   uuid NOT NULL REFERENCES assets(asset_uid) ON DELETE CASCADE,
  entity_uid  uuid NOT NULL REFERENCES legal_entities(entity_uid) ON DELETE CASCADE,
  party_role  text NOT NULL
    CHECK (party_role IN ('borrower','lender','guarantor','beneficiary','custodian','broker','other')),
  share_pct   numeric(5,2) CHECK (share_pct IS NULL OR (share_pct >= 0 AND share_pct <= 100)),
  PRIMARY KEY (asset_uid, entity_uid, party_role)
);

CREATE INDEX IF NOT EXISTS idx_ap_entity ON asset_parties(entity_uid);
CREATE INDEX IF NOT EXISTS idx_ap_role ON asset_parties(party_role);

ALTER TABLE asset_parties ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_asset_parties" ON asset_parties;
CREATE POLICY "public_read_asset_parties" ON asset_parties FOR SELECT USING (true);

DROP POLICY IF EXISTS "service_write_asset_parties" ON asset_parties;
CREATE POLICY "service_write_asset_parties" ON asset_parties
  FOR ALL USING (auth.role() = 'service_role');

COMMENT ON TABLE asset_parties IS
  'Multi-party stakeholders on an asset. One row per (asset, entity, role). A CPR with 2 co-borrowers + 1 lender + 1 guarantor has 4 rows.';

-- ─── agrisafe_service_targets ────────────────────────────────
-- Polymorphic junction. target_type tells you which node target_id points to.
-- We intentionally skip a strict FK constraint on target_id because it's polymorphic.

CREATE TABLE IF NOT EXISTS agrisafe_service_targets (
  service_uid  uuid NOT NULL REFERENCES agrisafe_service_contracts(service_uid) ON DELETE CASCADE,
  target_type  text NOT NULL CHECK (target_type IN ('farm','entity','group','asset')),
  target_id    uuid NOT NULL,
  added_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (service_uid, target_type, target_id)
);

CREATE INDEX IF NOT EXISTS idx_ast_target ON agrisafe_service_targets(target_type, target_id);

ALTER TABLE agrisafe_service_targets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_all_service_targets" ON agrisafe_service_targets;
CREATE POLICY "service_all_service_targets" ON agrisafe_service_targets
  FOR ALL USING (auth.role() = 'service_role');

COMMENT ON TABLE agrisafe_service_targets IS
  'Polymorphic targets for an AgriSafe service contract. A monitoring contract can have multiple targets of different types (farm + entity + asset) in one contract.';

-- ─── entity_mentions ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS entity_mentions (
  entity_uid    uuid NOT NULL REFERENCES legal_entities(entity_uid) ON DELETE CASCADE,
  source_table  text NOT NULL,  -- e.g. 'agro_news', 'regulatory_norms', 'events', 'recuperacao_judicial'
  source_id     text NOT NULL,  -- FK into the source table (text because source tables use text ids)
  mention_type  text NOT NULL DEFAULT 'mentioned'
    CHECK (mention_type IN ('subject','organizer','party','beneficiary','affected','mentioned')),
  sentiment     text CHECK (sentiment IS NULL OR sentiment IN ('positive','neutral','negative')),
  extracted_by  text,  -- e.g. 'regex_v1', 'gemini_ner', for provenance
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (entity_uid, source_table, source_id, mention_type)
);

CREATE INDEX IF NOT EXISTS idx_em_source ON entity_mentions(source_table, source_id);
CREATE INDEX IF NOT EXISTS idx_em_type ON entity_mentions(mention_type);

ALTER TABLE entity_mentions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_entity_mentions" ON entity_mentions;
CREATE POLICY "public_read_entity_mentions" ON entity_mentions FOR SELECT USING (true);

DROP POLICY IF EXISTS "service_write_entity_mentions" ON entity_mentions;
CREATE POLICY "service_write_entity_mentions" ON entity_mentions
  FOR ALL USING (auth.role() = 'service_role');

COMMENT ON TABLE entity_mentions IS
  'Cross-cutting facts. Scraped news / regulations / events write rows here whenever they mention a known entity. Lets a single query fan out across all data sources for one entity_uid.';
