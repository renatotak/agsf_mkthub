/**
 * Phase 29 — sync-oecd job module.
 *
 * Pulls the OECD-FAO Agricultural Outlook (10-year projection) from the
 * public OECD SDMX REST endpoint as CSV, filters to the country × commodity
 * × measure allowlist defined in `src/lib/macro/oecd-outlook-codes.ts`,
 * and upserts the result into `macro_statistics`.
 *
 * Why CSV (not SDMX-JSON):
 *   - The same payload via `?format=jsondata` is >10MB; CSV is ≈3MB and
 *     parses 5× faster with a hand-rolled deterministic parser.
 *   - SDMX-JSON requires resolving series-key dimension indices to display
 *     codes — pure overhead since the CSV already includes display codes.
 *
 * Anchor to the 5-entity model: macro_statistics is country-level so no
 * entity_uid FK is required (per CLAUDE.md hard guardrail #2).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { type ScraperFn } from '@/lib/scraper-runner'
import { runScraperJob } from '@/lib/scraper-job-runner'
import {
  buildOecdOutlookUrl,
  mapOecdRow,
  parseOecdCsv,
  type OecdMacroRow,
} from '@/lib/macro/oecd-outlook-codes'
import type { JobResult } from '@/jobs/types'

/** Window: 3 years of history + 5 years of projection. */
const HISTORY_YEARS = 3
const PROJECTION_YEARS = 5

const fetchOecdOutlook: ScraperFn<OecdMacroRow> = async () => {
  const currentYear = new Date().getFullYear()
  const startYear = currentYear - HISTORY_YEARS
  const endYear = currentYear + PROJECTION_YEARS

  const url = buildOecdOutlookUrl(startYear, endYear)

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'AgriSafe-MarketHub/1.0 (OECD-FAO Outlook scraper)',
      Accept: 'application/vnd.sdmx.data+csv, text/csv;q=0.9',
    },
    signal: AbortSignal.timeout(60000),
  })

  if (!res.ok) {
    throw new Error(`OECD SDMX returned http ${res.status} for ${url}`)
  }

  const body = await res.text()
  const bytes = body.length

  // Defensive: a 0-byte response or one that doesn't look like CSV is a
  // schema/endpoint regression — surface it loudly instead of silently
  // upserting nothing.
  if (bytes < 200 || !body.includes('REF_AREA') || !body.includes('OBS_VALUE')) {
    throw new Error(
      `OECD SDMX response did not look like the expected CSV (${bytes} bytes, header check failed)`,
    )
  }

  const parsed = parseOecdCsv(body)
  const rows: OecdMacroRow[] = []
  for (const r of parsed) {
    const mapped = mapOecdRow(r)
    if (mapped) rows.push(mapped)
  }

  return {
    rows,
    httpStatus: res.status,
    bytesFetched: bytes,
    targetPeriod: `${startYear}-${endYear}`,
  }
}

export function runSyncOecd(supabase: SupabaseClient): Promise<JobResult> {
  return runScraperJob({
    supabase,
    scraperId: 'sync-oecd',
    scraperFn: fetchOecdOutlook as ScraperFn<Record<string, unknown>>,
    targetTable: 'macro_statistics',
    conflictKey: 'source_id,commodity,region,indicator,period',
  })
}
