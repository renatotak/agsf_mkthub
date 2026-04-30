/**
 * Phase 29 — thin route wrapper for sync-rj-candidates.
 *
 * Discovers companies in agro_news×entity_mentions that match RJ
 * keywords and aren't already in recuperacao_judicial. Replaces the
 * abandoned Serasa CSV approach.
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { runSyncRjCandidates } from "@/jobs/sync-rj-candidates";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (
    process.env.NODE_ENV === "production" &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabase = createAdminClient();
  const result = await runSyncRjCandidates(supabase);

  return NextResponse.json(
    {
      success: result.ok,
      message: result.ok
        ? `RJ Candidates: ${result.recordsUpdated} new candidates discovered`
        : "Failed to discover RJ candidates",
      timestamp: result.finishedAt,
      duration_ms: result.durationMs,
      records_fetched: result.recordsFetched,
      records_updated: result.recordsUpdated,
      stats: result.stats,
      errors: result.errors.length > 0 ? result.errors : undefined,
    },
    { status: result.ok ? 200 : 500 },
  );
}
