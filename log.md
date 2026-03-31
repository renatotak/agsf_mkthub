# AgriSafe Market Hub — Change Log

---

## 2026-03-31 — Project Merge & Documentation Overhaul

**Two parallel development branches merged into a single codebase:**

- **Branch A (Gemini/Windsurf):** Cron job infrastructure (`sync-market-data`, `sync-agro-news`, `sync-recuperacao-judicial`, `sync-all`, `archive-old-news`), AI generation endpoint, Supabase Auth with login/middleware, AgroNews, RetailersDirectory, RecuperacaoJudicial modules. Database migrations, retailer import scripts, Supabase SSR helpers.

- **Branch B (Claude):** CRM & Clients, Company Research, Distribution Channels modules. Mobile-first responsive UI (Phase 7). Corresponding data files (`crm.ts`, `company-research.ts`, `channels.ts`).

**Merged result:** 11 modules in 3 groups (Market Intelligence, Sales Intelligence, Data & Compliance). All auxiliary files revised. PLAYBOOK.md created with operational journeys.

---

## Earlier milestones

| Date | Milestone |
|------|-----------|
| — | Phase 7: Mobile-first UI and responsive design |
| — | Phase 6b: Module expansion (CRM, Company Research, Distribution Channels, AgroNews, Retailers, Recuperacao) |
| — | Phase 6: Cron & AI infrastructure scaffolded |
| — | Phase 5: Supabase + Vercel deployment |
| — | Phase 4: v1 build (5 modules, i18n, dashboard) |
| — | Phase 3: Architecture design (11-module) |
| — | Phase 2: Read-only OneNote audit |
| — | Phase 1: AgriSafe research |
