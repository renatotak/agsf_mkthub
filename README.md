# 🌾 AgriSafe Market Hub

**Public market intelligence platform for Brazilian agribusiness.**

[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-38BDF8?logo=tailwindcss)](https://tailwindcss.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-Private-red)]()

---

## Overview

AgriSafe Market Hub is a continuously-running market intelligence platform designed for [AgriSafe Tecnologia](https://agrisafe.agr.br) — a São Paulo-based agritech company specializing in sales optimization, credit risk management, and crop monitoring for Brazilian agribusiness.

The platform aggregates **exclusively public data** to produce market reports, support campaign planning, generate content ideas, track competitors, and monitor industry events. It **never stores proprietary or confidential data** from AgriSafe or its users.

### 🔒 Privacy Constraint

> **This platform operates under a strict public-data-only policy.**
> No proprietary client data, financial records, credentials, or personally identifiable information is stored, ingested, or referenced. All data flows are sourced from public APIs, government databases, and open market feeds.

---

## Modules

The platform comprises **11 modules** organized in three groups:

### Market Intelligence

| # | Module | Description |
|---|--------|-------------|
| 1 | **Agro Market Pulse** | Real-time commodity prices (soy, corn, sugar, coffee, citrus, cotton), USD/BRL exchange via BCB API, CEPEA indices, CONAB crop forecasts, BNDES rural credit rates, and export data |
| 2 | **Campaign Command Center** | Content calendar and campaign planner with pipeline tracking, status management, and channel strategy — synced with market trends for timing |
| 3 | **Article & Content Engine** | AI-powered idea bank generating blog topics, article outlines, and social media angles aligned with AgriSafe's three pillars (credit risk, sales optimization, crop monitoring) |
| 4 | **Competitor & Industry Radar** | Public monitoring of competitors (TerraMagna, Traive, Agrotools, Bart Digital, Agrosafety) tracking news, product launches, and market signals |
| 5 | **Event & Conference Tracker** | Forward-looking calendar of agro events (Febrabantech, Congresso Andav, Radar Agtech, etc.) with content opportunity identification |

### Sales Intelligence

| # | Module | Description |
|---|--------|-------------|
| 6 | **CRM & Clients** | Pipeline-stage tracking for campaign reach and lead categories (ag resellers, financial institutions) — no PII or confidential client data |
| 7 | **Company Research** | Public company look-up and due-diligence summaries sourced from open registries and news |
| 8 | **Distribution Channels** | Mapping of agricultural input distribution channels across Brazilian states, sourced from public state-level registries |

### Data & Compliance

| # | Module | Description |
|---|--------|-------------|
| 9 | **Agro News** | Curated feed of agribusiness headlines aggregated from public RSS/news sources, with automated daily sync via Vercel cron |
| 10 | **Retailers Directory** | Searchable directory of licensed agricultural retailers parsed from official state registries (IDARON, IAGRO, CDA, ADAGRO, etc.) |
| 11 | **Recuperacao Judicial** | Monitoring of judicial recovery (recuperacao judicial) filings relevant to the agribusiness sector, synced via cron from public court data |

All modules support a **bilingual toggle (PT-BR / EN)**.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript 5.9 |
| Styling | Tailwind CSS 4 |
| Icons | Lucide React |
| Database | Supabase (PostgreSQL, free tier) |
| Auth | Supabase Auth (email/password) |
| Hosting | Vercel (free tier) |
| Cron | Vercel Cron Jobs (daily data sync) |
| Data (fallback) | Static TypeScript data files |

---

## Project Structure

```
agsf_mkthub/
├── src/
│   ├── app/
│   │   ├── globals.css              # Design tokens & global styles
│   │   ├── layout.tsx               # Root layout with metadata
│   │   ├── page.tsx                 # Main dashboard + sidebar navigation (11 modules)
│   │   ├── login/                   # Supabase Auth login page
│   │   └── api/
│   │       ├── ai/
│   │       │   └── generate-ideas/route.ts   # AI content generation endpoint
│   │       └── cron/
│   │           ├── sync-market-data/route.ts # BCB / CEPEA market data sync
│   │           ├── sync-agro-news/route.ts   # Agro news feed sync
│   │           ├── sync-recuperacao-judicial/route.ts  # Court filings sync
│   │           ├── sync-all/route.ts         # Orchestrator for all syncs
│   │           └── archive-old-news/route.ts # Stale news cleanup
│   ├── components/
│   │   ├── MarketPulse.tsx          # Module 1: Commodity data & indicators
│   │   ├── CampaignCenter.tsx       # Module 2: Campaign pipeline & calendar
│   │   ├── ContentEngine.tsx        # Module 3: AI content idea bank
│   │   ├── CompetitorRadar.tsx      # Module 4: Competitor signal tracker
│   │   ├── EventTracker.tsx         # Module 5: Event calendar
│   │   ├── CRM.tsx                  # Module 6: CRM & Clients pipeline
│   │   ├── CompanyResearch.tsx      # Module 7: Public company research
│   │   ├── DistributionChannels.tsx # Module 8: Ag distribution channels
│   │   ├── AgroNews.tsx             # Module 9: Agro news feed
│   │   ├── RetailersDirectory.tsx   # Module 10: Licensed retailers directory
│   │   └── RecuperacaoJudicial.tsx  # Module 11: Judicial recovery monitor
│   ├── data/
│   │   ├── market.ts               # Commodity prices & market indicators
│   │   ├── campaigns.ts            # Campaign pipeline data
│   │   ├── competitors.ts          # Competitor profiles & signals
│   │   ├── events.ts               # Agro event calendar
│   │   ├── crm.ts                  # CRM pipeline data
│   │   ├── company-research.ts     # Company research data
│   │   ├── channels.ts             # Distribution channels data
│   │   ├── news.ts                 # Agro news articles
│   │   ├── retailers.ts            # Retailers directory data
│   │   ├── recuperacao.ts          # Judicial recovery filings
│   │   └── knowledge.ts            # Knowledge base / embeddings seed
│   ├── db/
│   │   └── migrations/             # SQL migration scripts
│   ├── lib/
│   │   ├── i18n.ts                 # Bilingual translation system (PT-BR/EN)
│   │   └── supabase.ts             # Supabase client config
│   ├── utils/supabase/             # Supabase SSR helpers (client, server, admin, middleware)
│   ├── scripts/
│   │   └── import-retailers.ts     # Bulk retailer data import script
│   └── middleware.ts               # Auth middleware (route protection)
├── vercel.json                      # Cron job schedule configuration
├── package.json
├── tsconfig.json
├── next.config.ts
├── postcss.config.mjs
├── implementation_plan.md           # Phased development roadmap
├── tasks.md                         # Task tracker & progress checklist
└── log.md                           # Session activity log
```

---

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm 9+

### Install & Run

```bash
# Clone the repository
git clone https://github.com/renatotak/agsf_mkthub.git
cd agsf_mkthub

# Install dependencies
npm install

# Start development server
npm run dev
```

The app will be available at [http://localhost:3000](http://localhost:3000).

### Build for Production

```bash
npm run build
npm start
```

---

## Background & Origin

This project originated from a OneNote reorganization initiative that pivoted into building a full market intelligence platform. Key milestones:

1. **OneNote Audit** — Read-only audit of 8 sections (~80+ pages) covering General, SGT, TI-Infra, Comercial, Marketing, Investors, HR, and Events
2. **AgriSafe Research** — Analyzed AgriSafe's service offerings (credit risk scoring, 160+ agro attributes, mobile app, AgriAcordo partnership)
3. **Architecture Design** — Defined 5-module architecture with public-data-only constraint (later expanded to 11 modules)
4. **v1 Build** — Implemented all modules with bilingual UI, dark sidebar, dashboard overview, and privacy badge
5. **Supabase + Vercel** — Database migration, auth, and live deployment
6. **Cron & API Scaffold** — Vercel cron jobs for market data, agro news, and judicial recovery sync; AI generation endpoint
7. **Module Expansion** — Added CRM, Company Research, Distribution Channels, AgroNews, Retailers Directory, and Recuperacao Judicial
8. **GitHub Sync** — Repository published at `renatotak/agsf_mkthub`

---

## Documentation

| Document | Description |
|----------|-------------|
| [PLAYBOOK.md](PLAYBOOK.md) | **Operations guide** — user routines, automation tiers, data journeys, adding commodities/cultures, revising RSS sources, importing retailers |
| [personas/](personas/) | **User personas** — 8 AgriSafe roles mapped to modules, daily/weekly routines, virtual coworker vs manual tasks |
| [implementation_plan.md](implementation_plan.md) | Phased development roadmap (Phases 1–12) |
| [tasks.md](tasks.md) | Task tracker with completed/active work |
| [CLAUDE.md](CLAUDE.md) | AI assistant context (architecture, constraints, data sources) |
| [log.md](log.md) | Change log |

**Next milestones:**
- Connect OpenAI API for AI content generation (route shell ready)
- Enable pgvector for RAG-based content suggestions
- Add data visualization charts (Recharts / Chart.js)
- Production hardening (ISR caching, Sentry, analytics)

---

## Contributing

This is currently a private project for AgriSafe Tecnologia. Contact the repository owner for access.

---

## License

Private — All rights reserved.
