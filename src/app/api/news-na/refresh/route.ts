/**
 * Bug-fix 2026-04-30 — manual refresh endpoint for the "Atualizar" button
 * in the Notícias Agro module.
 *
 * The /api/cron/sync-agro-news route is gated by CRON_SECRET in production
 * (so the browser can't call it directly). This is the user-facing trigger:
 * an authenticated session calls POST /api/news-na/refresh and the same
 * job module runs. logActivity() inside runSyncAgroNews keeps the activity
 * feed in sync with manual refreshes.
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { runSyncAgroNews } from "@/jobs/sync-agro-news";

export const dynamic = "force-dynamic";

export async function POST() {
  const result = await runSyncAgroNews(createAdminClient());
  return NextResponse.json(
    {
      success: result.ok,
      timestamp: result.finishedAt,
      duration_ms: result.durationMs,
      stats: result.stats,
      errors: result.errors.length > 0 ? result.errors : undefined,
    },
    { status: result.ok ? 200 : 500 },
  );
}
