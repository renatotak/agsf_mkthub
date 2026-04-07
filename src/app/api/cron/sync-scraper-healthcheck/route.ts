/**
 * Phase 19A — Scraper resilience smoke test.
 *
 * This route exists ONLY to validate that runScraper() is wired up
 * end-to-end. It pings GitHub's zen endpoint (a one-line motivational
 * quote with near-100% uptime), maps the response into one row, and
 * lets the wrapper handle telemetry, validation, and the registry
 * health update.
 *
 * Safe to delete once Phase 19B (FAOSTAT) has been running cleanly
 * for 2+ weeks. The seed row in scraper_registry was added by
 * migration 027.
 */

import { NextResponse } from 'next/server'
import { runScraper, type ScraperFn } from '@/lib/scraper-runner'

export const dynamic = 'force-dynamic'

interface ZenRow extends Record<string, unknown> {
  source: string
  message: string
  fetched_at: string
}

const fetchZen: ScraperFn<ZenRow> = async () => {
  const res = await fetch('https://api.github.com/zen', {
    headers: { 'User-Agent': 'AgriSafe-MarketHub/1.0 (scraper-healthcheck)' },
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) throw new Error(`github zen returned http ${res.status}`)
  const text = (await res.text()).trim()
  const bytes = Number(res.headers.get('content-length')) || text.length

  return {
    rows: [
      {
        source: 'github-zen',
        message: text,
        fetched_at: new Date().toISOString(),
      },
    ],
    httpStatus: res.status,
    bytesFetched: bytes,
  }
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (
    process.env.NODE_ENV === 'production' &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    const outcome = await runScraper('sync-scraper-healthcheck', fetchZen)
    return NextResponse.json({
      success: outcome.ok,
      message: 'Scraper healthcheck completed',
      timestamp: new Date().toISOString(),
      run_id: outcome.runId,
      status: outcome.status,
      rows_fetched: outcome.rowsFetched,
      validation_errors: outcome.validationErrors,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
