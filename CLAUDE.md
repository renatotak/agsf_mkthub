# CLAUDE.md — AgriSafe Market Hub

> Agent context file. For humans, see README.md. For the full roadmap, see ROADMAP.md.
> For the latest user-defined task list, see `docs/TODO_2026-04-06.md`.

## Project in One Line

**AgriSafe Market Hub** is a bilingual (PT-BR/EN) executive intelligence platform: it ingests public agribusiness data from 166+ sources, organizes it around the **5 core entities** of Brazilian agribusiness (company, rural producer, farm, financial operation, ag-input transaction), and enables the AgriSafe team to generate proprietary insights, content, and compliance intelligence.

**Platform flow:** Ingest → Analyze → Create → Comply

---

## ⚖️ HARD GUARDRAILS — read before every task

These rules apply to **every** change in this codebase. Violations are bugs.

### 1. Algorithms first, LLMs last

LLM tools (Gemini, OpenAI, Claude) are **last resort**, not the default.

| Need | Use this | NOT this |
|------|----------|----------|
| Parse a webpage | Cheerio + selectors | LLM extraction |
| Match a CNPJ | Regex + lookup table | LLM "find the company" |
| Compute spread / aggregate / rank | TypeScript / SQL | LLM "what is the average" |
| Geocode a city | Static dictionary + Nominatim | LLM "where is X" |
| Classify a news article by commodity | Keyword regex | LLM zero-shot classification |
| Detect a price rupture | `Math.abs(change) > 2 * stddev` | LLM "is this unusual" |
| Match a rural producer to a farm | CAR/INCRA/CPF/CNPJ keys + JOIN | LLM fuzzy match |
| Summarize a long article for archive | OpenAI / Gemini | (this is a valid LLM use) |
| Generate first-draft narrative for content hub | LLM | (valid LLM use) |
| Conversational chat over the knowledge base | LLM + RAG | (valid LLM use) |

**Why:** Algorithms are deterministic, free, fast, and reproducible. LLM calls cost money, vary across runs, hallucinate IDs, and need constant prompt tuning. Use LLMs only for **prose generation** and **conversational interfaces** where determinism is not required.

When you're tempted to add an LLM call, first ask: "Could a Python script or a regex do this?" If yes, do that.

### 2. The 5-entity data model — everything links back to these nodes

Every record stored in this database must be linkable, via foreign key or stable identifier, to one or more of these five entities. **Building a feature without thinking about which of these it ties to is a bug.**

| Entity | Stable identifier | Why it matters |
|--------|------------------|---------------|
| **Company** (`cnpj_basico`) | 8-digit CNPJ root from Receita Federal. Covers industry, ag-input retailer, cooperative, frigorífico, trader, distribuidor, etc. | The unit of B2B commerce. Every retailer, every industry, every RJ case, every news mention must resolve to a `cnpj_basico`. |
| **Rural producer** (`cpf_or_cnpj`) | 11-digit CPF (PF) or 14-digit CNPJ (PJ). | The unit of credit risk. Loans, CPRs, barters all originate here. |
| **Farm** (`farm_uid`) | Composite key: CAR (Cadastro Ambiental Rural), INCRA SNCR code, or geo-centroid (lat,lng) hash. | The unit of physical production. Yields, climate, satellite, and CAR overlays attach here. |
| **Financial operation** (`op_uid`) | UUID. References one farm, one rural producer, one or more companies, one commodity, one date range. | The unit of value transfer. CPR, loan, insurance, barter, vendor financing. |
| **Ag-input transaction** (`tx_uid`) | UUID. References one rural producer, one retailer (company), one or more products (industry), one farm. | The unit of commercial activity at the rural input retailer level. |

**FK rules:**
- New tables that describe a company → FK to `companies(cnpj_basico)`. Add a precise CNAE classifier where applicable.
- New tables that describe a rural producer → FK to `rural_producers(cpf_or_cnpj)`.
- New tables that describe a farm → FK to `farms(farm_uid)`.
- Cross-cutting tables (news mentions, court records, regulatory norms) → soft join via `mentions(entity_type, entity_id)` rather than direct FK, since the same article can mention multiple entities.

**Existing tables that already follow this:**
- `retailers.cnpj_raiz` is the company anchor for the channel directory
- `recuperacao_judicial.entity_cnpj` resolves to companies via `v_retailers_in_rj`
- `company_enrichment.cnpj_basico` is the Receita Federal cache

**Tables that still need anchoring (see ROADMAP):**
- `agro_news` should have a `mentions` junction
- `events` should have a `companies_organizing` junction
- `regulatory_norms` should have an `affected_companies` lookup based on CNAE

### 3. Public data only

Never store client PII, financial records, or proprietary data in the public-domain layer. The 3-tier confidentiality model (public / AgriSafe published / AgriSafe confidential) is implemented at the row level via a `confidentiality` enum column on the relevant tables.

### 4. Other hard constraints

- **Bilingual always** — Every UI string must exist in PT-BR + EN via `src/lib/i18n.ts`
- **MockBadge required** — Any non-live section must display the MOCKED DATA watermark
- **Single cron** — Vercel Hobby plan limit; `sync-all` consolidates all jobs
- **Knowledge hierarchy** — Follow the 4-tier model in `docs/KNOWLEDGE_ARCHITECTURE.md`
- **Google API free tier** — Verify Google APIs stay within free tier (Maps, Custom Search 100/day)

---

## Tech Stack

- **Framework:** Next.js 16 (App Router) + TypeScript strict mode
- **Styling:** Tailwind CSS 4 via PostCSS
- **Database:** Supabase (PostgreSQL + pgvector + RLS)
- **Auth:** Supabase Auth + SSR middleware
- **Charts:** Recharts. **Icons:** Lucide React + Material Icons Outlined
- **Maps:** @vis.gl/react-google-maps (terrain + satellite views)
- **Path alias:** `@/*` → `./src/*`
- **Deployment:** Vercel (Hobby — single daily cron at 08:00 UTC)
- **Scrapers:** Cheerio (server-side) + Python scripts in `src/scripts/` for heavy crawls. **No LLM-based scraping.**

## Commands

```bash
npm run dev                                      # Dev server
npm run build                                    # Production build
node src/scripts/build-source-registry.js        # Rebuild 166-source registry
node src/scripts/seed-content.js                 # Seed articles + topics to Supabase
node --env-file=.env.local src/scripts/geocode-retailers.js  # Geocode retailer locations
```

## Architecture: Four Verticals + Modules

| Vertical | Key Components |
|----------|---------------|
| Ingestão de Dados | `DataSources.tsx`, `SourceRegistry.tsx` (166 sources, CRUD planned) |
| Inteligência de Mercado | `MarketPulse.tsx` (Highlights + Culture/Region tabs + Logistics spread + Yahoo Finance intl chart), `CompetitorRadar.tsx` (CRUD planned), `AgroNews.tsx` (CRUD planned), `EventTracker.tsx`, `AgInputIntelligence.tsx` (oracle planned) |
| Marketing & Conteúdo | `ContentHub.tsx` — see `docs/CONTENT_HUB_SPEC.md` |
| Diretório (CRM-grade) | `RetailersDirectory.tsx` (channels), **planned:** `IndustriesDirectory.tsx` (industries split-out), `RiskSignals.tsx` (Diretório × RJ cross-ref) |
| Regulatório & Compliance | `RegulatoryFramework.tsx`, `RecuperacaoJudicial.tsx` |
| Base de Conhecimento | `KnowledgeBase.tsx` (search + AgroTermos), `KnowledgeMindMap.tsx` (table-graph viz) |

**Cron pipeline** (`/api/cron/sync-all` → daily 08:00 UTC):
1. `sync-market-data` — BCB SGS → `commodity_prices`, `market_indicators`
2. `sync-agro-news` — 5 RSS feeds → `agro_news`
3. `sync-recuperacao-judicial` — 2 legal RSS → `recuperacao_judicial`
4. `archive-old-news` — OpenAI summaries + pgvector → `news_knowledge`
5. `sync-regulatory` — 3 legal RSS → `regulatory_norms`
6. `sync-events-na` — AgroAgenda API → `events`

**Live API routes (ISR cached):**
- `/api/prices-na` — Notícias Agrícolas commodity prices (revalidate 10min)
- `/api/prices-na/regional` — Per-city prices: 322 praças for soy, 6 commodities
- `/api/intl-futures` — Yahoo Finance v8 proxy for CBOT/ICE/CME futures (15min ISR)
- `/api/events-na` — AgroAgenda events (revalidate 1h)
- `/api/news-na` — NA news with category filter
- `/api/agroapi/clima` — Embrapa ClimAPI weather (revalidate 1h)
- `/api/agroapi/agrofit` — AGROFIT product search
- `/api/agroapi/bioinsumos` — Bioinsumos search
- `/api/agroapi/termos` — AgroTermos glossary
- `/api/company-enrichment` — Receita Federal data (BrasilAPI/CNPJ.ws/ReceitaWS, cached 30d)
- `/api/company-research` — Web search (Google CSE / DuckDuckGo + optional OpenAI summary)
- `/api/company-notes` — User-editable company notes
- `/api/retailers/update` — Update editable retailer fields
- `/api/rj-scan` — DuckDuckGo web scan for agro companies in restructuring

All cron routes log to `sync_logs` via `src/lib/sync-logger.ts`.

## Key Files

| File/Dir | Purpose |
|----------|---------|
| `src/data/mock.ts` | Fallback mock data; shown with MockBadge watermark when live data unavailable |
| `src/data/published-articles.ts` | Curated AgriSafe published content (not mock) |
| `src/data/source-registry.json` | 166 catalogued public sources |
| `src/lib/i18n.ts` | All PT-BR / EN translations |
| `src/lib/agroapi.ts` | Embrapa AgroAPI OAuth2 client + typed helpers |
| `src/lib/sync-logger.ts` | Cron logging utility |
| `src/app/api/cron/` | 7 cron routes + sync-all orchestrator |
| `src/app/api/prices-na/regional/` | Per-city commodity price scraper (322 praças) |
| `src/app/api/intl-futures/` | Yahoo Finance v8 futures proxy (CBOT/ICE/CME) |
| `src/app/api/company-enrichment/` | Receita Federal company lookup (3-source fallback) |
| `src/app/api/company-research/` | Web search (DuckDuckGo + Google CSE + OpenAI) |
| `src/db/migrations/` | SQL migrations 001–017 |
| `src/scripts/geocode-retailers.js` | 3-tier geocoding (Google/CEP/Nominatim) |
| `src/scripts/seed-rj-from-receita.ts` | Seed RJ data from crawlers DB |
| `imports/cnpj-metadados.pdf` | Receita Federal CNPJ data layout reference |

## Data Classification (Receita Federal vs AgriSafe)

| Source | Fields | Behavior |
|--------|--------|----------|
| **Receita Federal** (locked) | CNPJ, Razão Social, Capital Social, Porte, Situação, CNAE, Endereço, QSA, Simples/MEI | Read-only, lock icon |
| **AgriSafe internal** (editable) | Grupo, Classificação, Faturamento, Indústrias, Loja Física, Tipo Acesso | Click-to-edit, pencil icon |
| **User notes** | Obs. Faturamento, Contato Comercial, Observações | Saved to `company_notes` table |

### Confidentiality tiers (planned)

The Diretório de Canais will become AgriSafe's CRM. To support that, every editable field will be tagged with one of three tiers stored in a `confidentiality` enum:

1. **`public`** — Receita Federal data, news mentions, public events. Anyone can see.
2. **`agrisafe_published`** — AgriSafe-curated insights (e.g. company write-ups). Visible to AgriSafe team and partners.
3. **`agrisafe_confidential`** — Meeting notes, lead pipelines, internal classifications. Visible only to authenticated AgriSafe staff with the right role.

A future fourth tier (`client_confidential`) will hold partner-shared data under NDA.

The Knowledge Base (RAG / chat) must respect this tier when answering — never leak `agrisafe_confidential` content to a query that came from a `public`-tier session.

## Adding a New Data Source (Workflow)

1. **Analyze** — Format (API/RSS/CSV/HTML), update freq, auth requirements
2. **Check conflicts** — Search `source-registry.json` for overlapping data
3. **Register** — Add to `source-registry.json` with all metadata fields
4. **Build ingestion** — Algorithmic scraper (Cheerio/Python), NOT LLM. Create `src/app/api/cron/sync-{source}/route.ts`, log via `logSync()`, add to `sync-all`
5. **Anchor to entities** — Make sure scraped records carry the relevant FK or junction-table reference (cnpj_basico, farm_uid, etc.)
6. **Sample check** — Verify record count, freshness, encoding
7. **Persona validation** — Test through CEO / Head Inteligência / Marketing / Crédito lenses

## Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY   # Required
SUPABASE_SERVICE_ROLE_KEY / CRON_SECRET                     # Required
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY                             # Required (maps)
AGROAPI_CONSUMER_KEY / AGROAPI_CONSUMER_SECRET              # Required (Embrapa)
GOOGLE_CUSTOM_SEARCH_KEY / GOOGLE_CUSTOM_SEARCH_CX          # Optional (web research, 100 free/day)
OPENAI_API_KEY                                              # Optional (archive, AI summaries)
GEMINI_API_KEY                                              # Optional (knowledge embeddings)
```

## Design Tokens

Primary `#5B7A2F` · Secondary `#7FA02B` · Warning `#E8722A`
Page bg `#F7F4EF` · Text `#3D382F` · Font: Inter 300–800

## Deeper References

| Topic | File |
|-------|------|
| Operations & data journeys | `PLAYBOOK.md` |
| Roadmap & phase history | `ROADMAP.md` |
| Latest task list (2026-04-06) | `docs/TODO_2026-04-06.md` |
| System requirements (FR/NFR) | `docs/REQUIREMENTS.md` |
| Scraper specs & selectors | `docs/SCRAPER_SPECIFICATIONS.md` |
| Knowledge architecture (4-tier) | `docs/KNOWLEDGE_ARCHITECTURE.md` |
| Content Hub spec | `docs/CONTENT_HUB_SPEC.md` |
| Datalake product strategy | `docs/AGSF_Datalake_PRODUCT.md` |
| CNPJ data layout (RF) | `imports/cnpj-metadados.pdf` |
