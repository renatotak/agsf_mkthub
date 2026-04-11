/**
 * Phase 27 — Executive briefing read endpoint.
 *
 *   GET /api/executive-briefing              → latest briefing
 *   GET /api/executive-briefing?date=YYYY-MM-DD → specific date
 *   GET /api/executive-briefing?list=true    → last 7 briefings (dates only)
 */

import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/utils/supabase/admin"

export const revalidate = 300

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date")
  const list = req.nextUrl.searchParams.get("list") === "true"
  const supabase = createAdminClient()

  if (list) {
    const { data } = await supabase
      .from("executive_briefings")
      .select("briefing_date, generated_at")
      .order("briefing_date", { ascending: false })
      .limit(7)
    return NextResponse.json({ briefings: data || [] })
  }

  let query = supabase
    .from("executive_briefings")
    .select("*")
    .order("briefing_date", { ascending: false })
    .limit(1)

  if (date) query = query.eq("briefing_date", date)

  const { data, error } = await query.maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ briefing: data })
}
