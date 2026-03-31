# AgriSafe Market Hub — Implementation Plan

> **Last updated:** 2026-03-31
> **Status:** Phases 1-7 complete (11 modules live, BCB cron operational). Beginning Phase 8.
> **MVP constraint:** No paid services (no OpenAI, no embedding APIs). AI/embedding handled manually via IDE.

---

## Completed (Phases 1-7)

| Phase | What | Status |
|-------|------|--------|
| 1 | Research AgriSafe | Done |
| 2 | Read-only OneNote audit | Done |
| 3 | Architecture (11 modules, 3 groups, bilingual) | Done |
| 4 | Build v1 (components, data, i18n) | Done |
| 5 | Supabase + Vercel (RLS, Auth, deploy) | Done |
| 6 | Data ingestion (BCB, RSS, sync-all cron) | Done |
| 7 | Mobile-first UI + responsive | Done |

---

## Phase 8 — Design System Migration

**Goal:** Replace current dark sidebar/Tailwind with AgriSafe brand design from `agsf_admin_page`.

**Reference:** `agsf_admin_page/dashboard/src/styles.css` — olive green primary, warm beige neutrals, Inter font, Material Icons.

### 8.1 Design Tokens & Globals
- **Agent:** Styling | **Files:** `globals.css`, `layout.tsx`
- Adopt: `--color-brand-primary: #5B7A2F`, `--neutral-100: #F7F4EF` (page bg), `--sidebar-bg: #F5F5F0`, Inter font (300-800), 8px grid, shadows from admin panel
- Add Material Icons Outlined via Google Fonts CDN
- **Done when:** warm cream background, Inter font everywhere, no emerald/slate-900 remnants

### 8.2 Header Component
- **Agent:** UI | **Files:** new `Header.tsx`, update `page.tsx`
- Fixed 64px, white bg, border-bottom. Left: dynamic title per module. Right: lang toggle, notification bell with badge, avatar, logout
- **Done when:** header renders per-module titles, all actions work

### 8.3 Sidebar Component
- **Agent:** UI | **Files:** new `Sidebar.tsx`, update `page.tsx`
- Light beige bg, olive green active state, 3 collapsible sections, Material Icons, collapse toggle, mobile drawer
- Sections: INTELIGENCIA (5), VENDAS & CRM (3), DADOS & JURIDICO (3)
- **Done when:** matches admin panel look, collapse works, mobile drawer works

### 8.4 UI Primitives
- **Agent:** UI | **Files:** new `ui/Card.tsx`, `Badge.tsx`, `DataTable.tsx`, `Button.tsx`, `KpiCard.tsx`
- Card: white, 8px radius, shadow-sm, 24px pad. Badge: pill, semantic colors. DataTable: uppercase headers, hover rows. Button: primary olive, secondary transparent. KpiCard: icon + label + value + trend
- **Done when:** all modules can refactor to use these

**Parallelism:** 8.1-8.4 all run simultaneously.

---

## Phase 9 — Visualization & Charts

**Goal:** Replace tables-only display with charts, sparklines, and richer indicators using `recharts` (MIT, free).

### 9.1 Install Recharts
- `npm install recharts`

### 9.2 Market Pulse Visualizations
- **Files:** `MarketPulse.tsx`
- KPI cards with sparklines for USD/BRL and Selic
- Commodity price cards with mini area chart (last 7 days — requires 9.6)
- Price comparison line chart (all commodities, normalized to % change)
- Table retained as toggle "detailed view"

### 9.3 CRM Pipeline Visualization
- **Files:** `CRM.tsx`
- Funnel chart (horizontal stacked bars with conversion %)
- Stage distribution donut chart
- Pipeline value bar chart by stage

### 9.4 Competitor Signal Visualization
- **Files:** `CompetitorRadar.tsx`
- Signal type distribution (horizontal bars or donut)
- Signal timeline scatter plot (date X, type Y, competitor color)

### 9.5 News Analytics
- **Files:** `AgroNews.tsx`
- Category distribution donut, volume by source bars, daily article count area chart (30 days)

### 9.6 Price History Storage
- **Files:** new migration `002_price_history.sql`, update `sync-market-data/route.ts`
- New table `commodity_price_history` (commodity_id, price, change_24h, recorded_at)
- Cron INSERTS daily row per commodity (keeps history) while still upserting `commodity_prices` for latest view

**Parallelism:** 9.2-9.5 all parallel after 9.1. 9.6 independent.

---

## Phase 10 — Alert System

**Goal:** Context-aware alerts based on persona journeys ([PLAYBOOK.md](PLAYBOOK.md) Part I). Banners in each module highlighting what needs attention.

### 10.1 Alert Engine
- **Files:** new `src/lib/alerts.ts`
- Returns `{ type, module, message_pt, message_en, priority }[]`
- **Market alerts:** price change >5%, stale data >3 days, USD/BRL threshold
- **News alerts:** volume drop >50% vs 7-day avg, CRM company mentioned, judicial spike
- **CRM alerts:** deals stalled >14 days, no new leads in 7 days
- **Competitor alerts:** new signal detected
- **System alerts:** cron job failed

### 10.2 Alert Banner Component
- **Files:** new `ui/AlertBanner.tsx`
- Admin panel pattern: icon + message + action link. Warning/error/success/info variants. Dismissible. Bilingual.

### 10.3 Dashboard Alert Summary
- **Files:** update `page.tsx` DashboardOverview
- "Alertas" section at top of dashboard, grouped by priority. Click navigates to module.

---

## Phase 11 — Data Admin Dashboard

**Goal:** New module showing database health, source freshness, table stats. For Head Inteligencia and Data Analyst.

### 11.1 Data Admin Component
- **Files:** new `DataAdmin.tsx`, new `data/admin.ts`
- **Tables overview:** all Supabase tables with row count, last insert, schema version
- **Source status:** each source (BCB 6 series, 4 news RSS, 2 legal RSS) with last sync, status badge (green <24h, yellow 1-3d, red >3d)
- **Sync history:** last 7 days of cron results (timestamp, duration, records, errors)
- **Quick actions:** manual sync trigger buttons per pipeline

### 11.2 Register in Sidebar
- Add `"admin"` to Module type, sidebar section "ADMINISTRACAO", icon `admin_panel_settings`
- Translations: "Painel de Dados" / "Data Admin"

### 11.3 Status API
- **Files:** new `src/app/api/admin/status/route.ts`
- GET (auth required): table row counts, last update timestamps, source health

---

## Phase 12 — Live Data Feeding

**Goal:** Verify all pipelines work with actual Supabase data. Seed missing data.

### 12.1 Verify BCB Market Data — trigger sync, confirm 6 commodities + 2 indicators write
### 12.2 Verify RSS News — trigger sync, confirm 4 sources land articles with categories
### 12.3 Verify Judicial Recovery — trigger sync, confirm dual-filter catches cases
### 12.4 Seed CRM — migration `003_seed_crm.sql`: create tables, seed 25 contacts, 15 companies, 50 interactions (no real PII)
### 12.5 Seed Events — migration `004_seed_events.sql`: 10-15 real 2026 agro events
### 12.6 Verify Retailers — check population, run import if empty
### 12.7 Create Missing Tables — migration `005_missing_tables.sql`: `commodity_prices`, `market_indicators`, `content_ideas` with RLS

**Parallelism:** 12.1-12.7 all independent.

---

## Phase 13 — Per-Module Settings Modals

**Goal:** Gear icon in each module opens a config modal. MVP: read-only config display + manual sync buttons. Config changes via IDE code edits.

### 13.1 Settings Modal Component
- **Files:** new `ui/SettingsModal.tsx`
- Admin panel modal: overlay, centered card, header/body/footer, ESC/click-outside close

### 13.2 Market Pulse Settings
- Current commodities list with BCB series codes. "Add Commodity" instructions (BCB URL, file to edit, SQL to run). Manual sync button. Indicator status with last-update timestamps.

### 13.3 Agro News Settings
- RSS sources with feed URLs and last-article date. "Add Source" instructions. Highlighted producers table with keywords. Category keyword reference. Sync trigger.

### 13.4 Recuperacao Judicial Settings
- Legal sources list. Filter regex display (RJ_PATTERN, AGRO_PATTERN). State coverage. Sync trigger.

### 13.5 CRM Settings
- Pipeline stages with colors. Alert thresholds. CSV export button.

### 13.6 Competitor Radar Settings
- Tracked competitors list. "Add Signal Manually" form (competitor, type, title, source, date).

### 13.7 Remaining Modules
- Campaign Center: statuses, channels, pipeline definitions
- Content Engine: pillars, types, score thresholds
- Event Tracker: types, "Add Event" form, content tags
- Distribution Channels: categories, tiers, last-import date
- Retailers: import status, state coverage
- Data Admin: cron schedule, env var status (masked), sync history

**Parallelism:** 13.2-13.7 all parallel after 13.1.

---

## Phase 14 — UX Refinements

### 14.1 Toast System — bottom-center, success/error/warning/info, auto-dismiss 3s, spring animation
### 14.2 Pagination — reusable component matching admin panel, replace inline pagination
### 14.3 Filter Chips — pill toggles (inactive white, active olive), use across modules
### 14.4 Empty States & Skeletons — friendly illustrations for no-data, animated gray blocks for loading

---

## Phase 15 — Stitch & Advanced UX

### 15.1 Stitch Auth — `/mcp` > "claude.ai Stitch" > OAuth in browser
### 15.2 Apply Insights — review Stitch project feedback, implement UX improvements

---

## Future Phases

| Phase | Goal |
|-------|------|
| 16 | Knowledge Architecture & Vector DB (pgvector, manual embeddings via IDE) |
| 17 | Proprietary Data Module (strict RLS, Internal Insights Vault) |
| 18 | Polish & Scale (ISR, caching, Sentry, analytics, WCAG 2.1) |
| 19 | Paid Services (OpenAI content gen, paid embeddings, ML lead scoring) |

---

## Suggested Additional Tasks

These were not in the original request but are important for a production-quality platform:

| Task | Why | Phase |
|------|-----|-------|
| **Deduplicate vercel.json crons** | Both `sync-market-data` and `sync-all` run at 08:00 — remove the standalone one to avoid double-fetching | 12 |
| **Error logging table** | `sync_logs` table to persist cron results for Data Admin dashboard history | 11 |
| **CSV/PDF export per module** | Every module should be exportable for offline use (consultants need this for client decks) | 14 |
| **Keyboard shortcuts** | `Ctrl+K` command palette for power users (Head Inteligencia, Data Analyst) | 14 |
| **Dark mode toggle** | Admin panel has light theme; some users prefer dark — add toggle in header | 14 |
| **Supabase Realtime subscriptions** | Live-update modules when cron writes new data (no manual refresh needed) | 18 |
| **Bilingual settings modals** | Settings modal content should also be bilingual (pt/en) | 13 |

---

## Agent Assignment & Critical Path

```
Sprint 1 (Design Foundation):
  8.1 tokens ──┐
  8.2 header ──┼──▶ 8.4 primitives
  8.3 sidebar ─┘    9.1 recharts install

Sprint 2 (Charts + Alerts + Data):
  9.2-9.5 module charts (parallel) ──┐
  9.6 price history                  │
  10.1-10.3 alert system             ├──▶ Integration testing
  12.1-12.7 live data (all parallel) ┘

Sprint 3 (Admin + Settings + Polish):
  11.1-11.3 data admin dashboard ──┐
  13.1-13.7 settings modals        ├──▶ Final QA
  14.1-14.4 UX refinements         ┘
```
