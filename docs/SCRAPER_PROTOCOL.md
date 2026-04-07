# Scraper Protocol — AgriSafe Market Hub

> **Status:** Phase 19A (foundation) shipped 2026-04-07. All new scrapers from
> Phase 19 onward must use this protocol. Existing crons (`sync-agro-news`,
> `sync-recuperacao-judicial`, etc.) keep using `logSync()` until they break
> or get touched — no big-bang migration.

## Why this exists

Public sources change. URLs rotate, RSS schemas drift, HTML selectors move,
PDF layouts break, federal websites silently swap an API for a new one. The
old `sync_logs` table only recorded pass/fail per cron run — it could not
tell you *why* a scraper started writing garbage, *when* the source format
last changed, or *what fix* worked the previous time. That's the gap this
protocol closes.

The directive driving it (saved in agent memory as `feedback_scrapers.md`):

> Scrapers are codes that need to be well organized and have a knowledge
> base / auto-correction protocol when sources change and scrapers
> malfunction.

## Architecture

Three tables (created by migration 027), one library, one rule.

### Tables

| Table | Purpose | Lifetime per row |
|---|---|---|
| `scraper_registry` | One row per scraper. Definition (kind, target_table, schema_check, cadence) AND live health (status, last_success_at, consecutive_failures). | Permanent — created in a migration when a new scraper ships. |
| `scraper_runs` | Per-execution telemetry. Row per call to `runScraper()`. Holds timing, http_status, validation_errors, sample_payload. | Append-only. Trim by age in a future maintenance job. |
| `scraper_knowledge` | Narrative auto-correction memory. Failures, fixes, selector_changes, format_changes. | Append-only. `resolved_at` closes a failure when its fix lands. |

### Library

[src/lib/scraper-runner.ts](../src/lib/scraper-runner.ts) exports `runScraper()`,
the wrapper every new scraper must call. It owns the entire telemetry +
validation + health-update path so route files stay focused on the actual
fetch + parse logic.

### The rule

> **Validation must be deterministic. No LLM in the auto-correction loop.**

This is guardrail #1 from `CLAUDE.md`, applied here. `validatePayload()`
checks required keys, types, numeric ranges, enum allowlists, and row counts —
nothing else. An LLM "decides if the data looks right" is a sound contract
for *generating prose* but a disaster for *validating data integrity* because
prompt drift would silently let bad rows through. LLMs are welcome to *propose*
a fix in a chat session (the user can ask Claude "the FAOSTAT scraper is
broken — read the knowledge rows and tell me what changed") but the actual
fix must be reviewed and committed by a human.

## The auto-correction loop

```
       ┌──────────────────┐
       │  cron / manual   │
       │  triggers run    │
       └────────┬─────────┘
                │
                ▼
       ┌──────────────────┐
       │  runScraper()    │
       │  fetches +       │
       │  validates       │
       └────────┬─────────┘
                │
        ┌───────┴───────┐
        │               │
   success           failure
        │               │
        ▼               ▼
  registry.status   registry.status →
  = healthy         degraded / broken
  consecutive=0     consecutive++
                    + scraper_knowledge
                      kind=failure
                      with diagnostic
                    + sample_payload
                      pinned for diagnosis
                        │
                        ▼
                ┌────────────────┐
                │  HUMAN reads   │
                │  scraper_      │
                │  knowledge     │
                │  history       │
                └───────┬────────┘
                        │
                        ▼
                ┌────────────────┐
                │  HUMAN edits   │
                │  scraper code  │
                │  + writes      │
                │  kind=fix or   │
                │  selector_     │
                │  change row    │
                │  + sets        │
                │  resolved_at   │
                │  on failure    │
                └───────┬────────┘
                        │
                        ▼
                  next run lands
                  as success →
                  registry resets
```

### The four phases

1. **Detection** — `runScraper()` writes a `scraper_runs` row with
   `status` ∈ {`fetch_error`, `parse_error`, `validation_failed`}, bumps
   `consecutive_failures`, and updates `scraper_registry.status` according
   to the cadence-aware grace period:

   - 1 failure within `grace_period_hours` → stays `healthy`
   - 1 failure beyond grace → `degraded`
   - 3 consecutive failures → `broken`

2. **Diagnosis** — A human (or Claude in a fix session) opens the
   `scraper_knowledge` rows for that `scraper_id` and reads:

   - The latest `failure` row's `body` (error message + validation errors
     + sample payload)
   - The history of past `failure` / `fix` / `selector_change` rows so
     they can spot whether this is a recurrence
   - The `scraper_runs.sample_payload` for the failing run

   This is the "well organized knowledge base" the directive asked for.

3. **Fix** — The human:

   - Updates the scraper code (new selector, new URL, new mapping table,
     new field name in the FAOSTAT API, etc.)
   - Optionally writes a `scraper_knowledge` row of kind `fix`,
     `selector_change`, `url_change`, or `format_change` describing what
     they changed and why. This is the institutional memory that prevents
     future regressions.
   - Sets `resolved_at = now()` on the related `failure` row to close it.

4. **Validation** — The next run lands as `success`. The wrapper resets
   `consecutive_failures = 0` and flips `status = healthy`. The closed
   failure row now has its full chain: failure → fix → success.

## Writing a new scraper — checklist

1. **Add a row to `scraper_registry` in a migration.** Definitions live in
   the DB, not inline. Pick the smallest `expected_min_rows` and tightest
   `schema_check` you can defend. Set the right `cadence` — daily for news
   feeds, monthly for FAOSTAT, quarterly for World Bank reports.
2. **Write a `ScraperFn<T>`** — a pure async function that fetches, parses,
   and returns `{ rows, httpStatus?, bytesFetched?, targetPeriod? }`. No
   side effects (no DB writes, no logging). Throw on fetch/parse failures —
   the wrapper classifies the error.
3. **Wrap the call**: `await runScraper('your-scraper-id', yourScraperFn)`.
4. **Upsert the rows from the route**, not from inside `ScraperFn`. The
   wrapper validated them; your route writes them. This keeps the contract
   clean: the `ScraperFn` is the *parser*, the route is the *writer*.
5. **Add the route to `sync-all/route.ts`**. Vercel Hobby = single cron;
   `sync-all` is the orchestrator.

### Anti-patterns

- ❌ Calling an LLM to "extract data from this HTML page" — use Cheerio.
- ❌ Calling an LLM to "decide if these rows look right" — use the
  deterministic validators in `scraper-runner.ts`.
- ❌ Skipping `runScraper()` and writing to the target table directly —
  no telemetry, no health, no knowledge base, no auto-correction.
- ❌ Defining `schema_check` inline in the route file — drift between
  the registry and reality. Definitions live in the migration.
- ❌ Hand-rolling retry logic. The wrapper's `attempt_number` field is
  reserved for a future retry policy; for now, scrapers run once per cron
  cycle and the `consecutive_failures` counter is the retry signal.

## Relationship to existing tables

- `data_sources_registry` (migration 007) is the **catalogue** of every
  source that exists in the world (URL, frequency, automated y/n). It is
  maintained by the user via the DataSources UI. `scraper_registry.source_id`
  is a by-convention text reference to it — not a real FK because not every
  scraper hits a registered source (the healthcheck pings GitHub Zen, which
  isn't an agribusiness data source).
- `sync_logs` (migration 003) is the **legacy flat per-run log** consumed by
  the existing DataSources UI. `runScraper()` writes to it internally so
  that UI keeps working unchanged. When the DataSources UI is migrated to
  read `scraper_runs` instead, `sync_logs` can be dropped.

## Future work (not in this slice)

- A `/api/scraper-health` endpoint that surfaces `scraper_registry.status`
  in the DataSources UI with a colour-coded badge per scraper
- Email / Slack alert when a scraper flips to `broken`
- A `mode: 'backfill' | 'incremental'` parameter on `runScraper()` for
  scrapers that need to walk historical periods
- A maintenance job that trims `scraper_runs` rows older than 90 days
  (keep the failure rows in `scraper_knowledge` forever)
- Migration of existing crons (`sync-agro-news`, `sync-events-na`,
  `sync-recuperacao-judicial`, `sync-regulatory`, `archive-old-news`,
  `sync-market-data`, `sync-prices-na`, `sync-competitors`,
  `sync-retailer-intelligence`, `sync-industry-profiles`) to `runScraper()`
