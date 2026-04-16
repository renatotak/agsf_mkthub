/**
 * Phase 6d — thin route wrapper for sync-regulatory-digest.
 * Job logic lives in src/jobs/sync-regulatory-digest.ts.
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { runSyncRegulatoryDigest } from '@/jobs/sync-regulatory-digest'

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

  const result = await runSyncRegulatoryDigest(createAdminClient())
  return NextResponse.json(
    {
      success: result.ok,
      status: result.status,
      duration_ms: result.durationMs,
      fetched: result.recordsFetched,
      updated: result.recordsUpdated,
      errors: result.errors.length > 0 ? result.errors : undefined,
      stats: result.stats,
    },
    { status: result.ok ? 200 : 500 },
  )
}
