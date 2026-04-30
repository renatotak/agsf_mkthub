/**
 * Manual refresh endpoint for the "Atualizar" button in ExecutiveBriefingWidget.
 *
 * POST /api/executive-briefing/refresh
 *
 * Calls runSyncDailyBriefing (same job module used by the cron route and launchd)
 * so the activity log surfaces manual refreshes identically to scheduled runs.
 */

import { NextResponse } from "next/server"
import { createAdminClient } from "@/utils/supabase/admin"
import { runSyncDailyBriefing } from "@/jobs/sync-daily-briefing"

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function POST() {
  const supabase = createAdminClient()
  const result = await runSyncDailyBriefing(supabase, { lens: "daily_themed_briefing" })
  return NextResponse.json({ ok: result.ok, status: result.status, errors: result.errors })
}
