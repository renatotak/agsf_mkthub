/**
 * Phase 19A — Scraper health surface.
 *
 * Public read endpoint that exposes scraper_registry + the most recent
 * scraper_runs + open scraper_knowledge failure rows. Powers the
 * "Scraper Health" tab in DataSources.tsx so the user can see at a
 * glance which scrapers are healthy / degraded / broken without
 * having to read the database.
 *
 * No auth — confidentiality at row level is `agrisafe_published`,
 * which we treat as readable in the app context.
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'

export const dynamic = 'force-dynamic'
export const revalidate = 60 // refresh once a minute

interface ScraperHealthRow {
  scraper_id: string
  name: string
  description: string | null
  source_id: string
  kind: string
  target_table: string | null
  cadence: string
  status: 'healthy' | 'degraded' | 'broken' | 'disabled'
  consecutive_failures: number
  last_success_at: string | null
  last_failure_at: string | null
  expected_min_rows: number
  last_run: {
    run_id: string
    started_at: string
    duration_ms: number | null
    rows_fetched: number
    rows_inserted: number
    status: string
    error_message: string | null
    validation_errors: unknown[]
  } | null
  open_failure_count: number
  recent_runs_24h: number
  recent_failures_24h: number
}

export async function GET() {
  try {
    const supabase = createAdminClient()

    const { data: registry, error: regErr } = await supabase
      .from('scraper_registry')
      .select('*')
      .order('status', { ascending: false }) // broken/degraded float to top alphabetically
      .order('scraper_id')

    if (regErr) throw regErr
    if (!registry || registry.length === 0) {
      return NextResponse.json({
        success: true,
        scrapers: [],
        summary: { healthy: 0, degraded: 0, broken: 0, disabled: 0, total: 0 },
        fetched_at: new Date().toISOString(),
      })
    }

    const scraperIds = registry.map((r) => r.scraper_id)
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    // Pull all relevant runs in one round-trip; group client-side.
    const { data: recentRuns } = await supabase
      .from('scraper_runs')
      .select('*')
      .in('scraper_id', scraperIds)
      .gte('started_at', since24h)
      .order('started_at', { ascending: false })

    // Latest run per scraper across ALL time (not just 24h) — needed to
    // show "most recent" even if the scraper hasn't run today.
    type RunRow = {
      run_id: string
      scraper_id: string
      started_at: string
      duration_ms: number | null
      rows_fetched: number
      rows_inserted: number
      status: string
      error_message: string | null
      validation_errors: unknown[]
    }
    const { data: latestRunsRaw } = await supabase
      .from('scraper_runs')
      .select('*')
      .in('scraper_id', scraperIds)
      .order('started_at', { ascending: false })
      .limit(scraperIds.length * 5) // small buffer; we'll dedupe per scraper

    const latestByScraperId = new Map<string, RunRow>()
    for (const run of (latestRunsRaw || []) as RunRow[]) {
      if (!latestByScraperId.has(run.scraper_id)) {
        latestByScraperId.set(run.scraper_id, run)
      }
    }

    const { data: openFailures } = await supabase
      .from('scraper_knowledge')
      .select('scraper_id')
      .eq('kind', 'failure')
      .is('resolved_at', null)
      .in('scraper_id', scraperIds)

    const openFailureCounts = new Map<string, number>()
    for (const f of openFailures || []) {
      openFailureCounts.set(f.scraper_id, (openFailureCounts.get(f.scraper_id) || 0) + 1)
    }

    const scrapers: ScraperHealthRow[] = registry.map((r) => {
      const runs24h = (recentRuns || []).filter((run) => run.scraper_id === r.scraper_id)
      const failures24h = runs24h.filter(
        (run) => run.status !== 'success' && run.status !== 'partial'
      ).length
      const latest = latestByScraperId.get(r.scraper_id)

      return {
        scraper_id: r.scraper_id,
        name: r.name,
        description: r.description,
        source_id: r.source_id,
        kind: r.kind,
        target_table: r.target_table,
        cadence: r.cadence,
        status: r.status,
        consecutive_failures: r.consecutive_failures,
        last_success_at: r.last_success_at,
        last_failure_at: r.last_failure_at,
        expected_min_rows: r.expected_min_rows,
        last_run: latest
          ? {
              run_id: latest.run_id,
              started_at: latest.started_at,
              duration_ms: latest.duration_ms,
              rows_fetched: latest.rows_fetched,
              rows_inserted: latest.rows_inserted,
              status: latest.status,
              error_message: latest.error_message,
              validation_errors: latest.validation_errors || [],
            }
          : null,
        open_failure_count: openFailureCounts.get(r.scraper_id) || 0,
        recent_runs_24h: runs24h.length,
        recent_failures_24h: failures24h,
      }
    })

    const summary = {
      healthy: scrapers.filter((s) => s.status === 'healthy').length,
      degraded: scrapers.filter((s) => s.status === 'degraded').length,
      broken: scrapers.filter((s) => s.status === 'broken').length,
      disabled: scrapers.filter((s) => s.status === 'disabled').length,
      total: scrapers.length,
    }

    return NextResponse.json({
      success: true,
      scrapers,
      summary,
      fetched_at: new Date().toISOString(),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { success: false, error: message, scrapers: [], summary: null },
      { status: 500 }
    )
  }
}
