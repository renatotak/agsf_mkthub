/**
 * Phase 5b — Canonical inputs read endpoint.
 *
 * Returns the culture_canonical_inputs rows for a given culture,
 * optionally filtered by category. Used by the AgInputIntelligence
 * "Pacote de Insumos" and "Indústria → Produtos" views.
 *
 * Query params:
 *   culture     required — slug like 'soja'
 *   category    optional — e.g. 'fungicida_premium'
 *   industry    optional — filter by industry_name
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'

export const dynamic = 'force-dynamic'
export const revalidate = 600

export async function GET(request: Request) {
  const url = new URL(request.url)
  const culture = url.searchParams.get('culture')
  const category = url.searchParams.get('category')
  const industry = url.searchParams.get('industry')

  if (!culture) {
    return NextResponse.json(
      { success: false, error: 'culture query param is required' },
      { status: 400 }
    )
  }

  try {
    const supabase = createAdminClient()

    let query = supabase
      .from('culture_canonical_inputs')
      .select('*')
      .eq('culture', culture)
      .order('category')
      .order('rank', { ascending: true, nullsFirst: false })

    if (category) query = query.eq('category', category)
    if (industry) query = query.ilike('industry_name', `%${industry}%`)

    const { data, error } = await query
    if (error) throw error

    // Group by category for the UI
    const grouped: Record<string, typeof data> = {}
    for (const row of data || []) {
      if (!grouped[row.category]) grouped[row.category] = []
      grouped[row.category].push(row)
    }

    // Industry pivot: group by industry_name
    const byIndustry: Record<string, typeof data> = {}
    for (const row of data || []) {
      const name = row.industry_name || 'Outros'
      if (!byIndustry[name]) byIndustry[name] = []
      byIndustry[name].push(row)
    }

    return NextResponse.json({
      success: true,
      culture,
      total: (data || []).length,
      categories: Object.keys(grouped),
      by_category: grouped,
      by_industry: byIndustry,
      fetched_at: new Date().toISOString(),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}
