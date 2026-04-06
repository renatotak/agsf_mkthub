# AGENTS.md — AgriSafe Market Hub

> Universal agent context file (Cursor · Gemini CLI · Windsurf · GitHub Copilot · Antigravity).
> Tool-specific overrides in CLAUDE.md. Human overview in README.md.

## What This Project Is

AgriSafe Market Hub (`agsf-mkthub`) is a **Next.js 16** executive intelligence platform for AgriSafe Tecnologia — a Brazilian agritech/fintech focused on agribusiness credit and commercial intelligence. It ingests public market data from 166+ sources, organizes it around the **5 core entities** of Brazilian agribusiness, and surfaces it through a Bloomberg-style dashboard for the AgriSafe team.

**Platform flow:** Ingest → Analyze → Create → Comply

## Stack at a Glance

```
Next.js 16 (App Router) + TypeScript strict + Tailwind CSS 4
Supabase (PostgreSQL + RLS + pgvector)
Vercel (daily cron, single job limit on Hobby plan)
Path alias: @/* → ./src/*
Scrapers: Cheerio (server) + Python scripts in src/scripts/ (NO LLM-based scraping)
```

## ⚖️ Critical Rules — Never Violate

### 1. Algorithms first, LLMs last

LLM tools (Gemini, OpenAI, Claude) are **last resort**, not the default. Use them only for:
- **Prose generation** (first-draft articles, executive summaries, narratives)
- **Conversational interfaces** (chat over the knowledge base / RAG queries)
- **Last-resort fuzzy matching** when no deterministic key is available

For everything else — parsing, classification, matching, geocoding, aggregation, ranking — write **deterministic algorithms** in TypeScript or Python. They are free, reproducible, fast, and don't hallucinate IDs.

When you're tempted to add an LLM call, first ask: "Could a Python script or a regex do this?" If yes, do that.

### 2. The 5-entity data model — everything links back to these nodes

Every record stored in this database must be linkable, via foreign key or stable identifier, to one or more of these five entities:

| Entity | Stable identifier | Examples |
|--------|------------------|---------|
| **Company** | `cnpj_basico` (8 digits) | Industry, ag-input retailer, cooperative, frigorífico, trader |
| **Rural producer** | `cpf_or_cnpj` (11 or 14 digits) | Individual or PJ producer of grains, cattle, etc. |
| **Farm** | `farm_uid` (CAR / INCRA / geo-centroid hash) | Physical land unit with cadastral or geographic identity |
| **Financial operation** | `op_uid` (UUID) | CPR, loan, insurance, barter, vendor financing |
| **Ag-input transaction** | `tx_uid` (UUID) | Sale of defensives/fertilizers/seeds at retailer level |

**FK rules:**
- Tables describing a company → FK to `companies(cnpj_basico)`
- Tables describing a rural producer → FK to `rural_producers(cpf_or_cnpj)`
- Tables describing a farm → FK to `farms(farm_uid)`
- Cross-cutting facts (news, regulations, court records) → soft join via `mentions(entity_type, entity_id)`

**Building a feature without thinking about which entity it ties to is a bug.** If you can't justify how a new column or table relates back to one of the five nodes, it doesn't belong in this database.

### 3. Other hard constraints

1. **Public data only** — Never store client PII, financial records, or proprietary company data outside the `agrisafe_confidential` tier
2. **Bilingual always** — Every UI string lives in `src/lib/i18n.ts` in both `pt` and `en`
3. **MockBadge required** — Any section showing mock/seed data must render the `<MockBadge />` watermark
4. **Single cron** — Do not add new Vercel cron entries; add all jobs inside `sync-all` orchestrator
5. **Admin client for writes** — All DB writes use `createAdminClient()` (service role, bypasses RLS)
6. **Logging mandatory** — Every cron route must call `logSync()` from `src/lib/sync-logger.ts`
7. **Confidentiality tier** — Tables containing AgriSafe-proprietary data must carry a `confidentiality` enum (`public`, `agrisafe_published`, `agrisafe_confidential`)

## Module Map

```
src/components/
  DataSources.tsx          — Source registry & sync monitoring (Vertical 1)
  MarketPulse.tsx          — Highlights + Culture/Region tabs + Logistics + Yahoo intl chart (Vertical 2)
  CommodityMap.tsx         — Regional price map (controlled by parent slug)
  CompetitorRadar.tsx      — Competitor signals & timeline (Vertical 2)
  AgroNews.tsx             — RSS news aggregation (Vertical 2)
  EventTracker.tsx         — Industry events calendar (Vertical 2)
  RetailersDirectory.tsx   — 9,328 channels / 24,275 locations (Vertical 2 → CRM)
  RiskSignals.tsx          — Diretório × RJ cross-reference panel
  ContentHub.tsx           — AgriSafe-only articles & campaigns (Vertical 3)
  RegulatoryFramework.tsx  — CMN/CVM/BCB/MAPA norms (Vertical 4)
  RecuperacaoJudicial.tsx  — Judicial recovery RSS monitor + Receita Federal seed (Vertical 4)
  KnowledgeBase.tsx        — Semantic search + Mind Map tab (Knowledge)
  KnowledgeMindMap.tsx     — Interactive 22-table 4-tier visualization
  Settings.tsx             — Help / About / module guide
```

## Key Paths

| Path | What it Contains |
|------|-----------------|
| `src/data/mock.ts` | All fallback mock data (shown with MockBadge) |
| `src/data/source-registry.json` | 166 public sources with URL health |
| `src/lib/i18n.ts` | All PT-BR / EN translations |
| `src/lib/sync-logger.ts` | `logSync()` utility for cron routes |
| `src/app/api/cron/` | 7 cron routes + `sync-all` orchestrator |
| `src/app/api/prices-na/` | Live NA prices (10 min ISR, no Supabase) |
| `src/app/api/intl-futures/` | Yahoo Finance v8 proxy (CBOT/ICE/CME futures) |
| `src/app/api/events-na/` | AgroAgenda events (1 hr ISR, no Supabase) |
| `src/app/api/rj-scan/` | DuckDuckGo web scan for distressed agro companies |
| `src/db/migrations/` | SQL migrations 001–017 |

## Dev Commands

```bash
npm run dev          # Start dev server (port 3000)
npm run build        # Verify TypeScript before PR
```

## Adding a Module (Checklist)

- [ ] Identify which of the **5 entities** the module reads/writes
- [ ] `src/data/{module}.ts` — interfaces + seed data
- [ ] `src/components/{Module}.tsx` — import `Lang`, fetch Supabase, fall back to seed
- [ ] `src/lib/i18n.ts` — add keys to both `pt` and `en`
- [ ] `src/app/page.tsx` — add to `Module` type + sidebar + render
- [ ] `src/db/migrations/` — new SQL file with RLS enabled, FK to anchor entity
- [ ] Update `CLAUDE.md` architecture table + `ROADMAP.md` if phase changes

## Adding a Data Source (Checklist)

- [ ] **Use a deterministic algorithm** (Cheerio / Python). Do NOT use LLM extraction.
- [ ] Check `source-registry.json` for conflicts
- [ ] Register in `source-registry.json`
- [ ] Create `src/app/api/cron/sync-{source}/route.ts`
- [ ] Validate `CRON_SECRET` Bearer token
- [ ] Call `logSync()` on success and failure
- [ ] Add to `sync-all` orchestrator
- [ ] Create Supabase migration for target table — **must include FK to one of the 5 entity anchors**
- [ ] Document selectors in `docs/SCRAPER_SPECIFICATIONS.md`

## Reference Documents

| Need | Document |
|------|----------|
| Latest user-defined task list (2026-04-06) | `docs/TODO_2026-04-06.md` |
| Data journeys & operational how-tos | `PLAYBOOK.md` |
| Roadmap, completed phases, pending tasks | `ROADMAP.md` |
| Functional & non-functional requirements | `docs/REQUIREMENTS.md` |
| Scraper selectors & contracts | `docs/SCRAPER_SPECIFICATIONS.md` |
| 4-tier knowledge architecture & tagging | `docs/KNOWLEDGE_ARCHITECTURE.md` |
| Content Hub data model & workflow | `docs/CONTENT_HUB_SPEC.md` |
| Datalake product tiers & personas | `docs/AGSF_Datalake_PRODUCT.md` |

## Design Tokens (from Admin Portal)

```
Primary   #5B7A2F (olive)   Secondary #7FA02B   Warning  #E8722A
Bg        #F7F4EF           Sidebar   #F5F5F0   Border   #EFEADF
Text      #3D382F (warm brown)
Font: Inter 300–800
```
