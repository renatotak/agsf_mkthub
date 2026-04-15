import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { logActivity } from '@/lib/activity-log'

export const dynamic = 'force-dynamic'

/**
 * GET /api/financial-institutions — list all, with optional filters
 *   ?type=   — filter by institution_type
 *   ?uf=     — filter by headquarters_uf
 *   ?q=      — text search on name / short_name
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type')
  const uf = searchParams.get('uf')
  const q = searchParams.get('q')

  try {
    const supabase = createAdminClient()
    let query = supabase
      .from('financial_institutions')
      .select('*')
      .order('name')

    if (type) query = query.eq('institution_type', type)
    if (uf) query = query.eq('headquarters_uf', uf)
    if (q) query = query.or(`name.ilike.%${q}%,short_name.ilike.%${q}%`)

    const { data, error } = await query
    if (error) throw error

    return NextResponse.json({ institutions: data || [] })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * POST /api/financial-institutions — insert a new institution
 */
export async function POST(request: Request) {
  try {
    const supabase = createAdminClient()
    const body = await request.json()

    const { data, error } = await supabase
      .from('financial_institutions')
      .insert(body)
      .select()
      .single()

    if (error) throw error

    await logActivity(supabase, {
      source: 'manual:financial_institution_create',
      source_kind: 'manual',
      action: 'insert',
      target_table: 'financial_institutions',
      target_id: data.id,
      summary: `Created financial institution: ${data.name}`,
    })

    return NextResponse.json({ institution: data }, { status: 201 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * PATCH /api/financial-institutions?id= — update fields
 */
export async function PATCH(request: Request) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) {
    return NextResponse.json({ error: 'Missing ?id= parameter' }, { status: 400 })
  }

  try {
    const supabase = createAdminClient()
    const body = await request.json()

    const { data, error } = await supabase
      .from('financial_institutions')
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    await logActivity(supabase, {
      source: 'manual:financial_institution_update',
      source_kind: 'manual',
      action: 'update',
      target_table: 'financial_institutions',
      target_id: data.id,
      summary: `Updated financial institution: ${data.name}`,
    })

    return NextResponse.json({ institution: data })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
