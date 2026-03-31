# AgriSafe Market Hub — Operations Playbook

> Operational guide for feeding data, revising sources, adding parameters, extending the platform, and day-to-day routines per persona.
>
> **User personas**: See [`personas/`](personas/) for detailed profiles of each Market Hub user.

---

## Table of Contents

### Part I — User Routines & Automation

17. [Who Uses What](#17-who-uses-what)
18. [Daily Routines by Persona](#18-daily-routines-by-persona)
19. [Weekly Routines by Persona](#19-weekly-routines-by-persona)
20. [Automation Tiers: Virtual Coworker vs Human](#20-automation-tiers-virtual-coworker-vs-human)
21. [Virtual Coworker Capabilities](#21-virtual-coworker-capabilities)

### Part II — Data Journeys

1. [Daily Data Pipeline](#1-daily-data-pipeline)
2. [Journey: Feeding Market Data](#2-journey-feeding-market-data)
3. [Journey: Adding a New Commodity / Culture](#3-journey-adding-a-new-commodity--culture)
4. [Journey: Adding a New Macro Indicator](#4-journey-adding-a-new-macro-indicator)
5. [Journey: Revising RSS News Sources](#5-journey-revising-rss-news-sources)
6. [Journey: Adding a New RSS News Source](#6-journey-adding-a-new-rss-news-source)
7. [Journey: Managing Highlighted Producers](#7-journey-managing-highlighted-producers)
8. [Journey: Adding Judicial Recovery Sources](#8-journey-adding-judicial-recovery-sources)
9. [Journey: Importing Retailers from Excel](#9-journey-importing-retailers-from-excel)
10. [Journey: Adding a New Module](#10-journey-adding-a-new-module)
11. [Journey: Updating Translations (i18n)](#11-journey-updating-translations-i18n)
12. [Journey: Testing Cron Jobs Locally](#12-journey-testing-cron-jobs-locally)
13. [Journey: Archiving Old News](#13-journey-archiving-old-news)
14. [Journey: AI Content Generation](#14-journey-ai-content-generation)
15. [Environment & Secrets Reference](#15-environment--secrets-reference)
16. [Troubleshooting](#16-troubleshooting)

---

---

# Part I — User Routines & Automation

---

## 17. Who Uses What

Module usage mapped to the 8 primary Market Hub personas. Full persona profiles in [`personas/`](personas/).

| Module | CEO | Head Intel. | Head Comercial | Mktg | Sr. Estrategia | Sr. Credito | SDR | Data Analyst |
|--------|:---:|:----------:|:--------------:|:----:|:--------------:|:-----------:|:---:|:----------:|
| Dashboard | **W** | **D** | W | W | — | — | — | D |
| Market Pulse | W | **D** | W | 3x | **P** | 3x | 2x | D |
| Campaign Center | — | — | — | **D** | — | — | — | W |
| Content Engine | — | — | — | **D** | — | — | — | — |
| Competitor Radar | W | — | — | W | **P** | — | — | — |
| Event Tracker | — | — | 2x | — | — | — | — | — |
| CRM & Clients | 2x | — | **D** | — | — | — | **D** | 2x |
| Company Research | — | — | OD | — | **P** | OD | **D** | — |
| Distribution Channels | — | W | W | — | P | — | **D** | W |
| Agro News | — | **D** | — | **D** | 2x | W | D | W |
| Retailers Directory | — | W | — | — | P | — | — | W |
| Recuperacao Judicial | — | 2x | — | — | — | **3x** | — | — |

**Legend:** **D** = Daily, **W** = Weekly, **2x/3x** = 2-3x/week, **P** = Per-project, **OD** = On-demand, **Bold** = primary user

---

## 18. Daily Routines by Persona

### CEO — Weekly Strategic Review (Monday, 15 min)
1. Dashboard stats overview → Market Pulse macro trends → Competitor Radar scan → CRM pipeline glance
2. **Fully automated data** — just open and read

### Head Inteligencia — Data Quality Check (Daily, 8:30 AM, 20 min)
1. Verify cron success → Spot-check Market Pulse freshness → Review Agro News classifications → Check Recuperacao Judicial for false positives
2. **70% automated, 30% manual validation**

### Head Comercial — Pipeline Review (Daily, 9:00 AM, 15 min)
1. CRM deal stages → New leads from SDR → Market context for calls
2. **30% automated (market data), 70% manual (CRM review, call prep)**

### Digital Marketing — Content Workflow (Daily, 9:00 AM, 30 min)
1. Scan Agro News → Check Content Engine ideas → Draft social posts → Review Campaign Center
2. **50% automated (news + ideas), 50% manual (writing + planning)**

### SDR Analyst — Prospecting Workflow (Daily, 8:30 AM, 45 min)
1. CRM follow-ups → Distribution Channels prospecting → Company Research per prospect → Agro News for outreach hooks → Draft messages → Log leads
2. **40% automated (data available), 60% manual (research, messaging, logging)**

### Consultor Sr. Credito — Judicial Recovery Monitoring (Tue/Thu, 20 min)
1. Scan new Recuperacao Judicial filings → Filter by entity type/state → Cross-reference CRM → Check commodity prices for exposure analysis
2. **60% automated (data synced), 40% manual (interpretation, case building)**

### Consultor Sr. Estrategia — Project Research (Ad hoc, 1-2 hours)
1. Commodity trends → Competitive landscape → Company research → Channel analysis → Compile into deliverable
2. **50% automated (data ready), 50% manual (synthesis, deliverable creation)**

### Data Analyst — Data Validation (Daily, 9:00 AM, 15 min)
1. Cron results check → Data freshness → News volume → Pull into BI tools
2. **80% automated (data available), 20% manual (BI refresh, anomaly investigation)**

---

## 19. Weekly Routines by Persona

| Persona | Routine | Day | Duration | Automation |
|---------|---------|-----|----------|------------|
| Head Inteligencia | Source audit: verify RSS feeds, BCB series, producer keywords | Friday PM | 30 min | Manual |
| Head Comercial | Territory analysis: distribution channel gaps vs CRM coverage | Wednesday | 30 min | Manual |
| Digital Marketing | Content planning: review ideas, plan editorial calendar, scan competitors | Monday | 45 min | 50% AI-assisted |
| SDR Analyst | Prospect list building: filter channels, exclude existing CRM, build 20-30 targets | Monday | 1 hour | 40% automated |
| Data Analyst | Dashboard refresh: update Power BI/Tableau, generate trend charts for CEO | Monday | 45 min | 30% automated |
| CEO | Board prep: review all module summaries when preparing for investor meetings | As needed | 30 min | AI can draft |

---

## 20. Automation Tiers: Virtual Coworker vs Human

Every task in the Market Hub falls into one of three tiers:

### Tier 1: Fully Automated (Virtual Coworker runs, no human input)

| Task | Frequency | Module | Implementation |
|------|-----------|--------|----------------|
| Fetch commodity prices from BCB SGS | Daily 08:00 UTC | Market Pulse | `sync-market-data` cron |
| Ingest agro news from 4 RSS feeds | Daily 08:00 UTC | Agro News | `sync-agro-news` cron |
| Classify news articles by category | Daily 08:00 UTC | Agro News | Regex categorization in cron |
| Match news against highlighted producers | Daily 08:00 UTC | Agro News | Keyword matching in cron |
| Sync judicial recovery filings | Daily 08:00 UTC | Recuperacao Judicial | `sync-recuperacao-judicial` cron |
| Archive old news + generate summaries | Daily 08:00 UTC | Agro News | `archive-old-news` cron (OpenAI) |
| Calculate 24h price changes | Daily 08:00 UTC | Market Pulse | BCB last-2-points diff |

### Tier 2: AI-Assisted (Virtual Coworker generates draft, human reviews/approves)

| Task | Frequency | Module | Status |
|------|-----------|--------|--------|
| Generate content ideas from market data | On-demand | Content Engine | **Scaffolded** — OpenAI integration pending |
| Draft social media posts from news headlines | Daily | Content Engine | **Planned** — needs prompt engineering |
| Draft weekly executive briefing | Weekly | Dashboard | **Planned** — needs aggregation logic |
| Summarize competitor signals | Weekly | Competitor Radar | **Planned** — needs signal analysis |
| Cross-reference judicial filings with CRM | On-demand | Recuperacao + CRM | **Planned** — needs join query |
| Generate prospect research cards | On-demand | Company Research | **Planned** — needs CNPJ API integration |
| Flag data quality anomalies | Daily | All | **Planned** — needs threshold logic |

### Tier 3: Manual (Requires human judgment, external data, or relationships)

| Task | Frequency | Who | Why manual |
|------|-----------|-----|-----------|
| CRM data entry (new leads, stage updates) | Daily | SDR, Head Comercial | Requires human interaction context |
| Campaign planning and editorial calendar | Weekly | Digital Marketing | Creative and strategic decisions |
| Event scheduling and networking | Monthly | Head Comercial | Relationship-driven |
| Retailer Excel imports | Quarterly | Head Inteligencia | Source file is external (state registries) |
| Credit assessment and restructuring | Per-case | Sr. Credito | Domain expertise, legal context |
| Strategic recommendations | Per-project | Sr. Estrategia | Consulting judgment |
| Pricing and partnership decisions | As needed | CEO, Head Comercial | Business strategy |
| Adding/removing highlighted producers | As needed | Head Inteligencia | Business priority decision |
| Adding new RSS sources | As needed | Head Inteligencia | Editorial quality judgment |
| Adding new BCB commodity series | As needed | Head Inteligencia, Dev | Requires code change |

---

## 21. Virtual Coworker Capabilities

A virtual coworker (AI agent) connected to Market Hub can perform these tasks today or with minimal development:

### Ready Today (Tier 1 — Already Implemented)

| Capability | How | Triggered by |
|------------|-----|-------------|
| Daily market data refresh | BCB SGS API → Supabase | Vercel cron (automatic) |
| Daily news aggregation | RSS → categorize → Supabase | Vercel cron (automatic) |
| Daily judicial recovery scan | RSS → dual-filter → Supabase | Vercel cron (automatic) |
| News archival with AI summaries | OpenAI → pgvector → Supabase | Vercel cron (automatic) |
| Producer mention detection | Keyword matching against news | Vercel cron (automatic) |

### Near-Term (Tier 2 — Requires Prompt Engineering + API Wiring)

| Capability | What it produces | Effort |
|------------|-----------------|--------|
| **Weekly Executive Briefing** | 1-page PDF/email: top commodity moves, competitor alerts, pipeline changes | Medium — aggregate queries + OpenAI summary |
| **Content Idea Generation** | 5 blog/social ideas scored by market relevance, aligned to AgriSafe pillars | Low — `generate-ideas` endpoint exists, needs OpenAI connection |
| **Daily Social Media Drafts** | 2-3 post drafts based on top Agro News headlines | Low — news data exists, needs prompt |
| **Prospect Research Cards** | Company brief: CNPJ data, digital presence, news mentions, SWOT | Medium — needs public CNPJ API integration |
| **Data Quality Alerts** | Slack/email alert when: BCB empty, RSS timeout, news count drop, stale prices | Medium — needs monitoring logic + notification |
| **CRM × Judicial Cross-Reference** | Alert when a company in CRM appears in Recuperacao Judicial filings | Low — SQL join between tables |
| **Territory Opportunity Maps** | Heatmap overlay: distribution density vs CRM coverage per state | Medium — needs visualization layer |

### Future (Tier 2-3 — Requires Significant Development)

| Capability | What it produces | Effort |
|------------|-----------------|--------|
| **RAG-Powered Content Writing** | Full blog post first drafts using vector search over archived knowledge | High — pgvector + RAG pipeline |
| **Automated Competitor Monitoring** | Daily competitor signal digest from news/RSS | High — needs competitor-specific RSS + NER |
| **Credit Risk Dashboard** | Commodity price → credit exposure correlation | High — needs financial modeling |
| **Smart Lead Scoring** | ML-based lead prioritization using channel + market + interaction data | High — needs training data + model |

---

# Part II — Data Journeys

---

## 1. Daily Data Pipeline

The platform refreshes data automatically every day at **08:00 UTC** via a single Vercel cron job.

### Flow

```
Vercel Cron (08:00 UTC)
  └─ GET /api/cron/sync-all
       ├─ 1. /api/cron/sync-market-data
       │     ├─ Fetch BCB SGS API (6 commodities + 2 indicators)
       │     ├─ Calculate 24h price change
       │     └─ UPSERT → commodity_prices, market_indicators
       │
       ├─ 2. /api/cron/sync-agro-news
       │     ├─ Fetch 4 RSS feeds (20 items each)
       │     ├─ Categorize articles (7 categories)
       │     ├─ Match highlighted producers
       │     └─ UPSERT → agro_news (dedup by source_url)
       │
       ├─ 3. /api/cron/sync-recuperacao-judicial
       │     ├─ Fetch 2 legal RSS feeds (50 items each)
       │     ├─ Filter: must match BOTH "recuperação judicial" AND agro keywords
       │     ├─ Classify entity type, extract state
       │     └─ UPSERT → recuperacao_judicial
       │
       └─ 4. /api/cron/archive-old-news
             ├─ Find articles > 3 months old
             ├─ Group by category + source + month
             ├─ Summarize with OpenAI gpt-4o-mini
             ├─ Generate embeddings (text-embedding-3-small)
             ├─ Store → news_knowledge (pgvector)
             └─ DELETE originals from agro_news
```

### Auth
Every cron sub-job requires: `Authorization: Bearer {CRON_SECRET}` header. The orchestrator (`sync-all`) forwards this header automatically.

---

## 2. Journey: Feeding Market Data

**Current state:** BCB SGS API integration is live. Fetches 6 commodity prices and 2 macro indicators daily.

### Current BCB Series

| Commodity | BCB Series | Unit | Supabase ID |
|-----------|-----------|------|-------------|
| Soy (CEPEA) | 11752 | R$/sc 60kg | `soy` |
| Corn (CEPEA) | 11753 | R$/sc 60kg | `corn` |
| Coffee (CEPEA) | 11754 | R$/sc 60kg | `coffee` |
| Sugar (CEPEA) | 11755 | R$/sc 50kg | `sugar` |
| Cotton (CEPEA) | 11756 | ¢/lb | `cotton` |
| Citrus (CEPEA) | 11757 | R$/cx 40.8kg | `citrus` |

| Indicator | BCB Series | Format | Supabase ID |
|-----------|-----------|--------|-------------|
| USD/BRL Exchange | 1 | R$ X.XXXX | `usd_brl` |
| Selic Rate | 432 | XX.XX% | `selic` |

### How prices are calculated

1. Fetch last 2 data points from BCB SGS API: `api.bcb.gov.br/dados/serie/bcdata.sgs.{series}/dados/ultimos/2`
2. Current price = latest data point value
3. 24h change (%) = `((latest - previous) / previous) * 100`
4. Upsert to `commodity_prices` table with: `price`, `change_24h`, `unit`, `source`, `last_update`

### Where to verify
- BCB SGS portal: `https://www3.bcb.gov.br/sgspub/`
- Search for series codes to confirm they're still active and publishing data

---

## 3. Journey: Adding a New Commodity / Culture

**Example:** Adding "Wheat" (Trigo) with BCB series 11758.

### Steps

#### 1. Find the BCB series code
Go to `https://www3.bcb.gov.br/sgspub/` and search for the commodity. Note the series number and unit.

#### 2. Update the cron route
File: `src/app/api/cron/sync-market-data/route.ts`

Add to the `COMMODITY_SERIES` object:
```typescript
const COMMODITY_SERIES: Record<string, { code: number; unit: string }> = {
  soy:    { code: 11752, unit: "R$/sc 60kg" },
  corn:   { code: 11753, unit: "R$/sc 60kg" },
  // ... existing entries ...
  wheat:  { code: 11758, unit: "R$/sc 60kg" },  // ← NEW
};
```

#### 3. Add seed/fallback data
File: `src/data/market.ts`

Add to the `commodityPrices` array:
```typescript
{
  id: "wheat",
  name_pt: "Trigo",
  name_en: "Wheat",
  price: 0,
  unit: "R$/sc 60kg",
  change24h: 0,
  source: "BCB/CEPEA",
  lastUpdate: "—",
}
```

#### 4. Add translations
File: `src/lib/i18n.ts`

Add `wheat: "Trigo"` (pt) and `wheat: "Wheat"` (en) to the `marketPulse` section if the component uses translation keys for commodity names.

#### 5. Create/verify Supabase row
The `commodity_prices` table must have a row with `id = 'wheat'` for the upsert to work. Insert a seed row:
```sql
INSERT INTO commodity_prices (id, price, change_24h, unit, source, last_update)
VALUES ('wheat', 0, 0, 'R$/sc 60kg', 'BCB/CEPEA', now());
```

#### 6. Update the dashboard stats
File: `src/app/page.tsx` — Update the `stats` array in `DashboardOverview` if you want to change the count.

#### 7. Test
```bash
curl -H "Authorization: Bearer YOUR_CRON_SECRET" http://localhost:3000/api/cron/sync-market-data
```

---

## 4. Journey: Adding a New Macro Indicator

**Example:** Adding "IPCA (inflation)" with BCB series 433.

### Steps

#### 1. Update the cron route
File: `src/app/api/cron/sync-market-data/route.ts`

Add to `INDICATOR_SERIES`:
```typescript
const INDICATOR_SERIES: Record<string, { code: number; format: string }> = {
  usd_brl: { code: 1,   format: "R$ {value}" },
  selic:   { code: 432, format: "{value}%" },
  ipca:    { code: 433, format: "{value}%" },  // ← NEW
};
```

#### 2. Add seed/fallback data
File: `src/data/market.ts` — Add to `marketIndicators` array:
```typescript
{
  id: "ipca",
  name_pt: "IPCA (Inflacao)",
  name_en: "IPCA (Inflation)",
  value: "—",
  trend: "stable",
  source: "BCB",
}
```

#### 3. Seed Supabase row
```sql
INSERT INTO market_indicators (id, value, trend, source)
VALUES ('ipca', '—', 'stable', 'BCB');
```

#### 4. Test
Same as commodity test — call the sync-market-data endpoint.

---

## 5. Journey: Revising RSS News Sources

**Current RSS feeds for Agro News:**

| Source | Feed URL | Items fetched |
|--------|---------|---------------|
| Canal Rural | `https://www.canalrural.com.br/feed/` | 20 |
| Sucesso no Campo | `https://sucessonocampo.com.br/feed/` | 20 |
| Agrolink | `https://www.agrolink.com.br/rss/noticias.xml` | 20 |
| CNA Noticias | `https://cnabrasil.org.br/noticias/rss` | 20 |

### Verifying a feed is still active
1. Open the URL in a browser — it should return XML
2. Check that `<item>` entries have recent dates
3. If a feed returns 404 or stops updating, replace it (see next journey)

### Category classification keywords
Articles are auto-categorized by matching title+summary against these patterns:

| Category | Keywords (regex) |
|----------|-----------------|
| commodities | `soja\|milho\|café\|açúcar\|algodão\|commodity\|cotaç` |
| credit | `crédito\|financ\|banco\|selic\|juro` |
| technology | `tecnolog\|ia\|inovaç\|startup\|digital\|drone\|satelit` |
| policy | `polític\|govern\|lei\|regulament\|ministér\|mapa\|conab` |
| sustainability | `sustentab\|ambient\|carbono\|esg\|desmat` |
| judicial | `recuperação judicial\|falência\|judicial\|tribunal` |
| general | (default fallback) |

To add a new category, update the classification logic in `src/app/api/cron/sync-agro-news/route.ts`.

---

## 6. Journey: Adding a New RSS News Source

**Example:** Adding "Globo Rural" RSS feed.

### Steps

#### 1. Find the RSS feed URL
Usually at `{site}/feed/` or `{site}/rss`. Verify it returns valid XML with `<item>` entries.

#### 2. Update the feed list
File: `src/app/api/cron/sync-agro-news/route.ts`

Add to the `RSS_FEEDS` array (or equivalent constant):
```typescript
{ name: "Globo Rural", url: "https://g1.globo.com/economia/agronegocios/index/feed/pagina-1.gxml" },
```

#### 3. (Optional) Update seed data
File: `src/data/news.ts` — Add the source name to `NEWS_SOURCES` if it exists, or add a sample article for fallback.

#### 4. Test locally
```bash
curl -H "Authorization: Bearer YOUR_CRON_SECRET" http://localhost:3000/api/cron/sync-agro-news
```
Check the response JSON for articles from the new source.

---

## 7. Journey: Managing Highlighted Producers

The Agro News module can flag articles that mention specific agricultural producers/companies you're tracking.

### How it works
1. The `highlighted_producers` Supabase table stores producer names + associated keywords
2. During each news sync, every article's title+summary is matched against these keywords (case-insensitive)
3. Matched articles get `mentions_producer = true` and `producer_names[]` populated

### Adding a new producer to track
```sql
INSERT INTO highlighted_producers (id, name, keywords, active)
VALUES (
  gen_random_uuid(),
  'BrasilAgro',
  ARRAY['brasilagro', 'brasil agro', 'AGRO3'],
  true
);
```

### Disabling a producer
```sql
UPDATE highlighted_producers SET active = false WHERE name = 'BrasilAgro';
```

### Tips
- Keywords should be lowercase (matching is case-insensitive)
- Include stock ticker codes (e.g., `AGRO3`) for better coverage
- Include common misspellings or abbreviations

---

## 8. Journey: Adding Judicial Recovery Sources

**Current legal RSS feeds:**

| Source | Feed URL | Items fetched |
|--------|---------|---------------|
| ConJur | `https://www.conjur.com.br/rss.xml` | 50 |
| Migalhas | `https://www.migalhas.com.br/rss/quentes.xml` | 50 |

### Dual-filter logic
An article is only ingested if it matches **BOTH**:
1. `RJ_PATTERN`: `/recupera[çc][ãa]o judicial/i`
2. `AGRO_PATTERN`: `/produtor rural|agroneg[óo]cio|usina|cooperativa|agropecuári|agroind[úu]stri|cana-de-a[çc][úu]car|soja|milho|algod[ãa]o|caf[ée]/i`

### Adding a new legal source
File: `src/app/api/cron/sync-recuperacao-judicial/route.ts`

Add to the `RSS_SOURCES` array:
```typescript
{ name: "JOTA", url: "https://www.jota.info/feed" },
```

### Adding new agro keywords to the filter
To match more types of agribusiness entities, extend `AGRO_PATTERN`:
```typescript
const AGRO_PATTERN = /produtor rural|agroneg[óo]cio|usina|cooperativa|...|arroz|pecuária/i;
```

### State extraction
States are extracted via regex patterns for state names and court abbreviations (TJSP, TJMT, etc.). To add a new state:
```typescript
// In the state extraction logic:
{ pattern: /Roraima|TJRR/i, code: "RR" },
```

---

## 9. Journey: Importing Retailers from Excel

The retailers module is populated from official state registry Excel files.

### Prerequisites
- Excel file: `26-0224 oraculo canais.xlsx` (or equivalent)
- Two sheets: `main_empresas` (companies) and `clean` (locations)
- Environment: `.env.local` with `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`

### Import process

```bash
npm run import-retailers
# Equivalent to: npx tsx src/scripts/import-retailers.ts
```

### What happens
1. **Sheet `main_empresas` → `retailers` table:** Filters rows where `manter = 'x'`. Maps: cnpj_raiz, razao_social, nome_fantasia, grupo_acesso, classificacao, capital_social, porte. Upserts in batches of 500 (conflict on `cnpj_raiz`).
2. **Sheet `clean` → `retailer_locations` table:** Filters rows where `visible = 'x'`. Maps: cnpj, address fields, uf, municipio, lat/long. Upserts in batches of 500 (conflict on `cnpj`).

### Updating with a new Excel file
1. Place the new `.xlsx` file in the project root
2. Update the file path in `src/scripts/import-retailers.ts` (line ~10)
3. Run `npm run import-retailers`
4. Old records are preserved (upsert); new records are added

### Column mapping reference

**main_empresas sheet:**
| Excel Column | Database Column | Notes |
|-------------|----------------|-------|
| `cnpj_raiz` | `cnpj_raiz` | UNIQUE key |
| `consolidacao` | `consolidacao` | |
| `razao_social` | `razao_social` | |
| `nome_fantasia` | `nome_fantasia` | |
| `grupo_acesso` | `grupo_acesso` | CANAL RD, DISTRIBUIDOR, PLATAFORMA, COOPERATIVA |
| `tipo_acesso` | `tipo_acesso` | |
| `faixa_faturamento` | `faixa_faturamento` | |
| `industria_1/2/3` | `industria_1/2/3` | Skips 'ND' values |
| `classificacao` | `classificacao` | A, B, C, D |
| `possui_loja_fisica` | `possui_loja_fisica` | |
| `capital_social` | `capital_social` | Parsed from formatted number |
| `porte` | `porte` | |
| `porte_name` | `porte_name` | |
| `manter` | — | Filter column: 'x' = include |

**clean sheet:**
| Excel Column | Database Column | Notes |
|-------------|----------------|-------|
| `cnpj` | `cnpj` | UNIQUE key (full CNPJ) |
| `cnpj_raiz` | `cnpj_raiz` | Links to retailers table |
| `razao_social` | `razao_social` | |
| `tipo_logradouro` + `logradouro` | `logradouro` | Combined |
| `numero` | `numero` | |
| `complemento` | `complemento` | |
| `bairro` | `bairro` | |
| `cep` | `cep` | |
| `uf` | `uf` | State code (SP, MT, etc.) |
| `municipio` | `municipio` | |
| `latitude` / `longitude` | `latitude` / `longitude` | Comma→period conversion |
| `visible` | — | Filter column: 'x' = include |

---

## 10. Journey: Adding a New Module

**Example:** Adding a "Rural Credit Monitor" module.

### Checklist

#### 1. Create the data file
File: `src/data/rural-credit.ts`
- Define TypeScript interfaces
- Add sample/seed data for fallback

#### 2. Create the component
File: `src/components/RuralCreditMonitor.tsx`
- Import `Lang` type from `@/lib/i18n`
- Accept `{ lang: Lang }` prop
- Fetch from Supabase with loading states
- Fall back to seed data on error

#### 3. Add translations
File: `src/lib/i18n.ts`
- Add module name: `ruralCredit: "Credito Rural"` (pt) / `"Rural Credit"` (en)

#### 4. Register in the dashboard
File: `src/app/page.tsx`
- Add to the `Module` type union: `| "ruralCredit"`
- Import the component
- Add to the appropriate modules array (market/sales/data)
- Add the `{activeModule === "ruralCredit" && <RuralCreditMonitor lang={lang} />}` render
- Add dashboard card description

#### 5. Create Supabase table
File: `src/db/migrations/002_rural_credit.sql`
- Create table with RLS enabled
- Add read policy for public, write policy for service role

#### 6. (Optional) Create a cron route
File: `src/app/api/cron/sync-rural-credit/route.ts`
- Add CRON_SECRET auth check
- Implement data fetching logic
- Register in `sync-all` orchestrator

#### 7. Update docs
- `CLAUDE.md` — Add to module table
- `PLAYBOOK.md` — Add operational journey
- `implementation_plan.md` — Note the addition

---

## 11. Journey: Updating Translations (i18n)

All UI strings live in `src/lib/i18n.ts`.

### Structure
```typescript
export const translations = {
  pt: {
    appName: "AgriSafe Market Hub",
    modules: { marketPulse: "Pulso do Mercado", ... },
    marketPulse: { title: "...", subtitle: "...", ... },
    // ... per-module sections
  },
  en: {
    appName: "AgriSafe Market Hub",
    modules: { marketPulse: "Market Pulse", ... },
    marketPulse: { title: "...", subtitle: "...", ... },
    // ... per-module sections
  },
} as const;
```

### Rules
1. **Every string must exist in both `pt` and `en`** — The TypeScript `as const` assertion ensures type safety
2. **Usage pattern:** `const tr = t(lang);` then `tr.modules.marketPulse`
3. **Adding a new section:** Add the same keys to both `pt` and `en` objects
4. **Build will fail** if keys are asymmetric between languages (TypeScript strict mode)

---

## 12. Journey: Testing Cron Jobs Locally

### Prerequisites
- `.env.local` must have: `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`
- Dev server running: `npm run dev`

### Test individual jobs

```bash
# Market data sync
curl -H "Authorization: Bearer YOUR_CRON_SECRET" http://localhost:3000/api/cron/sync-market-data

# Agro news sync
curl -H "Authorization: Bearer YOUR_CRON_SECRET" http://localhost:3000/api/cron/sync-agro-news

# Judicial recovery sync
curl -H "Authorization: Bearer YOUR_CRON_SECRET" http://localhost:3000/api/cron/sync-recuperacao-judicial

# Archive old news (requires OPENAI_API_KEY)
curl -H "Authorization: Bearer YOUR_CRON_SECRET" http://localhost:3000/api/cron/archive-old-news

# Run all syncs
curl -H "Authorization: Bearer YOUR_CRON_SECRET" http://localhost:3000/api/cron/sync-all
```

### Reading the response
Each cron returns JSON with:
- `success: true/false`
- `{job_name}: { updated: N, errors: [...] }`
- Partial success is possible (e.g., 4/6 commodities fetched, 2 failed)

### Common issues
- **401 Unauthorized**: `CRON_SECRET` env var missing or wrong
- **Supabase errors**: Check `SUPABASE_SERVICE_ROLE_KEY` and that target tables exist
- **RSS timeout**: Some feeds may be slow; timeout is 15s per feed
- **BCB API down**: BCB SGS occasionally has maintenance windows (usually weekends)

---

## 13. Journey: Archiving Old News

The `archive-old-news` cron automatically processes articles older than 3 months.

### What it does
1. Queries `agro_news` for articles with `published_at < (now - 3 months)`
2. Groups them by `{category}|{source_name}|{month}`
3. For each group:
   - Generates a Portuguese summary (2-3 paragraphs) using `gpt-4o-mini`
   - Generates key topics (5-10) in Portuguese
   - Creates a vector embedding using `text-embedding-3-small` (1536 dimensions)
   - Stores in `news_knowledge` table
4. Deletes the original articles from `agro_news`

### Requirements
- `OPENAI_API_KEY` must be set in `.env.local`
- `pgvector` extension must be enabled in Supabase
- `news_knowledge` table must exist (created by `001_new_modules.sql`)

### Manual trigger
```bash
curl -H "Authorization: Bearer YOUR_CRON_SECRET" http://localhost:3000/api/cron/archive-old-news
```

### If OpenAI key is missing
The archival is **skipped entirely** (no errors, no deletions). Articles remain in `agro_news` until the key is configured.

---

## 14. Journey: AI Content Generation

**Current state:** Scaffolded but not connected to OpenAI.

### What's implemented
- `/api/ai/generate-ideas` POST endpoint exists
- Returns mock data (hardcoded idea object)
- Target table: `content_ideas`

### What needs to be done
1. Import OpenAI SDK
2. Fetch recent `commodity_prices` + `market_indicators` from Supabase
3. Build a prompt with market context
4. Call OpenAI API (suggested model: `gpt-4o-mini`)
5. Parse structured JSON response
6. Upsert to `content_ideas` table

### Expected prompt pattern
```
"You are an expert agro copywriter for AgriSafe Tecnologia.
Based on today's market data: [commodity prices, indicators].
Generate 5 content ideas aligned with AgriSafe's pillars:
- Credit Risk Management
- Sales Optimization
- Crop Monitoring
Return as JSON array matching ContentIdea schema."
```

---

## 15. Environment & Secrets Reference

| Variable | Required | Used By | Description |
|----------|----------|---------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | All | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | All | Supabase public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes (cron) | Cron routes, import script | Bypasses RLS for writes |
| `CRON_SECRET` | Yes (prod) | Cron routes | Bearer token for auth |
| `OPENAI_API_KEY` | Optional | archive-old-news, generate-ideas | AI summarization + generation |
| `VERCEL_URL` | Auto | sync-all | Set automatically by Vercel runtime |

---

## 16. Troubleshooting

### Build fails with TypeScript errors
- Check `tsconfig.json` `exclude` array includes any non-project folders
- Run `npx tsc --noEmit` to see errors before building

### Cron jobs not running on Vercel
- Check `vercel.json` has the correct `crons` configuration
- Verify `CRON_SECRET` is set in Vercel environment variables
- Check Vercel dashboard → Cron Jobs tab for execution logs

### RSS feed returns empty
- Open the feed URL directly in a browser to verify it's active
- Check for rate limiting (User-Agent: `AgriSafe-MarketHub/1.0`)
- Feed may have changed its URL — search the site for the new feed endpoint

### BCB API returns no data
- BCB SGS API may be down for maintenance (common on weekends)
- Series may have been discontinued — verify at `https://www3.bcb.gov.br/sgspub/`
- API format: `https://api.bcb.gov.br/dados/serie/bcdata.sgs.{SERIES}/dados/ultimos/2?formato=json`

### Supabase writes fail silently
- Check that the service role key is correct and not expired
- Verify that target tables exist and have the expected columns
- Check RLS policies: cron routes use the admin client (service role) which bypasses RLS
- Run queries manually in Supabase SQL editor to test

### New module not appearing
- Verify it's added to the `Module` type union in `page.tsx`
- Verify it's in one of the module arrays (marketModules/salesModules/dataModules)
- Verify the component is imported at the top of `page.tsx`
- Verify translations exist in both `pt` and `en` in `i18n.ts`

### Import retailers script fails
- Verify `.env.local` has `SUPABASE_SERVICE_ROLE_KEY`
- Verify the Excel file path in the script matches the actual file
- Check that `retailers` and `retailer_locations` tables exist in Supabase
