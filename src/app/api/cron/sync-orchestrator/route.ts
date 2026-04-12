/**
 * Smart cron orchestrator — probes all sources for freshness,
 * only runs jobs when new data is detected.
 */
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { runSyncOrchestrator } from '@/jobs/sync-orchestrator'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (
    process.env.NODE_ENV === 'production' &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return new Response('Unauthorized', { status: 401 })
  }

  const result = await runSyncOrchestrator(createAdminClient())
  return NextResponse.json(
    {
      success: result.ok,
      status: result.status,
      ran: result.recordsFetched,
      succeeded: result.recordsUpdated,
      duration_ms: result.durationMs,
      stats: result.stats,
      errors: result.errors.length > 0 ? result.errors : undefined,
    },
    { status: result.ok ? 200 : 500 },
  )
}
