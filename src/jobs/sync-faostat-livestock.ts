/**
 * Phase 26 — sync-faostat-livestock job module.
 *
 * Companion to sync-faostat (crops, QCL domain). This job hits the
 * FAOSTAT QL (livestock) domain to add cattle/chicken/swine production
 * coverage — closes the boi-gordo gap noted in faostat-codes.ts.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { type ScraperFn } from '@/lib/scraper-runner'
import { runScraperJob } from '@/lib/scraper-job-runner'
import {
  LIVESTOCK_AREAS,
  LIVESTOCK_ITEMS,
  LIVESTOCK_ELEMENTS,
  buildFaostatLivestockUrl,
} from '@/lib/macro/faostat-livestock-codes'
import type { FaostatRecord } from '@/lib/macro/faostat-codes'
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

const fetchFaostatLivestock: ScraperFn<MacroStatRow> = async () => {
  const currentYear = new Date().getFullYear()
  const years = [currentYear - 5, currentYear - 4, currentYear - 3, currentYear - 2, currentYear - 1]
  const url = buildFaostatLivestockUrl(years)

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'AgriSafe-MarketHub/1.0 (FAOSTAT livestock scraper)',
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(45000),
  })

  if (!res.ok) throw new Error(`FAOSTAT QL returned http ${res.status} for ${url}`)

  const text = await res.text()
  const bytes = text.length

  let payload: { data?: FaostatRecord[] }
  try {
    payload = JSON.parse(text)
  } catch (e) {
    throw new Error(`FAOSTAT QL response was not valid JSON: ${(e as Error).message}`)
  }

  if (!payload.data || !Array.isArray(payload.data)) {
    throw new Error('FAOSTAT QL response missing `data` array — schema may have changed')
  }

  const rows: MacroStatRow[] = []
  for (const rec of payload.data) {
    const region = LIVESTOCK_AREAS[rec['Area Code']]
    const item = LIVESTOCK_ITEMS[rec['Item Code']]
    const element = LIVESTOCK_ELEMENTS[rec['Element Code']]
    if (!region || !item || !element) continue

    const year = String(rec.Year)
    const valueRaw = rec.Value
    if (typeof valueRaw !== 'number' || !Number.isFinite(valueRaw)) continue

    rows.push({
      source_id: 'faostat_livestock',
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
        domain: 'QL',
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

export function runSyncFaostatLivestock(supabase: SupabaseClient): Promise<JobResult> {
  return runScraperJob({
    supabase,
    scraperId: 'sync-faostat-livestock',
    scraperFn: fetchFaostatLivestock as ScraperFn<Record<string, unknown>>,
    targetTable: 'macro_statistics',
    conflictKey: 'source_id,commodity,region,indicator,period',
  })
}
