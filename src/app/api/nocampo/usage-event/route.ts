import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";

/**
 * POST /api/nocampo/usage-event
 *
 * Atomically check quota + log a usage event. Returns { allowed, remaining }.
 * If quota exceeded, the event is NOT logged and { allowed: false } is returned.
 *
 * Body: { feature_key: string, metadata?: object }
 */

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { feature_key?: string; metadata?: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const featureKey = body.feature_key;
  if (!featureKey) {
    return NextResponse.json({ error: "Missing feature_key" }, { status: 400 });
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

  // Get feature config
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
      reason: "feature_disabled",
    }, { status: 403 });
  }

  // Unlimited — just log it
  if (feature.quota_monthly === null) {
    await admin.from("usage_events").insert({
      user_id: user.id,
      feature_key: featureKey,
      metadata: body.metadata || {},
    });
    return NextResponse.json({ allowed: true, remaining: null });
  }

  // Quota-limited — atomic check + insert
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

  if (used >= feature.quota_monthly) {
    return NextResponse.json({
      allowed: false,
      remaining: 0,
      reason: "quota_exceeded",
    }, { status: 429 });
  }

  // Log the event
  await admin.from("usage_events").insert({
    user_id: user.id,
    feature_key: featureKey,
    metadata: body.metadata || {},
  });

  return NextResponse.json({
    allowed: true,
    remaining: feature.quota_monthly - used - 1,
  });
}
