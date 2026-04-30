/**
 * BCB SCR delinquency read endpoint — backs the "Inadimplência" tab in
 * Instituições Financeiras.
 *
 * Returns the 5 BCB SGS series pulled by `sync-bcb-scr-inadimplencia`:
 *   - inadimplencia_total       (21082, system-wide benchmark)
 *   - inadimplencia_pf_total    (21084, all-PF benchmark)
 *   - inadimplencia_pj_total    (21085, all-PJ benchmark)
 *   - inadimplencia_rural_pj    (21136)
 *   - inadimplencia_rural_pf    (21148)
 *
 * Query params:
 *   ?months=12|24|36|all   — trailing window (default 24)
 *
 * Pure SQL aggregation. No LLM.
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'

export const revalidate = 3600 // ISR 1h

const KNOWN_INDICATORS = [
  'inadimplencia_total',
  'inadimplencia_pf_total',
  'inadimplencia_pj_total',
  'inadimplencia_rural_pj',
  'inadimplencia_rural_pf',
] as const

type Indicator = (typeof KNOWN_INDICATORS)[number]

interface SeriesPoint {
  period: string // YYYY-MM
  value: number
}

interface SeriesResponse {
  indicator: Indicator
  bcb_sgs_code: number | null
  label: string
  points: SeriesPoint[]
  latest: { period: string; value: number } | null
  yearAgo: { period: string; value: number } | null
}

const INDICATOR_META: Record<Indicator, { code: number; label: string }> = {
  inadimplencia_total: { code: 21082, label: 'Inadimplência total' },
  inadimplencia_pf_total: { code: 21084, label: 'Inadimplência PF total' },
  inadimplencia_pj_total: { code: 21085, label: 'Inadimplência PJ total' },
  inadimplencia_rural_pj: { code: 21136, label: 'Inadimplência rural PJ' },
  inadimplencia_rural_pf: { code: 21148, label: 'Inadimplência rural PF' },
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const monthsParam = url.searchParams.get('months') || '24'
  const months = monthsParam === 'all'
    ? null
    : Math.max(1, Math.min(120, parseInt(monthsParam, 10) || 24))

  try {
    const supabase = createAdminClient()

    let query = supabase
      .from('macro_statistics')
      .select('indicator, period, value')
      .eq('source_id', 'bcb_scr')
      .in('indicator', KNOWN_INDICATORS as unknown as string[])
      .order('period', { ascending: true })
      .limit(2000)

    if (months !== null) {
      const now = new Date()
      // months ago, anchored to the 1st of that month
      const cutoff = new Date(now.getFullYear(), now.getMonth() - months + 1, 1)
      const cutoffStr = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}`
      query = query.gte('period', cutoffStr)
    }

    const { data, error } = await query
    if (error) throw error

    // Group by indicator
    const grouped: Record<Indicator, SeriesPoint[]> = {
      inadimplencia_total: [],
      inadimplencia_pf_total: [],
      inadimplencia_pj_total: [],
      inadimplencia_rural_pj: [],
      inadimplencia_rural_pf: [],
    }

    for (const row of data ?? []) {
      const ind = row.indicator as Indicator
      if (!(ind in grouped)) continue
      if (row.period == null || row.value == null) continue
      grouped[ind].push({
        period: String(row.period).slice(0, 7),
        value: Number(row.value),
      })
    }

    const series: SeriesResponse[] = (Object.keys(grouped) as Indicator[]).map((ind) => {
      const points = grouped[ind]
      const latest = points.length > 0 ? points[points.length - 1] : null
      // Find the point closest to 12 months before the latest period
      let yearAgo: SeriesPoint | null = null
      if (latest) {
        const [latestYear, latestMonth] = latest.period.split('-').map(Number)
        const targetYear = latestMonth === 12 ? latestYear - 1 : latestYear - 1
        const targetMonth = latestMonth
        const targetKey = `${targetYear}-${String(targetMonth).padStart(2, '0')}`
        const exact = points.find((p) => p.period === targetKey)
        yearAgo = exact ?? null
      }
      return {
        indicator: ind,
        bcb_sgs_code: INDICATOR_META[ind].code,
        label: INDICATOR_META[ind].label,
        points,
        latest,
        yearAgo,
      }
    })

    // Last successful sync timestamp (best effort, fail-soft)
    let last_success_at: string | null = null
    try {
      const { data: scraperRows } = await supabase
        .from('scraper_registry')
        .select('last_success_at')
        .eq('scraper_id', 'sync-bcb-scr-inadimplencia')
        .limit(1)
      last_success_at = scraperRows?.[0]?.last_success_at ?? null
    } catch {
      // ignore
    }

    return NextResponse.json({
      success: true,
      months: months,
      series,
      last_success_at,
      fetched_at: new Date().toISOString(),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { success: false, error: message, series: [] },
      { status: 500 }
    )
  }
}
