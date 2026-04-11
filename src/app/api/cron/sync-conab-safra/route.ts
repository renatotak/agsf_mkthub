/**
 * Phase 26 — thin route wrapper for sync-conab-safra.
 * Job logic lives in src/jobs/sync-conab-safra.ts.
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { runSyncConabSafra } from '@/jobs/sync-conab-safra'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (
    process.env.NODE_ENV === 'production' &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return new Response('Unauthorized', { status: 401 })
  }

  const result = await runSyncConabSafra(createAdminClient())
  return NextResponse.json(
    {
      success: result.ok,
      run_id: result.stats?.runId,
      status: result.status,
      rows_fetched: result.recordsFetched,
      rows_upserted: result.recordsUpdated,
      duration_ms: result.durationMs,
      errors: result.errors.length > 0 ? result.errors : undefined,
    },
    { status: result.ok ? 200 : 500 },
  )
}
