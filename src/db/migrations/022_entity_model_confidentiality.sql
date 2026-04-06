-- ============================================================
-- Migration 022: Confidentiality tier on remaining tables (Phase 17B)
-- Depends on: 018, 019, 020, 021
-- ============================================================
--
-- Adds the 4-tier `confidentiality` enum column to every data-bearing
-- table that doesn't yet have one. The tiers are:
--
--   public                 — Public-domain data (Receita, news, norms, events, public prices)
--   agrisafe_published     — AgriSafe curated outputs (published articles, research, intel)
--   agrisafe_confidential  — Internal (notes, content pipeline, competitor signals, CRM)
--   client_confidential    — Partner-shared under NDA (future — reserved)
--
-- Junction tables (entity_roles, farm_ownership, asset_parties,
-- group_members, agrisafe_service_targets, entity_mentions) do NOT get
-- their own column — they inherit the tier of the parent row.
--
-- Reference/lookup tables (cnae, natureza_juridica, empresas,
-- estabelecimentos, sync_logs) also stay untagged — they're either
-- fully public reference data or system internals.
-- ============================================================

-- Helper: a single CHECK CONSTRAINT expression reused below
-- (inlined per column since PostgreSQL doesn't have domain-per-column easily here)

-- ─── Public-tier tables ─────────────────────────────────────
-- Everything sourced from public data (Receita, news, norms, prices).

ALTER TABLE agro_news            ADD COLUMN IF NOT EXISTS confidentiality text NOT NULL DEFAULT 'public' CHECK (confidentiality IN ('public','agrisafe_published','agrisafe_confidential','client_confidential'));
ALTER TABLE events               ADD COLUMN IF NOT EXISTS confidentiality text NOT NULL DEFAULT 'public' CHECK (confidentiality IN ('public','agrisafe_published','agrisafe_confidential','client_confidential'));
ALTER TABLE regulatory_norms     ADD COLUMN IF NOT EXISTS confidentiality text NOT NULL DEFAULT 'public' CHECK (confidentiality IN ('public','agrisafe_published','agrisafe_confidential','client_confidential'));
ALTER TABLE recuperacao_judicial ADD COLUMN IF NOT EXISTS confidentiality text NOT NULL DEFAULT 'public' CHECK (confidentiality IN ('public','agrisafe_published','agrisafe_confidential','client_confidential'));
ALTER TABLE industries           ADD COLUMN IF NOT EXISTS confidentiality text NOT NULL DEFAULT 'public' CHECK (confidentiality IN ('public','agrisafe_published','agrisafe_confidential','client_confidential'));
ALTER TABLE industry_products    ADD COLUMN IF NOT EXISTS confidentiality text NOT NULL DEFAULT 'public' CHECK (confidentiality IN ('public','agrisafe_published','agrisafe_confidential','client_confidential'));
ALTER TABLE competitors          ADD COLUMN IF NOT EXISTS confidentiality text NOT NULL DEFAULT 'public' CHECK (confidentiality IN ('public','agrisafe_published','agrisafe_confidential','client_confidential'));
ALTER TABLE retailers            ADD COLUMN IF NOT EXISTS confidentiality text NOT NULL DEFAULT 'public' CHECK (confidentiality IN ('public','agrisafe_published','agrisafe_confidential','client_confidential'));
ALTER TABLE retailer_locations   ADD COLUMN IF NOT EXISTS confidentiality text NOT NULL DEFAULT 'public' CHECK (confidentiality IN ('public','agrisafe_published','agrisafe_confidential','client_confidential'));
ALTER TABLE retailer_industries  ADD COLUMN IF NOT EXISTS confidentiality text NOT NULL DEFAULT 'public' CHECK (confidentiality IN ('public','agrisafe_published','agrisafe_confidential','client_confidential'));
ALTER TABLE company_enrichment   ADD COLUMN IF NOT EXISTS confidentiality text NOT NULL DEFAULT 'public' CHECK (confidentiality IN ('public','agrisafe_published','agrisafe_confidential','client_confidential'));
ALTER TABLE commodity_prices         ADD COLUMN IF NOT EXISTS confidentiality text NOT NULL DEFAULT 'public' CHECK (confidentiality IN ('public','agrisafe_published','agrisafe_confidential','client_confidential'));
ALTER TABLE commodity_price_history  ADD COLUMN IF NOT EXISTS confidentiality text NOT NULL DEFAULT 'public' CHECK (confidentiality IN ('public','agrisafe_published','agrisafe_confidential','client_confidential'));
ALTER TABLE market_indicators    ADD COLUMN IF NOT EXISTS confidentiality text NOT NULL DEFAULT 'public' CHECK (confidentiality IN ('public','agrisafe_published','agrisafe_confidential','client_confidential'));
ALTER TABLE news_knowledge       ADD COLUMN IF NOT EXISTS confidentiality text NOT NULL DEFAULT 'public' CHECK (confidentiality IN ('public','agrisafe_published','agrisafe_confidential','client_confidential'));
ALTER TABLE knowledge_items      ADD COLUMN IF NOT EXISTS confidentiality text NOT NULL DEFAULT 'public' CHECK (confidentiality IN ('public','agrisafe_published','agrisafe_confidential','client_confidential'));

-- ─── AgriSafe-published tier ────────────────────────────────
-- Curated outputs that may be shared with partners but are AgriSafe-authored.

ALTER TABLE published_articles   ADD COLUMN IF NOT EXISTS confidentiality text NOT NULL DEFAULT 'agrisafe_published' CHECK (confidentiality IN ('public','agrisafe_published','agrisafe_confidential','client_confidential'));
ALTER TABLE retailer_intelligence ADD COLUMN IF NOT EXISTS confidentiality text NOT NULL DEFAULT 'agrisafe_published' CHECK (confidentiality IN ('public','agrisafe_published','agrisafe_confidential','client_confidential'));
ALTER TABLE company_research     ADD COLUMN IF NOT EXISTS confidentiality text NOT NULL DEFAULT 'agrisafe_published' CHECK (confidentiality IN ('public','agrisafe_published','agrisafe_confidential','client_confidential'));
ALTER TABLE content_topics       ADD COLUMN IF NOT EXISTS confidentiality text NOT NULL DEFAULT 'agrisafe_published' CHECK (confidentiality IN ('public','agrisafe_published','agrisafe_confidential','client_confidential'));
ALTER TABLE highlighted_producers ADD COLUMN IF NOT EXISTS confidentiality text NOT NULL DEFAULT 'agrisafe_published' CHECK (confidentiality IN ('public','agrisafe_published','agrisafe_confidential','client_confidential'));
ALTER TABLE competitor_signals   ADD COLUMN IF NOT EXISTS confidentiality text NOT NULL DEFAULT 'agrisafe_published' CHECK (confidentiality IN ('public','agrisafe_published','agrisafe_confidential','client_confidential'));

-- ─── AgriSafe-confidential tier ─────────────────────────────
-- Internal CRM / pipeline / notes — never leaves AgriSafe.

ALTER TABLE company_notes        ADD COLUMN IF NOT EXISTS confidentiality text NOT NULL DEFAULT 'agrisafe_confidential' CHECK (confidentiality IN ('public','agrisafe_published','agrisafe_confidential','client_confidential'));
ALTER TABLE content_ideas        ADD COLUMN IF NOT EXISTS confidentiality text NOT NULL DEFAULT 'agrisafe_confidential' CHECK (confidentiality IN ('public','agrisafe_published','agrisafe_confidential','client_confidential'));
ALTER TABLE campaigns            ADD COLUMN IF NOT EXISTS confidentiality text NOT NULL DEFAULT 'agrisafe_confidential' CHECK (confidentiality IN ('public','agrisafe_published','agrisafe_confidential','client_confidential'));

-- ─── Indexes for tier-filtered queries ──────────────────────
-- Low-cardinality column, so these indexes pay off only when you combine
-- them with another predicate. Added on the biggest tables only.

CREATE INDEX IF NOT EXISTS idx_agro_news_conf    ON agro_news(confidentiality);
CREATE INDEX IF NOT EXISTS idx_retailers_conf    ON retailers(confidentiality);
CREATE INDEX IF NOT EXISTS idx_commodity_hist_conf ON commodity_price_history(confidentiality);

COMMENT ON COLUMN retailers.confidentiality IS
  'Tier: public (Receita layer), agrisafe_published (curated), agrisafe_confidential (CRM internals), client_confidential (NDA).';
