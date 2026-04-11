/**
 * Phase 26 — sync-conab-safra job module.
 *
 * Two-step fetch:
 *   1. Scrape the CONAB "Safra de Grãos" index page for the latest
 *      monthly Levantamento link, then scrape THAT page for the
 *      "site_previsao_de_safra-por_produto-MMM-YYYY.xlsx" attachment.
 *   2. Download the workbook and parse one sheet per supported crop.
 *
 * Each per-crop sheet has the same shape (header row 0–2, data rows
 * 3+), with two safras side-by-side: the previous closed safra (a/c/e)
 * and the current forecast safra (b/d/f). Each row is either a region,
 * a UF, or the BRASIL total. We emit one macro_statistics row per
 * (commodity, region, indicator, period).
 *
 * Output: ~ (10 crops × 27 UFs + 5 regions + 1 Brasil) × 3 indicators ×
 * 2 safras = up to ~2,000 rows per run.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'
import { type ScraperFn } from '@/lib/scraper-runner'
import { runScraperJob } from '@/lib/scraper-job-runner'
import {
  CONAB_BOLETIM_INDEX_URL,
  CONAB_USER_AGENT,
  CONAB_SHEETS,
  CONAB_INDICATOR_GROUPS,
  BRAZILIAN_STATES,
  BRAZILIAN_REGIONS,
} from '@/lib/macro/conab-codes'
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

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': CONAB_USER_AGENT, Accept: 'text/html' },
    signal: AbortSignal.timeout(45000),
  })
  if (!res.ok) throw new Error(`CONAB ${url} returned http ${res.status}`)
  return await res.text()
}

/**
 * Walk the boletim index page, find the latest "boletim-da-safra-de-graos"
 * subpage URL, then fetch that subpage and find the
 * "site_previsao_de_safra-por_produto-*.xlsx" link inside.
 */
async function findLatestXlsxUrl(): Promise<string> {
  const indexHtml = await fetchHtml(CONAB_BOLETIM_INDEX_URL)
  const levMatches = Array.from(
    indexHtml.matchAll(/href="([^"]*\/boletim-da-safra-de-graos\/[^"]+\/[^"]+)"/g),
  )
  if (levMatches.length === 0) {
    throw new Error('CONAB boletim index — no levantamento subpages found')
  }
  // Take the first one (most recent levantamento is listed first)
  const subpage = levMatches[0][1]
  const subpageUrl = subpage.startsWith('http') ? subpage : `https://www.gov.br${subpage}`

  const subpageHtml = await fetchHtml(subpageUrl)
  const xlsxMatch = subpageHtml.match(
    /href="([^"]*site_previsao_de_safra[^"]*\.xlsx)"/i,
  )
  if (!xlsxMatch) {
    throw new Error(`CONAB ${subpageUrl} — no previsao_de_safra xlsx link found`)
  }
  const xlsxRel = xlsxMatch[1]
  return xlsxRel.startsWith('http') ? xlsxRel : `https://www.gov.br${xlsxRel}`
}

interface SafraColumns {
  safraA: string  // e.g. "24/25" → previous closed safra
  safraB: string  // e.g. "25/26" → current forecast safra
}

/**
 * Inspect the header rows (0..2) of a per-crop sheet to read the safra
 * labels. Each indicator group has 3 columns (a, b, var%); the safra
 * labels live in row 1.
 */
function readSafraColumns(aoa: unknown[][]): SafraColumns | null {
  if (aoa.length < 3) return null
  const row1 = aoa[1]
  if (!Array.isArray(row1)) return null
  // The first indicator group starts at column 1 → cols 1 and 2 are
  // "Safra X/Y" and "Safra Y/Z"
  const a = String(row1[1] || '').match(/(\d{2}\/\d{2})/)
  const b = String(row1[2] || '').match(/(\d{2}\/\d{2})/)
  if (!a || !b) return null
  return { safraA: a[1], safraB: b[1] }
}

function safraToYear(safra: string): { year: number; period: string } {
  // "24/25" → year=2024 (start year of the harvest)
  const m = safra.match(/^(\d{2})\/(\d{2})$/)
  if (!m) return { year: 0, period: safra }
  const startYY = parseInt(m[1], 10)
  // CONAB uses 2-digit years; assume 20xx
  const year = 2000 + startYY
  return { year, period: `20${m[1]}/${m[2]}` }
}

function normalizeRegionLabel(raw: string): { region: string; granularity: string } | null {
  const cleaned = raw.trim().replace(/\s+/g, ' ')
  const upper = cleaned.toUpperCase()
  if (upper === 'BRASIL' || upper === 'BRAZIL') return { region: 'Brazil', granularity: 'country' }
  if (BRAZILIAN_STATES.has(upper)) return { region: `Brazil-${upper}`, granularity: 'state' }
  if (BRAZILIAN_REGIONS.has(upper)) return { region: `Brazil-${upper.replace(' ', '-')}`, granularity: 'region' }
  return null
}

const fetchConab: ScraperFn<MacroStatRow> = async () => {
  const xlsxUrl = await findLatestXlsxUrl()
  const res = await fetch(xlsxUrl, {
    headers: { 'User-Agent': CONAB_USER_AGENT },
    signal: AbortSignal.timeout(60000),
  })
  if (!res.ok) throw new Error(`CONAB xlsx ${xlsxUrl} returned http ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  const bytes = buf.length

  let wb: XLSX.WorkBook
  try {
    wb = XLSX.read(buf, { type: 'buffer' })
  } catch (e) {
    throw new Error(`CONAB xlsx unreadable: ${(e as Error).message}`)
  }

  const rows: MacroStatRow[] = []

  for (const [sheetName, commodity] of Object.entries(CONAB_SHEETS)) {
    const ws = wb.Sheets[sheetName]
    if (!ws) continue

    const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1,
      blankrows: false,
      defval: null,
    })
    const safras = readSafraColumns(aoa)
    if (!safras) continue
    const periodA = safraToYear(safras.safraA)
    const periodB = safraToYear(safras.safraB)

    // Data rows start at index 3
    for (let r = 3; r < aoa.length; r++) {
      const row = aoa[r]
      if (!Array.isArray(row)) continue
      const labelCell = row[0]
      if (labelCell == null) continue
      const region = normalizeRegionLabel(String(labelCell))
      if (!region) continue

      for (const grp of CONAB_INDICATOR_GROUPS) {
        const valA = row[grp.startCol]      // previous safra
        const valB = row[grp.startCol + 1]  // current forecast

        for (const [period, raw] of [
          [periodA, valA] as const,
          [periodB, valB] as const,
        ]) {
          if (raw == null || raw === '') continue
          const num = typeof raw === 'number' ? raw : parseFloat(String(raw).replace(',', '.'))
          if (!Number.isFinite(num) || num <= 0) continue
          if (period.year === 0) continue

          rows.push({
            source_id: 'conab',
            category: grp.category,
            commodity,
            region: region.region,
            indicator: grp.indicator,
            value: num * grp.multiplier,
            unit: grp.unit,
            period: period.period,
            reference_date: `${period.year}-12-31`,
            metadata: {
              conab_sheet: sheetName,
              granularity: region.granularity,
              raw_value: num,
            },
          })
        }
      }
    }
  }

  // Dedupe by conflict key — multiple sheets can name the same crop
  const byKey = new Map<string, MacroStatRow>()
  for (const r of rows) {
    const key = `${r.source_id}|${r.commodity}|${r.region}|${r.indicator}|${r.period}`
    byKey.set(key, r)
  }
  const deduped = Array.from(byKey.values())

  return {
    rows: deduped,
    httpStatus: res.status,
    bytesFetched: bytes,
    targetPeriod: xlsxUrl.split('/').pop() || '',
  }
}

export function runSyncConabSafra(supabase: SupabaseClient): Promise<JobResult> {
  return runScraperJob({
    supabase,
    scraperId: 'sync-conab-safra',
    scraperFn: fetchConab as ScraperFn<Record<string, unknown>>,
    targetTable: 'macro_statistics',
    conflictKey: 'source_id,commodity,region,indicator,period',
  })
}
