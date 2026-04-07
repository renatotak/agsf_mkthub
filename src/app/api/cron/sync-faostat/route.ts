/**
 * Phase 19B — FAOSTAT Crop Production scraper.
 *
 * Pulls last 5 years of production + export quantity for soybeans and
 * maize across World / Brazil / Argentina / USA / China from the FAOSTAT
 * v1 REST API and upserts into `macro_statistics`. First scraper built
 * on the Phase 19A `runScraper()` foundation — see
 * docs/SCRAPER_PROTOCOL.md.
 *
 * Algorithmic mapping only. No LLMs anywhere — guardrail #1.
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { runScraper, type ScraperFn } from '@/lib/scraper-runner'
import {
  FAOSTAT_AREAS,
  FAOSTAT_ITEMS,
  FAOSTAT_ELEMENTS,
  buildFaostatUrl,
  type FaostatRecord,
} from '@/lib/macro/faostat-codes'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

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

const fetchFaostat: ScraperFn<MacroStatRow> = async () => {
  const currentYear = new Date().getFullYear()
  const years = [currentYear - 5, currentYear - 4, currentYear - 3, currentYear - 2, currentYear - 1]
  const url = buildFaostatUrl(years)

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'AgriSafe-MarketHub/1.0 (FAOSTAT scraper)',
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(45000),
  })

  if (!res.ok) {
    throw new Error(`FAOSTAT returned http ${res.status} for ${url}`)
  }

  const text = await res.text()
  const bytes = text.length

  let payload: { data?: FaostatRecord[] }
  try {
    payload = JSON.parse(text)
  } catch (e) {
    throw new Error(`FAOSTAT response was not valid JSON: ${(e as Error).message}`)
  }

  if (!payload.data || !Array.isArray(payload.data)) {
    throw new Error('FAOSTAT response missing `data` array — schema may have changed')
  }

  // Algorithmic mapping FAOSTAT row → macro_statistics row.
  const rows: MacroStatRow[] = []
  for (const rec of payload.data) {
    const region = FAOSTAT_AREAS[rec['Area Code']]
    const item = FAOSTAT_ITEMS[rec['Item Code']]
    const element = FAOSTAT_ELEMENTS[rec['Element Code']]
    if (!region || !item || !element) continue // unknown code, skip silently — validator will catch row count

    const year = String(rec.Year)
    const valueRaw = rec.Value
    if (typeof valueRaw !== 'number' || !Number.isFinite(valueRaw)) continue

    rows.push({
      source_id: 'faostat',
      category: element.category,
      commodity: item.commodity,
      region,
      indicator: element.indicator,
      value: valueRaw,
      unit: rec.Unit || element.unit,
      period: year,
      reference_date: `${year}-12-31`,
      metadata: {
        faostat_area_code: rec['Area Code'],
        faostat_item_code: rec['Item Code'],
        faostat_element_code: rec['Element Code'],
        faostat_item_label: item.label,
      },
    })
  }

  return {
    rows,
    httpStatus: res.status,
    bytesFetched: bytes,
    targetPeriod: `${years[0]}-${years[years.length - 1]}`,
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

  const supabase = createAdminClient()

  try {
    const outcome = await runScraper<MacroStatRow>('sync-faostat-prod', fetchFaostat, {
      supabase,
    })

    // Wrapper already validated; rows are returned ready to upsert.
    // Failure cases left rows empty + wrote a scraper_knowledge failure row.
    let upserted = 0
    if (outcome.ok && outcome.rows.length > 0) {
      const { error: upErr, count } = await supabase
        .from('macro_statistics')
        .upsert(outcome.rows, {
          onConflict: 'source_id,commodity,region,indicator,period',
          count: 'exact',
        })
      if (upErr) {
        return NextResponse.json({
          success: false,
          run_id: outcome.runId,
          rows_validated: outcome.rowsFetched,
          upsert_error: upErr.message,
        })
      }
      upserted = count ?? outcome.rows.length
    }

    return NextResponse.json({
      success: outcome.ok,
      run_id: outcome.runId,
      status: outcome.status,
      rows_fetched: outcome.rowsFetched,
      rows_upserted: upserted,
      validation_errors: outcome.validationErrors,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
