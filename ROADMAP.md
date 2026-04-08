# AgriSafe Market Hub — Roadmap

> **Last updated:** 2026-04-08
> 4 verticals · 14 modules · 51 Supabase tables · 39 SQL migrations · 17 cron routes · 9 registered scrapers (all healthy) · 9,674 legal entities · 5-entity model live.
> Latest user task list: `documentation/TODO_2026-04-06.md`

---

## Status Snapshot (2026-04-08)

| Area | Live |
|---|---|
| **Architecture** | 4 verticals (Ingest → Analyze → Create → Comply), 14 modules |
| **5-entity model** | 9,674 legal_entities · 9,609 entity_roles · 143 entity_mentions |
| **Diretório de Canais** | 9,328 retailers · 24,275 retailer_locations (geocoded) · CRM-style 4-card KPI row · sortable columns · RJ + News-mention modals |
| **Diretório de Indústrias** | 274 (18 curated + 256 imported via CSV) · 1,699 cnpj_establishments (100% geocoded via Nominatim) · list+map+expandable rows · 4-button row actions (RF data / Web search / AI analysis / Buscar filiais) |
| **Marco Regulatório** | 16 norms (CVM 6 · BCB 6 · CONGRESSO 3 · CNJ 1) · "Inserir Norma" + "Fontes" modals · CNJ JSON daily · CVM curated daily + historical backfill done · BCB curated · key agro laws (CPR, Falências, Nova Lei do Agro) seeded · news norm-citation extractor inline in sync-agro-news |
| **Recuperação Judicial** | 131 cases (118 RJ + 13 manual) · "Adicionar CNPJ" modal with BrasilAPI lookup + DDG debt scrape |
| **Pulso de Mercado** | BCB SGS · NA prices (regional + futures) · Yahoo intl futures · FAOSTAT macro (5 cultures) · World Bank Pink Sheet annual prices (6 commodities × 15 years) |
| **Notícias Agro** | 203 articles · 5 RSS feeds + Reading Room v3.0 Chrome extension · CRUD modal · entity-mention matcher + norm-citation extractor inline |
| **Eventos Agro** | AgroAgenda + AgroAdvance unified into events table · per-event AI enrichment · source provenance badges |
| **Ingestão de Dados** | 176 sources catalogued (125 active / 25 inactive / 24 error / 2 unchecked) · 9 scrapers in `scraper_registry` · Saúde dos Scrapers tab · source→tables mapping |
| **Inteligência de Insumos** | Oracle UX with culture+pest filter · molecule-grouped brand alternatives sorted by competitiveness (patented → commodity) · federal AGROFIT bulk catalog |
| **Radar Competitivo** | CRUD modal · Harvey Ball matrix · web enrichment per company |
| **Configurações** | Editable analysis lenses (DB-backed prompts via `analysis_lenses` table) · Reading Room install guide |
| **Auth + deploy** | Supabase Auth + SSR middleware · Vercel Hobby (single daily cron at 08:00 UTC) |

---

## What's Live (compact phase history)

Every shipped phase in chronological order. For deeper detail on a specific phase, search the git log by commit message.

| Phase | What | When |
|---|---|---|
| 1–7 | Research, architecture, build v1, Supabase, data ingestion, mobile UI | — |
| 8 | Design System Migration (AgriSafe brand tokens) | — |
| 9 | Charts & Visualization (Recharts across 4 modules) | — |
| R | Four-Vertical Reorganization | — |
| 10–12 | Data Ingestion vertical, Executive Dashboard, Live Data Feeding | — |
| 13 | Regulatory cron pipeline | — |
| 14 | MarketPulse Bloomberg Enhancement | — |
| 15 | Content Intelligence + Source Registry (176 sources catalogued) | — |
| 16a–16v | NA widgets, Embrapa AgroAPI, AgroAgenda, Dashboard Map, RJ web scan, Migrations 015–017 (FK + views), RiskSignals (R$ 582mi cross-vertical), Knowledge Mind Map, Pulso do Mercado redesign, Yahoo intl futures | — |
| **17A–17F** | **5-entity foundation.** Migrations 018-026: legal_entities + farms + assets + commercial_activities + agrisafe_service_contracts + 7 junctions. Backfill 9,433 entities + 9,353 roles. Re-key 5 satellite tables. `entity-matcher.ts` algorithm-first matcher. Confidentiality enum on 31 tables. Views rebuilt with `security_invoker=on`. | 2026-04-06 |
| **18** | **Painel improvements.** KPI cards open ChapterModal · Mapa de Inteligência Integrada with location-parsed news/events/weather · 30/90/Tudo date filter (now also gates news + RJ as past windows) · Notícias → Knowledge Base RAG ingestion. | 2026-04-07 |
| **19A** | **Scraper Resilience Foundation.** Migration 027: `scraper_registry` + `scraper_runs` + `scraper_knowledge`. `runScraper()` wrapper validates output deterministically (no LLM). Saúde dos Scrapers tab + Dashboard "Dados" KPI. SCRAPER_PROTOCOL.md doc. | 2026-04-07 |
| **19B** | **FAOSTAT macro.** Migration 028 + 029: macro_statistics table. `sync-faostat` covers soja/milho/café/trigo/algodão. MarketPulse → Contexto Macro tab live. | 2026-04-07 |
| **20A** | **Inteligência de Insumos Oracle.** Migration 030: industry_products + active_ingredients + product_uses + v_oracle_brand_alternatives. `sync-agrofit-bulk` Sunday-only. Oracle UX with patented→commodity competitiveness ranking. | 2026-04-07 |
| **21** | **Radar Competitivo CRUD + Harvey Ball.** Migration 031. Modal with sliders, web enrichment via `/api/competitors/enrich-web`. | 2026-04-07 |
| **22** | **Notícias Agro CRUD.** Migration 032: news_sources table. Reading Room Chrome extension v3.0 auto-syncs into Supabase via `/api/reading-room/ingest`. | 2026-04-07 |
| **23A** | **Eventos Agro unified.** Migration 034: events extended with source provenance + lat/lng + AI enrichment. AgroAdvance scraper. EventTracker reads from `/api/events-db`. Per-event Enrich button. | 2026-04-07 |
| **24A** | **Diretório split-out + CRM KPI row.** Industries chapter created. RetailerKpiRow with 4 cards (Total + bar / Cities + concentration / In RJ / Mentioned in News). `/api/retailers/kpi-summary`. Sortable columns. | 2026-04-07 |
| **24A1** | **Entity-matcher SHORT_NAME_ALLOWLIST.** ~25 audited iconic agribrands bypass the 10-char minimum. Inverted join in kpi-summary fixes the 1000-row PostgREST cap that hid COMIGO. | 2026-04-07 |
| **24A2** | **Industries CSV backfill.** 256 industries + 163 inpEV members imported into legal_entities + entity_roles. `/api/industries` returns curated+imported union. IndustriesDirectory filter+sort UX. | 2026-04-07 |
| **24B** | **Industries map + EntityMapShell + editable lenses.** Migration 035: cnpj_establishments. `/api/cnpj/establishments` on-demand BrasilAPI fetcher with inline 3-tier geocoding. `EntityMapShell.tsx` shared by both directories (Painel-style layer chips, terrain/satellite, fullscreen, recenter, "Buscar nesta área"). Migration 036: analysis_lenses table. Settings → Lentes de Análise editor. `/api/company-research` reads lens config from DB with code fallback. **Backfill: 1,699 establishments cached, 100% geocoded.** | 2026-04-08 |
| **24C** | **Marco Reg upload + RJ CRUD + Source→Tables mapping.** `/api/regulatory/upload` + Inserir Norma + Fontes modals. `/api/rj-add` with BrasilAPI lookup + DDG debt scrape regex. DataSources `CATEGORY_TO_TABLES` map surfaced in domain expand + per-endpoint detail. | 2026-04-08 |
| **24D** | **Marco Reg scrapers (CVM + BCB + key laws).** Migration 037 + scraper_knowledge note. `sync-cvm-agro` (direct CVM index walker, weekly), `sync-bcb-rural` (curated catalog, weekly), `sync-key-agro-laws` (CPR / Falências / Nova Lei do Agro seeder, weekly). | 2026-04-08 |
| **24E** | **World Bank Pink Sheet.** Migration 038. `sync-worldbank-prices` parses CMO Annual Prices xlsx with header sanity check. 6 commodities × 15 years = 90 rows seeded. MarketPulse Macro tab gets a new "Preço Anual Mundial" line chart. | 2026-04-08 |
| **24F** | **CNJ atos + news norm-citation extractor.** Migration 039. `sync-cnj-atos` walks atos.cnj.jus.br/api/atos JSON daily, regex-filters by agro keywords, upserts hits with body=CNJ. `src/lib/extract-norms-from-news.ts` 11-pattern extractor hooked into sync-agro-news inline. `backfill-norms-from-news.js` for historical reprocessing. **First run found Provimento 216/2026 in the live DB.** | 2026-04-08 |
| **24D-historical** | **Full CVM walk.** `backfill-cvm-historical.js` walked all 868 docs (inst001..627 + resol001..241), surfaced 5 additional historical agro-relevant CVM Resoluções (165, 175, 184, 214 + Instrução 422 + 600). CVM body count: 1 → 6. | 2026-04-08 |
| **27 (UI)** | **Source registry health check.** `check-source-registry.js` probed all 176 entries. Result: 125 active / 25 inactive / 24 error / 2 unchecked. Ingestão de Dados KPI strip now reflects real data instead of "166 unchecked". | 2026-04-08 |

---

## Active Backlog (what's still open)

Items grouped by intent. Priority order within each group is roughly decreasing.

### Marco Regulatório / Compliance

- **CNAE classifier on insert** — when a norm is inserted (manually or via CNJ scraper), run an algorithmic CNAE classifier to populate an `affected_companies` array. The norm-extractor lib already tags `affected_areas`; mapping those to CNAEs is the missing step.
- **CVM date-extractor fix** — `cvm-422` and `cvm-175` get `published_at = today` because the date regex picks up CVM's "last updated" footer instead of the original publication date in `<p>` body. Look in the first body paragraph, not the page footer.
- **Tighten CVM agro pattern** — `fundo.{0,30}agro` clause causes 2/6 false positives (cvm-165, cvm-600). Consider dropping it; the FIAGRO matches don't need it.

### Ingestão de Dados

- **Source CRUD UI** — sources currently live in `source-registry.json`. Add a `data_sources` table or extend the `news_sources` pattern, expose CRUD in DataSources tab.
- **Per-source enable/disable toggle** — once source CRUD lands, write to `data_sources.active`.
- **`source-registry.json` periodic re-check** — `check-source-registry.js` is one-shot today. Wire it into a Sunday-only cron so the registry stays fresh.
- **Walk all 600 CVM inst###.html** — ✅ **DONE 2026-04-08** via `backfill-cvm-historical.js`.

### Pulso de Mercado

- **USDA PSD scrapers** — oilseeds (3.7 MB) + grains_pulses (2.7 MB) + cotton (459 KB) ZIPs all alive. Need a ZIP-CSV parser dep (`yauzl` or equivalent). Marginal value over FAOSTAT but adds country-level production/exports forecasts.
- **OECD-FAO Agricultural Outlook xlsx** — URL changes annually, data is forward-projection. Skip until/unless the user explicitly asks for forecast data.
- **MDIC ComexStat scraper** — Brazilian export volumes/values by HS code. The probe in Phase 24E showed comexstat.mdic.gov.br is alive but layout needs analysis.
- **CONAB safra monthly reports** — Brazilian production by state and crop.
- **FAOSTAT QL livestock domain** — boi-gordo coverage (currently mock).

### Inteligência de Insumos

- **State sources** — per-state secretaria de agricultura lists for products approved at state level. Schema is ready (`industry_products.source_dataset` enum has `state_secretaria_*` slots). Priority states: MT, MS, GO, PR, RS, SP, MG, BA. Needs URL + selector verification per state.
- **Manufacturer backfill** — walk distinct AGROFIT `titular_registro` values that don't match any pre-existing `industries` row, propose new entries.
- **Real price data** — v0 Oracle uses `holder_count` as a proxy for "cheaper alternative". A real price comparison needs scraping retailer price tables.
- **Region awareness** — kicks in once state secretariat scrapers ship.

### Diretório (CRM build-out — Phase 24G)

- **Companies expanding operations** — query Receita Federal `crawlers.cnpj_estabelecimentos` for recently opened CNPJs in agribusiness CNAEs by region.
- **Per-company enrichment** — Google Maps Street View / Places photo of POS, OneNote meeting file imports, key persons, lead pipeline.
- **3-tier confidentiality enforcement at query level** — column exists on 20+ tables (mig 022); reads don't filter on it yet.
- **Knowledge Base + chat tier-aware filtering** — chat must never leak `agrisafe_confidential` content to a `public`-tier session.
- **CRM workflow** — schedule meetings, find leads, push leads to Central de Conteúdo for newsletter / WhatsApp / email outreach.

### Knowledge / RAG / Webapp

- **MCP server** that exposes the knowledge base to Claude / GPT / other LLM agents.
- **RAG endpoint with confidentiality-tier-aware filtering** — pgvector retrieval respecting the user's tier permissions.
- **Daily executive briefing** generated from the knowledge base.
- **Anomaly narratives** when MarketPulse detects rupture (`Math.abs(change) > 2 * stddev`).
- **Webapp build** — same UI as the Next.js app but with a permanent chat panel always available.
- **Cron-driven LLM agents** — scan news/events for entity mentions and enrich the knowledge base.

### Eventos Agro (Phase 23B)

- **App Campo integration** — mobile-side API contract pending.
- **Geocoding backfill** — populate `events.latitude`/`longitude` for the existing 47 rows so the Dashboard map plots them. Reuse `geocode-retailers.js` 3-tier pattern.
- **`organizer_cnpj` linking** — when a scraper finds a CNPJ in the event description, route through `ensureLegalEntityUid()`.
- **baldebranco scraper** — only revisit if (a) page becomes structured or (b) user authorizes a manual one-shot LLM extractor with human review.

### Cleanup / Tech debt

- **Drop legacy `cnpj_raiz` / `cnpj_basico` text columns** once nothing reads them.
- **Wire entity-matcher into `sync-events-na`, `sync-regulatory`, `archive-old-news`** — currently only sync-agro-news + reading-room/ingest run it.
- **Refresh `KnowledgeMindMap.tsx` "current state" view** — the future-state nodes shown there are now real, not aspirational.
- **Migrate the remaining `cnpj_raiz` reads** in RetailersDirectory.tsx, RegulatoryFramework.tsx, RecuperacaoJudicial.tsx, CompetitorRadar.tsx to `entity_uid`.
- **Migrate `sync-events-na` to `runScraper()`** — currently still on `logSync()`.

### Polish (Phase 30)

- Sentry error monitoring · WCAG 2.1 accessibility · Dark mode toggle · Ctrl+K command palette · CSV/PDF export per module · Institutional PDF executive briefing format.

---

## Reference

### Cron pipeline (`/api/cron/sync-all` → daily 08:00 UTC)

**11 daily jobs:**
1. `sync-market-data` — BCB SGS → `commodity_prices`, `market_indicators`
2. `sync-agro-news` — 5 RSS feeds → `agro_news` (+ entity-matcher + Phase 24F norm extractor → `regulatory_norms`)
3. `sync-recuperacao-judicial` — 2 legal RSS → `recuperacao_judicial`
4. `archive-old-news` — OpenAI summaries + pgvector → `news_knowledge`
5. `sync-regulatory` — 3 legal RSS → `regulatory_norms`
6. `sync-cnj-atos` — CNJ JSON API → `regulatory_norms`
7. `sync-events-na` — AgroAgenda → `events`
8. `sync-competitors` — competitor enrichment → `competitor_signals`
9. `sync-retailer-intelligence` — AI retailer intelligence → `retailer_intelligence`
10. `sync-faostat` — FAOSTAT macro production → `macro_statistics`
11. `sync-scraper-healthcheck` — no-op probe for `runScraper()` wiring

**6 Sunday-only jobs:**
12. `sync-industry-profiles` — industry profile enrichment
13. `sync-agrofit-bulk` — federal AGROFIT crawl → `industry_products`
14. `sync-events-agroadvance` — annual AgroAdvance list → `events`
15. `sync-cvm-agro` — CVM legislacao walker → `regulatory_norms`
16. `sync-bcb-rural` — curated BCB landing-page catalog → `regulatory_norms`
17. `sync-key-agro-laws` — Lei CPR / Falências / Nova Lei do Agro seed → `regulatory_norms`
18. `sync-worldbank-prices` — World Bank Pink Sheet xlsx → `macro_statistics`

### Database tables (live)

**Core 5-entity model (Phase 17A — migrations 018-019)**
- `legal_entities` (9,674) · `entity_roles` (9,609) · `entity_mentions` (143)
- `farms` · `assets` · `commercial_activities` · `agrisafe_service_contracts` (all 0 — empty until ingestion)
- `groups` · `group_members` · `farm_ownership` · `asset_parties` · `agrisafe_service_targets` (junctions)

**Public-data layer**
- Channels: `retailers` (9,328) · `retailer_locations` (24,275) · `cnpj_establishments` (1,699)
- Industries: `industries` (18 curated, 256 imported via entity_roles) · `industry_products` (growing) · `retailer_industries` (392) · `active_ingredients` · `industry_product_uses` · `industry_product_ingredients`
- Risk: `recuperacao_judicial` (131)
- News + content: `agro_news` (203) · `news_sources` (6+) · `news_knowledge` · `knowledge_items` · `published_articles` (6) · `content_topics` (5) · `competitors` (7) · `competitor_signals` (13)
- Regulatory: `regulatory_norms` (16: CVM 6 + BCB 6 + CONGRESSO 3 + CNJ 1)
- Macro: `commodity_prices` (6) · `commodity_price_history` · `market_indicators` (6) · `macro_statistics` (96: WB 90 + USDA 6) · `commodity_prices_regional`
- Events: `events`
- Enrichment: `company_enrichment` · `company_notes` · `company_research` (with `analysis_type` column from Phase 24B)
- Config: `analysis_lenses` (3: retailer, industry, generic)
- Telemetry: `scraper_registry` (9 healthy) · `scraper_runs` · `scraper_knowledge` · `sync_logs`

**Views (rebuilt in Phase 17B/17E with `security_invoker=on`)**
- `v_retailer_profile` — retailer + RF enrichment + intelligence in one row
- `v_retailers_in_rj` — retailers ∩ RJ (powers RiskSignals)
- `v_entity_profile` — canonical "everything I know about entity X"
- `v_oracle_brand_alternatives` — Oracle substitution view (Phase 20A)

### Sidebar structure (current)

```
Painel (Executive Overview)

INGESTÃO DE DADOS
  Fontes de Dados (176 sources, Saúde dos Scrapers tab)

INTELIGÊNCIA DE MERCADO
  Pulso do Mercado          (BCB + NA + Yahoo + FAOSTAT + WB Pink Sheet)
  Inteligência de Insumos   (Oracle)
  Radar Competitivo         (CRUD + Harvey Ball)
  Notícias Agro             (CRUD + Reading Room)
  Eventos Agro              (AgroAgenda + AgroAdvance + AI enrich)

DIRETÓRIO
  Diretório de Canais       (CRM-style)
  Diretório de Indústrias   (list + map + filiais)

MARKETING & CONTEÚDO
  Central de Conteúdo

REGULATÓRIO
  Marco Regulatório         (16 norms + insert + sources modal)
  Recuperação Judicial      (131 cases + add CNPJ + DDG debt scrape)

BASE DE CONHECIMENTO
  Busca Semântica
  Mapa de Conexões

CONFIGURAÇÕES
  Lentes de Análise (editable prompts) · Reading Room install · Help
```

---

## Strategic Vision

Market Hub is **not just a dashboard** — it is the knowledge engine of the AgriSafe ecosystem:

1. **Data is ingested** algorithmically from public sources (176 catalogued, ~125 active) — **no LLM scraping**
2. **Knowledge is organized** around the 5 core entities and the 4 confidentiality tiers
3. **Insights are generated** by cross-referencing entities (e.g. `v_retailers_in_rj` revealed R$ 582.6M of distressed channels)
4. **Content is created** — LinkedIn articles, campaigns, positioning — feeding back into the AgriSafe brand
5. **The brain is built** — RAG structure that becomes AgriSafe's digital twin, accessible via a webapp chat interface

The platform serves multiple AgriSafe products downstream:
- **Admin Portal** — credit risk, commercial intelligence
- **App Campo** — field sales agenda, client visits, calendar from Eventos Agro
- **Newsletter / WhatsApp outreach** — driven by Central de Conteúdo + CRM leads from Diretório de Canais
- **External chat** (planned) — webapp UI with permanent chat panel over the knowledge base, RAG with tier-aware permissions

---

## Hard Guardrails (non-negotiable)

See `CLAUDE.md` for the full text.

1. **Algorithms first, LLMs last** — every "extract from page" or "match a CNPJ" task uses regex/Cheerio/SQL, never an LLM. LLMs are reserved for prose generation and chat.
2. **Everything links to the 5 entities** — every new table either FKs to one of the 5 nodes or writes to `entity_mentions`.
3. **Public data only** — client PII / financial records / proprietary data are tagged via the `confidentiality` enum and never live in the public layer.
4. **Single Vercel cron** (Hobby plan limit) — `sync-all` consolidates all jobs.
5. **Bilingual always** — every UI string in PT-BR + EN via `src/lib/i18n.ts`.
6. **MockBadge required** when a section falls back to mock data.
