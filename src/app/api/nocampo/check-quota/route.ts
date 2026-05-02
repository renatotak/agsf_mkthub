import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";

/**
 * GET /api/nocampo/check-quota?feature=bureau_lookup
 *
 * Checks if the authenticated user can consume one unit of the given feature.
 * Returns { allowed, remaining, quota_monthly }.
 *
 * Does NOT consume — use POST /api/nocampo/usage-event to log consumption.
 * For bureau lookups, the bureau proxy route atomically checks + consumes.
 */

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const featureKey = request.nextUrl.searchParams.get("feature");
  if (!featureKey) {
    return NextResponse.json({ error: "Missing ?feature param" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Get user's tier
  const { data: plan } = await admin
    .from("user_plans")
    .select("plan_tier")
    .eq("user_id", user.id)
    .eq("status", "active")
    .single();

  const tier = plan?.plan_tier || "free";

  // Get feature config for this tier
  const { data: feature } = await admin
    .from("plan_features")
    .select("enabled, quota_monthly")
    .eq("plan_tier", tier)
    .eq("feature_key", featureKey)
    .single();

  if (!feature || !feature.enabled) {
    return NextResponse.json({
      allowed: false,
      remaining: 0,
      quota_monthly: 0,
      reason: "feature_disabled",
    });
  }

  // Unlimited quota
  if (feature.quota_monthly === null) {
    return NextResponse.json({
      allowed: true,
      remaining: null,
      quota_monthly: null,
    });
  }

  // Count this month's usage
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const { count } = await admin
    .from("usage_events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("feature_key", featureKey)
    .gte("consumed_at", startOfMonth.toISOString());

  const used = count || 0;
  const remaining = Math.max(0, feature.quota_monthly - used);

  return NextResponse.json({
    allowed: remaining > 0,
    remaining,
    quota_monthly: feature.quota_monthly,
  });
}
