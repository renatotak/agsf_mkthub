/**
 * Phase 26 — sync-mdic-comexstat job module.
 *
 * Pulls Brazilian export volumes and FOB values per agro NCM code from
 * the MDIC ComexStat REST API. One POST per year × NCM grouping; we
 * batch by year so a single bad NCM doesn't kill the whole run.
 *
 * Output: one macro_statistics row per (commodity, indicator, year)
 * with region='Brazil', source_id='mdic_comexstat'.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { type ScraperFn } from '@/lib/scraper-runner'
import { runScraperJob } from '@/lib/scraper-job-runner'
import {
  MDIC_API_URL,
  MDIC_NCM_COMMODITIES,
  MDIC_INDICATORS,
} from '@/lib/macro/mdic-comexstat-codes'
import type { JobResult } from '@/jobs/types'

interface MacroStatRow extends Record<string, unknown> {
  source_id: string
  category: string
  commodity: string
  region: string
  indicator: string
  value: number
  unit: string
  period: string
  reference_date: string
  metadata: Record<string, unknown>
}

interface ComexStatResponseRow {
  year?: string
  coNcm?: string
  metricKG?: string | number
  metricFOB?: string | number
  [key: string]: unknown
}

interface ComexStatResponse {
  data?: { list?: ComexStatResponseRow[] }
  error?: { code?: number; message?: string }
}

/**
 * The ComexStat /general endpoint ignores `filterArray` for NCM in
 * practice — it returns the full ranked list (≈8k NCMs per year). We
 * fetch one year at a time (the response can be ~1MB per year) and
 * filter client-side against MDIC_NCM_COMMODITIES.
 */
async function fetchComexStatYear(
  flow: 'export' | 'import',
  year: number,
): Promise<ComexStatResponseRow[]> {
  const body = {
    flow,
    monthDetail: false,
    period: { from: `${year}-01`, to: `${year}-12` },
    metrics: ['metricFOB', 'metricKG'],
    details: ['ncm'],
  }

  let res: Response | null = null
  for (let attempt = 0; attempt < 5; attempt++) {
    res = await fetch(MDIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'AgriSafe-MarketHub/1.0 (MDIC ComexStat scraper)',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000),
    })
    if (res.status !== 429) break
    // ComexStat rate-limit is per-minute. Back off aggressively.
    await sleep(20000 + attempt * 10000)
  }

  if (!res || !res.ok) throw new Error(`MDIC ComexStat returned http ${res?.status ?? 'no-response'} for ${flow} ${year}`)
  const text = await res.text()
  let payload: ComexStatResponse
  try {
    payload = JSON.parse(text)
  } catch (e) {
    throw new Error(`MDIC ComexStat response not JSON: ${(e as Error).message}`)
  }
  if (payload.error) {
    throw new Error(`MDIC ComexStat error: ${payload.error.message || 'unknown'}`)
  }
  return payload.data?.list || []
}

// Throttle: ComexStat rate-limits at ~1 req/sec
async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function matchNcmToCommodity(ncm: string): { commodity: string; label: string } | null {
  // ComexStat NCM is up to 8 digits; match by 4-digit prefix
  const prefix = ncm.slice(0, 4)
  return MDIC_NCM_COMMODITIES[prefix] || null
}

const fetchMdicComexstat: ScraperFn<MacroStatRow> = async () => {
  const currentYear = new Date().getFullYear()
  const fromYear = currentYear - 5
  const toYear = currentYear - 1

  const rows: MacroStatRow[] = []
  let processedRows = 0
  let totalBytes = 0

  for (let year = fromYear; year <= toYear; year++) {
    const yearRows = await fetchComexStatYear('export', year)
    processedRows += yearRows.length
    totalBytes += JSON.stringify(yearRows).length

    for (const r of yearRows) {
      const ncm = String(r.coNcm || '')
      const match = matchNcmToCommodity(ncm)
      if (!match) continue

      for (const ind of MDIC_INDICATORS) {
        const raw = r[ind.value as keyof ComexStatResponseRow]
        if (raw == null) continue
        const num = typeof raw === 'number' ? raw : parseFloat(String(raw))
        if (!Number.isFinite(num) || num === 0) continue

        rows.push({
          source_id: 'mdic_comexstat',
          category: ind.category,
          commodity: match.commodity,
          region: 'Brazil',
          indicator: ind.indicator,
          value: num,
          unit: ind.unit,
          period: String(year),
          reference_date: `${year}-12-31`,
          metadata: {
            ncm,
            ncm_prefix: ncm.slice(0, 4),
            flow: 'export',
            label: match.label,
          },
        })
      }
    }

    // Be polite — ComexStat rate-limits aggressively at the per-minute level
    await sleep(20000)
  }

  // Aggregate by (commodity, indicator, year) since multiple NCM rows
  // can map to the same 4-digit commodity (e.g. 1201.10 and 1201.90).
  const agg = new Map<string, MacroStatRow>()
  for (const r of rows) {
    const key = `${r.source_id}|${r.commodity}|${r.region}|${r.indicator}|${r.period}`
    const existing = agg.get(key)
    if (existing) {
      existing.value = (existing.value as number) + (r.value as number)
    } else {
      agg.set(key, { ...r })
    }
  }
  const aggregated = Array.from(agg.values())

  return {
    rows: aggregated,
    httpStatus: 200,
    bytesFetched: processedRows * 100, // rough estimate
    targetPeriod: `${fromYear}-${toYear}`,
  }
}

export function runSyncMdicComexstat(supabase: SupabaseClient): Promise<JobResult> {
  return runScraperJob({
    supabase,
    scraperId: 'sync-mdic-comexstat',
    scraperFn: fetchMdicComexstat as ScraperFn<Record<string, unknown>>,
    targetTable: 'macro_statistics',
    conflictKey: 'source_id,commodity,region,indicator,period',
  })
}
