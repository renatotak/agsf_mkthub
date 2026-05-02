import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";

/**
 * GET /api/nocampo/user-plan
 *
 * Returns the authenticated user's plan tier, feature flags, caps, and quota usage.
 * Auth: Supabase JWT (not API key — this is a per-user endpoint).
 *
 * Response shape:
 * {
 *   tier: "free" | "pro" | "enterprise",
 *   status: "active" | "trial" | "past_due" | "cancelled",
 *   farm_cap: number,
 *   client_cap: number,
 *   features: { [key]: { enabled, quota_monthly, used_this_month } },
 *   expires_at: string | null
 * }
 */

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Fetch user plan
  const { data: plan, error: planError } = await admin
    .from("user_plans")
    .select("plan_tier, status, farm_cap, client_cap, expires_at")
    .eq("user_id", user.id)
    .eq("status", "active")
    .single();

  if (planError || !plan) {
    // No plan = free tier defaults
    return NextResponse.json({
      tier: "free",
      status: "active",
      farm_cap: 50,
      client_cap: 100,
      features: {},
      expires_at: null,
    });
  }

  // Fetch feature flags for this tier
  const { data: features } = await admin
    .from("plan_features")
    .select("feature_key, enabled, quota_monthly")
    .eq("plan_tier", plan.plan_tier);

  // Fetch this month's usage counts per feature
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const { data: usageCounts } = await admin.rpc("nocampo_usage_counts", {
    p_user_id: user.id,
    p_since: startOfMonth.toISOString(),
  });

  // Build feature map with usage
  const usageMap = new Map(
    (usageCounts || []).map((r: { feature_key: string; count: number }) => [r.feature_key, r.count])
  );

  const featureMap: Record<string, { enabled: boolean; quota_monthly: number | null; used_this_month: number }> = {};
  for (const f of features || []) {
    featureMap[f.feature_key] = {
      enabled: f.enabled,
      quota_monthly: f.quota_monthly,
      used_this_month: (usageMap.get(f.feature_key) as number) || 0,
    };
  }

  return NextResponse.json({
    tier: plan.plan_tier,
    status: plan.status,
    farm_cap: plan.farm_cap,
    client_cap: plan.client_cap,
    features: featureMap,
    expires_at: plan.expires_at,
  });
}
