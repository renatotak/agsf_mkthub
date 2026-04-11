/**
 * Phase 27 — thin route wrapper for sync-daily-briefing.
 * Job logic lives in src/jobs/sync-daily-briefing.ts.
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { runSyncDailyBriefing } from '@/jobs/sync-daily-briefing'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (
    process.env.NODE_ENV === 'production' &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return new Response('Unauthorized', { status: 401 })
  }

  const result = await runSyncDailyBriefing(createAdminClient())
  return NextResponse.json(
    {
      success: result.ok,
      status: result.status,
      duration_ms: result.durationMs,
      errors: result.errors.length > 0 ? result.errors : undefined,
    },
    { status: result.ok ? 200 : 500 },
  )
}
