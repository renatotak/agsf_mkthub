/**
 * Phase 25 — /api/regulatory/affected-entities.
 *
 * Read endpoint backed by migration 044's `v_norms_affecting_entity`
 * + `v_norm_entity_counts` views. Powers the "X empresas afetadas"
 * badge in Marco Regulatório and the per-norm drilldown modal.
 *
 *   GET /api/regulatory/affected-entities                       → counts for every norm
 *   GET /api/regulatory/affected-entities?norm_id=<id>          → entity rows for one norm
 *   GET /api/regulatory/affected-entities?summary=true          → top norms by count
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function GET(req: NextRequest) {
  const normId = req.nextUrl.searchParams.get("norm_id")
  const summaryOnly = req.nextUrl.searchParams.get("summary") === "true"

  // Drilldown: full list of entities affected by one specific norm
  if (normId) {
    const { data, error } = await supabaseAdmin
      .from("v_norms_affecting_entity")
      .select("entity_uid, tax_id, tax_id_type, legal_name, display_name, primary_cnae, uf")
      .eq("norm_id", normId)
      .order("display_name")
      .limit(500)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({
      norm_id: normId,
      count: data?.length ?? 0,
      entities: data || [],
    })
  }

  // Aggregated counts per norm — drives the badge in the Marco Reg list
  const query = supabaseAdmin
    .from("v_norm_entity_counts")
    .select("*")
    .order("affected_entity_count", { ascending: false })

  if (summaryOnly) query.limit(10)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    count: data?.length ?? 0,
    norms: data || [],
  })
}
