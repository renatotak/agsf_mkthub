# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AgriSafe Market Hub (`agrisafe-hub`) is a bilingual (PT-BR/EN) public market intelligence platform for AgriSafe Tecnologia, a Brazilian agritech company. It aggregates **exclusively public data** (no proprietary client data, credentials, or PII) from public APIs, government databases, RSS feeds, and open market feeds to produce market reports, agro news, retailer directories, judicial recovery monitoring, CRM pipeline views, campaign planning, competitor tracking, and event management for Brazilian agribusiness.

## Commands

```bash
npm run dev              # Start dev server (Next.js)
npm run build            # Production build
npm run start            # Start production server
npm run import-retailers # One-time import of retailers from Excel into Supabase
```

No test runner or linter is currently configured.

## Architecture

- **Framework:** Next.js 16 (App Router) with TypeScript strict mode
- **Styling:** Tailwind CSS 4 via PostCSS
- **Backend:** Supabase (PostgreSQL with RLS) — browser client, server client, and admin client (bypasses RLS for cron jobs)
- **Auth:** Supabase Auth + SSR with middleware-based route protection
- **AI:** OpenAI (scaffolded in archive-old-news and generate-ideas; not yet integrated for content generation)
- **Data ingestion:** BCB SGS API (commodities, FX, Selic), RSS feeds via `rss-parser` (news, legal), web scraping via `cheerio`
- **Deployment:** Vercel with consolidated daily cron at 08:00 UTC (`/api/cron/sync-all`)
- **Path alias:** `@/*` maps to `./src/*`

### Module Structure

The dashboard (`src/app/page.tsx`) renders 11 modules via `activeModule` state routing, organized in 3 sidebar groups:

#### Market Intelligence

| Module | Component | Data | Supabase Tables |
|--------|-----------|------|-----------------|
| Market Pulse | `MarketPulse.tsx` | `market.ts` | `commodity_prices`, `market_indicators` |
| Campaign Center | `CampaignCenter.tsx` | `campaigns.ts` | `campaigns` |
| Content Engine | `ContentEngine.tsx` | `campaigns.ts` | `content_ideas` |
| Competitor Radar | `CompetitorRadar.tsx` | `competitors.ts` | `competitors`, `competitor_signals` |
| Event Tracker | `EventTracker.tsx` | `events.ts` | `events` |

#### Sales Intelligence

| Module | Component | Data | Supabase Tables |
|--------|-----------|------|-----------------|
| CRM & Clients | `CRM.tsx` | `crm.ts` | `contacts`, `companies`, `interactions` |
| Company Research | `CompanyResearch.tsx` | `company-research.ts` | — (API-driven lookups) |
| Distribution Channels | `DistributionChannels.tsx` | `channels.ts` | — (derived from retailers data) |

#### Data & Compliance

| Module | Component | Data | Supabase Tables |
|--------|-----------|------|-----------------|
| Agro News | `AgroNews.tsx` | `news.ts` | `agro_news`, `highlighted_producers` |
| Retailers Directory | `RetailersDirectory.tsx` | `retailers.ts` | `retailers`, `retailer_locations` |
| Recuperacao Judicial | `RecuperacaoJudicial.tsx` | `recuperacao.ts` | `recuperacao_judicial` |

### Cron Pipeline

All automated data gathering runs through `/api/cron/sync-all` (single Vercel cron for Hobby plan compatibility), which dispatches sequentially:

1. **sync-market-data** — Fetches commodity prices from BCB SGS API (series 11752–11757 for soy, corn, coffee, sugar, cotton, citrus) and macro indicators (series 1 for USD/BRL, series 432 for Selic). Calculates 24h change from last 2 data points. Upserts to `commodity_prices` and `market_indicators`.
2. **sync-agro-news** — Parses RSS feeds (Canal Rural, Sucesso no Campo, Agrolink, CNA). Auto-categorizes articles (commodities, credit, technology, policy, sustainability, judicial, general). Matches against `highlighted_producers` keywords. Upserts to `agro_news` (conflict on `source_url`).
3. **sync-recuperacao-judicial** — Parses legal RSS feeds (ConJur, Migalhas). Dual-filter: must match both `recuperação judicial` AND agro keywords. Classifies entity type and extracts state. Upserts to `recuperacao_judicial`.
4. **archive-old-news** — Archives articles older than 3 months. Groups by category+source+month, generates summaries via OpenAI `gpt-4o-mini`, creates embeddings via `text-embedding-3-small`, stores in `news_knowledge` (pgvector), then deletes originals from `agro_news`.

Individual cron routes can also be called directly for testing.

### Key Directories

- `src/components/` — 11 module components (each fetches from Supabase with loading states)
- `src/data/` — TypeScript interfaces and seed/fallback data for each module
- `src/lib/i18n.ts` — All UI translations (PT-BR and EN); usage: `const tr = t(lang)`
- `src/lib/supabase.ts` — Browser client singleton
- `src/utils/supabase/` — Client factories: `client.ts` (browser), `server.ts` (server), `admin.ts` (service role for cron), `middleware.ts` (session refresh)
- `src/app/api/cron/` — Cron routes: `sync-all` (orchestrator), `sync-market-data`, `sync-agro-news`, `sync-recuperacao-judicial`, `archive-old-news`
- `src/app/api/ai/` — AI route: `generate-ideas` (mock impl, OpenAI integration pending)
- `src/scripts/` — One-time scripts: `import-retailers.ts` (Excel → Supabase)
- `src/db/migrations/` — SQL migration files (`001_new_modules.sql`)
- `src/app/login/` — Auth page + server actions

### Auth Flow

Middleware (`src/middleware.ts` → `src/utils/supabase/middleware.ts`) protects all routes except `/login` and `/api/cron/*`. Unauthenticated users redirect to `/login`; authenticated users on `/login` redirect to `/`.

### Data Sources

| Source | API / Method | Data Retrieved | Update Frequency |
|--------|-------------|----------------|-----------------|
| BCB SGS API | REST (`api.bcb.gov.br`) | Commodity prices (6), USD/BRL, Selic | Daily via cron |
| Canal Rural RSS | `rss-parser` | Agro news articles | Daily via cron |
| Sucesso no Campo RSS | `rss-parser` | Agro news articles | Daily via cron |
| Agrolink RSS | `rss-parser` | Agro news articles | Daily via cron |
| CNA Noticias RSS | `rss-parser` | Agro news articles | Daily via cron |
| ConJur RSS | `rss-parser` + regex filter | Judicial recovery filings | Daily via cron |
| Migalhas RSS | `rss-parser` + regex filter | Judicial recovery filings | Daily via cron |
| State registries (Excel) | `xlsx` import script | Retailer licenses & locations | One-time batch import |

## Environment Variables

Required in `.env.local`:
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase project (public client)
- `SUPABASE_SERVICE_ROLE_KEY` — Admin access (bypasses RLS, required for cron writes)
- `CRON_SECRET` — Bearer token for Vercel cron endpoint authentication

Optional:
- `OPENAI_API_KEY` — Required for `archive-old-news` summarization and future `generate-ideas` integration

## Design Tokens

- Primary: `--agri-green: #16a34a`
- Dark: `--agri-dark: #0f172a`
- Light: `--agri-light: #f0fdf4`
- Accent: `--agri-yellow: #eab308`

## Important Constraints

- **Public data only** — Never store, ingest, or reference proprietary client data, financial records, or PII
- **Bilingual always** — Every user-facing string must exist in both PT-BR and EN via `src/lib/i18n.ts`
- **Supabase tables required** — New modules need their Supabase tables created before data can be ingested (see `src/db/migrations/` for schemas and `src/data/*.ts` for interfaces)
- **Single cron** — Vercel Hobby plan limits to 2 crons; `sync-all` consolidates all jobs into 1
- **No PII in CRM** — The CRM module tracks pipeline stages and categories, not real client identities
