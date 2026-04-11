/**
 * Phase 19B — Macro statistics read endpoint.
 *
 * Backs the Pulso do Mercado "Contexto Macro" sub-tab.
 * Public-read, ISR cached 1h. Returns rows from `macro_statistics`
 * filtered by query params, plus `last_success_at` from
 * `scraper_registry` so the UI can show MockBadge when data is stale.
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'

export const revalidate = 3600

export async function GET(request: Request) {
  const url = new URL(request.url)
  const commodity = url.searchParams.get('commodity')
  const region = url.searchParams.get('region')
  const indicator = url.searchParams.get('indicator')
  const sourceId = url.searchParams.get('source_id')
  const periodFrom = url.searchParams.get('period_from')
  const periodTo = url.searchParams.get('period_to')
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '200', 10), 1000)

  try {
    const supabase = createAdminClient()

    let query = supabase
      .from('macro_statistics')
      .select('*', { count: 'exact' })
      .order('reference_date', { ascending: false })
      .limit(limit)

    if (commodity) query = query.eq('commodity', commodity)
    if (region) query = query.eq('region', region)
    if (indicator) query = query.eq('indicator', indicator)
    if (sourceId) query = query.eq('source_id', sourceId)
    if (periodFrom) query = query.gte('period', periodFrom)
    if (periodTo) query = query.lte('period', periodTo)

    const { data, error, count } = await query
    if (error) throw error

    // Phase 26 — pull the most recent last_success_at across all macro scrapers
    // so the UI can show MockBadge when data is stale.
    const MACRO_SCRAPERS = [
      'sync-faostat-prod', 'sync-faostat-livestock',
      'sync-usda-psd', 'sync-conab-safra', 'sync-mdic-comexstat',
      'sync-worldbank-prices',
    ]
    const { data: scraperRows } = await supabase
      .from('scraper_registry')
      .select('last_success_at, status, cadence')
      .in('scraper_id', MACRO_SCRAPERS)
      .order('last_success_at', { ascending: false })
      .limit(1)

    const latestScraper = scraperRows?.[0] ?? null

    return NextResponse.json({
      success: true,
      rows: data || [],
      total: count ?? 0,
      last_success_at: latestScraper?.last_success_at ?? null,
      scraper_status: latestScraper?.status ?? null,
      scraper_cadence: latestScraper?.cadence ?? null,
      fetched_at: new Date().toISOString(),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { success: false, error: message, rows: [], total: 0 },
      { status: 500 }
    )
  }
}
