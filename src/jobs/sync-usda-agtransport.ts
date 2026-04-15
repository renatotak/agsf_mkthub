/**
 * Phase 2b — sync-usda-agtransport job module.
 *
 * Fetches USDA AMS fertilizer prices by region from the
 * agtransport.usda.gov SODA API (dataset 8bgf-5mdv).
 * Source: Green Markets / Bloomberg via USDA.
 *
 * Writes to `macro_statistics` with source_id='usda_agtransport'.
 * No LLM involved — pure JSON API consumption.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { type ScraperFn } from '@/lib/scraper-runner'
import { runScraperJob } from '@/lib/scraper-job-runner'
import type { JobResult } from '@/jobs/types'

const DATASET_ID = '8bgf-5mdv'
const SODA_BASE = `https://agtransport.usda.gov/resource/${DATASET_ID}.json`
const UA = 'AgriSafe-MarketHub/1.0 (USDA agtransport fertilizer scraper)'
const PAGE_SIZE = 5000

// Map USDA commodity names to our canonical slugs
const COMMODITY_MAP: Record<string, string> = {
  'Ammonia':  'amonia',
  'Urea':     'ureia',
  'UAN':      'uan',
  'MAP':      'map',
  'DAP':      'dap',
  'Potash':   'kcl',
}

interface SodaRow {
  date: string       // "2023-01-01T00:00:00.000"
  month: string
  quarter: string
  year: string
  commodity: string  // "Ammonia", "Urea", "UAN", "MAP", "DAP", "Potash"
  region: string     // "Tampa", "Cornbelt", "Northern Plains", etc.
  price: string      // "928.75"
}

interface MacroStatRow extends Record<string, unknown> {
  source_id: 'usda_agtransport'
  category: 'fertilizer_price'
  commodity: string
  region: string
  indicator: 'price'
  value: number
  unit: string
  period: string
  reference_date: string
  metadata: Record<string, unknown>
}

async function fetchAllRows(): Promise<{ rows: SodaRow[]; bytes: number; httpStatus: number }> {
  const allRows: SodaRow[] = []
  let totalBytes = 0
  let lastStatus = 200
  let offset = 0

  // Fetch only recent data (last 3 years)
  const minYear = new Date().getFullYear() - 3
  const whereClause = `year >= '${minYear}'`

  while (true) {
    const url = new URL(SODA_BASE)
    url.searchParams.set('$limit', String(PAGE_SIZE))
    url.searchParams.set('$offset', String(offset))
    url.searchParams.set('$where', whereClause)
    url.searchParams.set('$order', 'date DESC')

    const res = await fetch(url.toString(), {
      headers: {
        'User-Agent': UA,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(30000),
    })
    lastStatus = res.status
    if (!res.ok) throw new Error(`USDA agtransport API returned HTTP ${res.status}`)

    const text = await res.text()
    totalBytes += text.length
    const page: SodaRow[] = JSON.parse(text)

    if (page.length === 0) break
    allRows.push(...page)

    if (page.length < PAGE_SIZE) break
    offset += PAGE_SIZE

    // Polite delay between pages
    await new Promise(r => setTimeout(r, 500))
  }

  return { rows: allRows, bytes: totalBytes, httpStatus: lastStatus }
}

const usdaAgtransportScraper: ScraperFn<MacroStatRow> = async () => {
  const { rows: sodaRows, bytes, httpStatus } = await fetchAllRows()

  if (sodaRows.length === 0) {
    throw new Error('USDA agtransport: API returned zero rows — endpoint may have changed')
  }

  const macroRows: MacroStatRow[] = []

  for (const row of sodaRows) {
    const slug = COMMODITY_MAP[row.commodity]
    if (!slug) continue // skip unknown commodities

    const price = parseFloat(row.price)
    if (!Number.isFinite(price) || price <= 0) continue

    const year = parseInt(row.year, 10)
    const month = parseInt(row.month, 10)
    const period = `${year}-${String(month).padStart(2, '0')}`

    // reference_date = last day of the month
    const lastDay = new Date(year, month, 0).getDate()
    const referenceDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

    macroRows.push({
      source_id: 'usda_agtransport',
      category: 'fertilizer_price',
      commodity: slug,
      region: row.region,
      indicator: 'price',
      value: price,
      unit: 'USD/t',
      period,
      reference_date: referenceDate,
      metadata: {
        usda_commodity: row.commodity,
        quarter: parseInt(row.quarter, 10),
      },
    })
  }

  return {
    rows: macroRows,
    httpStatus,
    bytesFetched: bytes,
    targetPeriod: new Date().toISOString().slice(0, 10),
  }
}

export function runSyncUsdaAgtransport(supabase: SupabaseClient): Promise<JobResult> {
  return runScraperJob({
    supabase,
    scraperId: 'sync-usda-agtransport',
    scraperFn: usdaAgtransportScraper as ScraperFn<Record<string, unknown>>,
    targetTable: 'macro_statistics',
    conflictKey: 'source_id,commodity,region,indicator,period',
  })
}
