/**
 * Phase 24E — World Bank Pink Sheet annual prices scraper.
 *
 * The user follow-up: "missing other information with higher latency, like
 * Brazilian exports volume, Brazilian production, world production, and
 * other information easily scraped from oecd, fao, worldbank...".
 *
 * FAOSTAT already covers soybean/maize production + exports per country
 * (Phase 19B). What's missing for the Contexto Macro tab is the **price**
 * dimension at world level: 65 years of annual nominal commodity prices
 * for soybean, maize, wheat, coffee, cotton, sugar, rice. The World Bank
 * Pink Sheet (CMO) is the canonical source — single Excel file, monthly
 * refresh, free, no auth.
 *
 * Strategy:
 *   1. Fetch the WB Annual Prices Excel from
 *      https://thedocs.worldbank.org/.../CMO-Historical-Data-Annual.xlsx
 *   2. Parse the "Annual Prices (Nominal)" sheet with the existing `xlsx`
 *      library. Header row 4, units row 5, data row 6+.
 *   3. Map fixed column indices (verified via probe) to commodity slugs
 *      that match the existing CULTURES list in MarketPulse.tsx.
 *   4. Upsert each (commodity, year) into macro_statistics with
 *      source_id='worldbank_pinksheet', region='World', indicator='price'.
 *
 * Pure XLSX parse + integer column lookup. No LLM, no regex on prose.
 * Wrapped in runScraper() so the Health tab on Ingestão de Dados surfaces
 * any structural drift in the upstream Excel.
 *
 * Cadence: monthly. The file updates monthly but annual prices only get
 * one new row per year — running monthly is cheap (~3 MB upsert) and
 * idempotent via the (source_id, commodity, region, indicator, period)
 * UNIQUE constraint on macro_statistics.
 */

import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { createAdminClient } from '@/utils/supabase/admin'
import { runScraper, type ScraperFn } from '@/lib/scraper-runner'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const PINK_SHEET_URL =
  'https://thedocs.worldbank.org/en/doc/74e8be41ceb20fa0da750cda2f6b9e4e-0050012026/related/CMO-Historical-Data-Annual.xlsx'

const SHEET_NAME = 'Annual Prices (Nominal)'
const HEADER_ROW = 4
const UNIT_ROW = 5
const DATA_START_ROW = 6

// Column index → AgriSafe commodity slug. Verified by probe against the
// 2026-04-08 release of the file. If WB ever reorders columns, the
// runScraper() validator will catch the units mismatch and the Health
// tab flips us to broken.
//
// Each entry maps to one (or several) commodities; the AgriSafe slug is
// the same `slug` used in CULTURES (MarketPulse.tsx). For wheat we pick
// US SRW (col 34) which is the more liquid contract reference.
const COMMODITY_COLUMNS: { col: number; slug: string; expectedNamePrefix: string; expectedUnit: string }[] = [
  { col: 12, slug: 'cafe',     expectedNamePrefix: 'Coffee, Arabica', expectedUnit: '$/kg' },
  { col: 24, slug: 'soja',     expectedNamePrefix: 'Soybeans',        expectedUnit: '$/mt' },
  { col: 28, slug: 'milho',    expectedNamePrefix: 'Maize',           expectedUnit: '$/mt' },
  { col: 34, slug: 'trigo',    expectedNamePrefix: 'Wheat, US SRW',   expectedUnit: '$/mt' },
  { col: 45, slug: 'acucar',   expectedNamePrefix: 'Sugar, world',    expectedUnit: '$/kg' },
  { col: 52, slug: 'algodao',  expectedNamePrefix: 'Cotton, A Index', expectedUnit: '$/kg' },
]

// How many recent years of data to upsert. The Excel goes back to 1960
// but we don't need that depth in macro_statistics — Pulso do Mercado
// charts the last 5-10 years. Keeping it tight reduces upsert volume.
const RECENT_YEARS = 15

interface PriceRow extends Record<string, unknown> {
  source_id: 'worldbank_pinksheet'
  category: 'price_index'
  commodity: string
  region: 'World'
  indicator: 'price'
  value: number
  unit: string
  period: string
  reference_date: string
  metadata: { wb_column_label: string }
}

const worldbankPricesScraper: ScraperFn<PriceRow> = async () => {
  // Fetch the Excel
  const res = await fetch(PINK_SHEET_URL, {
    headers: { 'User-Agent': 'AgriSafe-MarketHub/1.0 (World Bank Pink Sheet scraper)' },
    signal: AbortSignal.timeout(45000),
  })
  if (!res.ok) {
    throw new Error(`World Bank Pink Sheet returned http ${res.status}`)
  }
  const buf = Buffer.from(await res.arrayBuffer())
  const bytes = buf.length

  // Parse
  const wb = XLSX.read(buf, { type: 'buffer' })
  const ws = wb.Sheets[SHEET_NAME]
  if (!ws) {
    throw new Error(`World Bank workbook missing expected sheet "${SHEET_NAME}"`)
  }
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false })

  if (aoa.length < DATA_START_ROW + 5) {
    throw new Error(`World Bank sheet has only ${aoa.length} rows — schema may have changed`)
  }
  const headers = aoa[HEADER_ROW] as unknown[]
  const units = aoa[UNIT_ROW] as unknown[]

  // Validate column layout — the runScraper validator catches downstream
  // shape changes, but a header-row sanity check here gives us a clearer
  // failure message before we waste time inserting bad rows.
  for (const map of COMMODITY_COLUMNS) {
    const headerVal = String(headers[map.col] || '')
    const unitVal = String(units[map.col] || '')
    if (!headerVal.startsWith(map.expectedNamePrefix)) {
      throw new Error(
        `Pink Sheet column drift: col ${map.col} expected "${map.expectedNamePrefix}*" but got "${headerVal}"`,
      )
    }
    if (!unitVal.includes(map.expectedUnit)) {
      throw new Error(
        `Pink Sheet unit drift: col ${map.col} (${map.slug}) expected unit "${map.expectedUnit}" but got "${unitVal}"`,
      )
    }
  }

  // Walk data rows from the bottom (latest year first), keep RECENT_YEARS
  const rows: PriceRow[] = []
  const today = new Date().toISOString().slice(0, 10)
  let yearsCollected = 0

  for (let rowIdx = aoa.length - 1; rowIdx >= DATA_START_ROW; rowIdx--) {
    const row = aoa[rowIdx]
    const yearCell = row[0]
    if (typeof yearCell !== 'number' || yearCell < 1900 || yearCell > 2100) continue
    const year = yearCell

    for (const map of COMMODITY_COLUMNS) {
      const cell = row[map.col]
      if (cell == null || cell === '…' || cell === '') continue
      const value = typeof cell === 'number' ? cell : parseFloat(String(cell))
      if (!Number.isFinite(value)) continue

      const headerVal = String(headers[map.col])
      const unitVal = String(units[map.col])

      rows.push({
        source_id: 'worldbank_pinksheet',
        category: 'price_index',
        commodity: map.slug,
        region: 'World',
        indicator: 'price',
        value,
        unit: unitVal,
        period: String(year),
        reference_date: `${year}-12-31`,
        metadata: { wb_column_label: headerVal },
      })
    }

    yearsCollected++
    if (yearsCollected >= RECENT_YEARS) break
  }

  return {
    rows,
    httpStatus: res.status,
    bytesFetched: bytes,
    targetPeriod: today,
  }
}

// ─── HTTP entry point ──────────────────────────────────────────────────────

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
    const outcome = await runScraper<PriceRow>(
      'sync-worldbank-prices',
      worldbankPricesScraper,
      { supabase },
    )

    if (!outcome.ok || outcome.rows.length === 0) {
      return NextResponse.json({
        success: false,
        run_id: outcome.runId,
        status: outcome.status,
        rows_fetched: outcome.rowsFetched,
        validation_errors: outcome.validationErrors,
        error: outcome.errorMessage,
      })
    }

    // Upsert in batches — 6 commodities × 15 years = 90 rows max
    const { error, count } = await supabase
      .from('macro_statistics')
      .upsert(outcome.rows, {
        onConflict: 'source_id,commodity,region,indicator,period',
        count: 'exact',
      })

    if (error) {
      return NextResponse.json({
        success: false,
        run_id: outcome.runId,
        upsert_error: error.message,
      })
    }

    return NextResponse.json({
      success: true,
      run_id: outcome.runId,
      status: outcome.status,
      rows_fetched: outcome.rowsFetched,
      rows_upserted: count ?? outcome.rows.length,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
