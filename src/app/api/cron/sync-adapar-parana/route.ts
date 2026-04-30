/**
 * Phase 30 — thin route wrapper for sync-adapar-parana.
 * Job logic lives in src/jobs/sync-adapar-parana.ts.
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { runSyncAdaparParana } from '@/jobs/sync-adapar-parana'

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

  const result = await runSyncAdaparParana(createAdminClient())
  return NextResponse.json(
    {
      success: result.ok,
      status: result.status,
      rows_fetched: result.recordsFetched,
      rows_upserted: result.recordsUpdated,
      duration_ms: result.durationMs,
      stats: result.stats,
      errors: result.errors.length > 0 ? result.errors : undefined,
    },
    { status: result.ok ? 200 : 500 },
  )
}
