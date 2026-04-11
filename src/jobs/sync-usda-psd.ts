/**
 * Phase 26 — sync-usda-psd job module.
 *
 * Pulls country-level Production / Supply / Distribution data from
 * USDA FAS PSD Online. Three commodity groups (oilseeds, grains,
 * cotton) come as separate CSV ZIP downloads with no auth.
 *
 * Filtering:
 *   - Only commodities listed in PSD_COMMODITIES (soybean, corn, wheat,
 *     cotton, rice)
 *   - Only countries listed in PSD_COUNTRIES (key producers + World)
 *   - Only attributes 28/88/86/176 (production, exports, imports,
 *     ending stocks)
 *   - Only the last 5 marketing years
 *
 * Each CSV row becomes one macro_statistics row keyed on
 * (source_id, commodity, region, indicator, period).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import AdmZip from 'adm-zip'
import { type ScraperFn } from '@/lib/scraper-runner'
import { runScraperJob } from '@/lib/scraper-job-runner'
import {
  PSD_CSV_URLS,
  PSD_COMMODITIES,
  PSD_COUNTRIES,
  PSD_ATTRIBUTES,
  PSD_UNIT_MULTIPLIER,
  PSD_OUTPUT_UNIT,
} from '@/lib/macro/usda-psd-codes'
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

// Parse a single CSV (RFC 4180-ish) into header + rows of strings.
// USDA PSD CSVs are simple — quoted strings only when needed, no
// embedded newlines. A minimal split-on-comma + strip-quotes is fine.
function parseCsv(text: string): { header: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0)
  if (lines.length === 0) return { header: [], rows: [] }
  const header = splitCsvLine(lines[0])
  const rows: string[][] = []
  for (let i = 1; i < lines.length; i++) {
    rows.push(splitCsvLine(lines[i]))
  }
  return { header, rows }
}

function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"'
        i++
      } else if (ch === '"') {
        inQuotes = false
      } else {
        cur += ch
      }
    } else {
      if (ch === ',') {
        out.push(cur)
        cur = ''
      } else if (ch === '"') {
        inQuotes = true
      } else {
        cur += ch
      }
    }
  }
  out.push(cur)
  return out.map((c) => c.trim())
}

async function fetchAndUnzipCsv(url: string): Promise<{ csv: string; bytes: number; httpStatus: number }> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'AgriSafe-MarketHub/1.0 (USDA PSD scraper)' },
    signal: AbortSignal.timeout(120000),
  })
  if (!res.ok) throw new Error(`USDA PSD ${url} returned http ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  const bytes = buf.length

  const zip = new AdmZip(buf)
  const entries = zip.getEntries().filter((e) => e.entryName.toLowerCase().endsWith('.csv'))
  if (entries.length === 0) {
    throw new Error(`USDA PSD ZIP at ${url} contains no CSV — schema may have changed`)
  }
  // Pick the largest CSV (the main data file)
  entries.sort((a, b) => b.header.size - a.header.size)
  const csv = entries[0].getData().toString('utf-8')
  return { csv, bytes, httpStatus: res.status }
}

const fetchUsdaPsd: ScraperFn<MacroStatRow> = async () => {
  const currentYear = new Date().getFullYear()
  const minYear = currentYear - 5
  const rows: MacroStatRow[] = []
  let totalBytes = 0
  let lastStatus = 0

  for (const [group, url] of Object.entries(PSD_CSV_URLS)) {
    const { csv, bytes, httpStatus } = await fetchAndUnzipCsv(url)
    totalBytes += bytes
    lastStatus = httpStatus

    const { header, rows: csvRows } = parseCsv(csv)
    if (csvRows.length === 0) {
      throw new Error(`USDA PSD ${group} CSV had no data rows`)
    }

    // Build header → index map. PSD column names are stable:
    // Commodity_Code, Commodity_Description, Country_Code, Country_Name,
    // Market_Year, Calendar_Year, Month, Attribute_Id, Attribute_Description,
    // Unit_Id, Unit_Description, Value
    const idx: Record<string, number> = {}
    header.forEach((h, i) => {
      idx[h] = i
    })
    const required = ['Commodity_Code', 'Country_Code', 'Market_Year', 'Attribute_ID', 'Value']
    for (const k of required) {
      if (idx[k] === undefined) {
        throw new Error(`USDA PSD ${group} CSV missing column "${k}" — schema drift`)
      }
    }

    for (const row of csvRows) {
      const commodityCode = row[idx['Commodity_Code']]
      const countryCode = row[idx['Country_Code']]
      const marketYear = parseInt(row[idx['Market_Year']], 10)
      const attributeId = parseInt(row[idx['Attribute_ID']], 10)
      const valueRaw = parseFloat(row[idx['Value']])

      const commodity = PSD_COMMODITIES[commodityCode]
      const region = PSD_COUNTRIES[countryCode]
      const attribute = PSD_ATTRIBUTES[attributeId]
      if (!commodity || !region || !attribute) continue
      if (!Number.isFinite(marketYear) || marketYear < minYear) continue
      if (!Number.isFinite(valueRaw)) continue

      // PSD reports volumes in 1000 MT, area in 1000 HA, yield in MT/HA.
      // We normalize to tonnes / hectares / MT-per-HA.
      let value = valueRaw
      let unit = PSD_OUTPUT_UNIT
      if (attribute.indicator === 'area_harvested') {
        value = valueRaw * PSD_UNIT_MULTIPLIER
        unit = 'hectares'
      } else if (attribute.indicator === 'yield') {
        unit = 'tonnes/hectare'
      } else {
        value = valueRaw * PSD_UNIT_MULTIPLIER
      }

      rows.push({
        source_id: 'usda_psd',
        category: attribute.category,
        commodity: commodity.commodity,
        region,
        indicator: attribute.indicator,
        value,
        unit,
        period: String(marketYear),
        reference_date: `${marketYear}-12-31`,
        metadata: {
          psd_commodity_code: commodityCode,
          psd_country_code: countryCode,
          psd_attribute_id: attributeId,
          psd_group: group,
          psd_label: commodity.label,
        },
      })
    }
  }

  // Dedupe by conflict key — PSD has multiple Calendar_Year/Month rows
  // per (Commodity, Country, Market_Year, Attribute) showing forecast
  // revisions. Keep the most recent forecast (last seen wins).
  const byKey = new Map<string, MacroStatRow>()
  for (const r of rows) {
    const key = `${r.source_id}|${r.commodity}|${r.region}|${r.indicator}|${r.period}`
    byKey.set(key, r)
  }
  const deduped = Array.from(byKey.values())

  return {
    rows: deduped,
    httpStatus: lastStatus,
    bytesFetched: totalBytes,
    targetPeriod: `${minYear}-${currentYear - 1}`,
  }
}

export function runSyncUsdaPsd(supabase: SupabaseClient): Promise<JobResult> {
  return runScraperJob({
    supabase,
    scraperId: 'sync-usda-psd',
    scraperFn: fetchUsdaPsd as ScraperFn<Record<string, unknown>>,
    targetTable: 'macro_statistics',
    conflictKey: 'source_id,commodity,region,indicator,period',
  })
}
