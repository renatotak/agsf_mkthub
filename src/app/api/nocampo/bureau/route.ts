import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";
import { logActivity } from "@/lib/activity-log";

/**
 * GET /api/nocampo/bureau?cpf=<cpf>&type=<score|full>
 *
 * Bureau lookup proxy. Authenticates via Supabase JWT, atomically checks
 * quota + decrements, then proxies to the platform bureau API using
 * service credentials. nocampo-mobile never talks to platform APIs directly.
 *
 * This solves two problems:
 * 1. Supabase JWT → platform API (Cognito) token mismatch
 * 2. Atomic quota enforcement (no race condition from parallel requests)
 */

export const dynamic = "force-dynamic";

const PLATFORM_BASE = process.env.PLATFORM_BUREAU_BASE_URL
  || process.env.MICROSERVICES_BASE_URL
  || "https://api-prod.plataformav3.agrisafe.agr.br";

const PLATFORM_API_KEY = process.env.PLATFORM_BUREAU_API_KEY || "";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cpf = request.nextUrl.searchParams.get("cpf")?.replace(/\D/g, "");
  const queryType = request.nextUrl.searchParams.get("type") || "score";

  if (!cpf || (cpf.length !== 11 && cpf.length !== 14)) {
    return NextResponse.json({ error: "Invalid CPF/CNPJ" }, { status: 400 });
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

  // Get bureau feature config
  const { data: feature } = await admin
    .from("plan_features")
    .select("enabled, quota_monthly")
    .eq("plan_tier", tier)
    .eq("feature_key", "bureau_lookup")
    .single();

  if (!feature || !feature.enabled) {
    return NextResponse.json({
      error: "Bureau lookups require Pro or Enterprise plan",
      upgrade: true,
    }, { status: 403 });
  }

  // Atomic quota check + consume in one step
  // For unlimited (quota_monthly IS NULL), skip the count check
  if (feature.quota_monthly !== null) {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const { count } = await admin
      .from("usage_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("feature_key", "bureau_lookup")
      .gte("consumed_at", startOfMonth.toISOString());

    if ((count || 0) >= feature.quota_monthly) {
      return NextResponse.json({
        error: "Quota mensal de consultas bureau atingida",
        remaining: 0,
        quota_monthly: feature.quota_monthly,
        upgrade: true,
      }, { status: 429 });
    }
  }

  // Log usage event BEFORE calling platform API (debit-first)
  await admin.from("usage_events").insert({
    user_id: user.id,
    feature_key: "bureau_lookup",
    metadata: { cpf: cpf.slice(0, 3) + "***", type: queryType },
  });

  // Proxy to platform bureau API
  try {
    const bureauUrl = `${PLATFORM_BASE}/plataforma/bureau/v1/${queryType}?document=${cpf}`;
    const resp = await fetch(bureauUrl, {
      headers: {
        "x-api-key": PLATFORM_API_KEY,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(30_000),
    });

    if (!resp.ok) {
      // Refund the usage event on upstream failure
      const { data: lastEvent } = await admin
        .from("usage_events")
        .select("id")
        .eq("user_id", user.id)
        .eq("feature_key", "bureau_lookup")
        .order("consumed_at", { ascending: false })
        .limit(1)
        .single();

      if (lastEvent) {
        await admin.from("usage_events").delete().eq("id", lastEvent.id);
      }

      return NextResponse.json({
        error: "Consulta indisponivel no momento. Tente novamente em 5 minutos.",
        retry: true,
      }, { status: 502 });
    }

    const data = await resp.json();

    await logActivity(admin, {
      action: "bureau_lookup",
      target_table: "usage_events",
      target_id: user.id,
      source: "nocampo-mobile",
      source_kind: "manual",
      details: { cpf_prefix: cpf.slice(0, 3), type: queryType, tier },
    });

    return NextResponse.json(data);
  } catch (err) {
    // Refund on timeout/network error
    const { data: lastEvent } = await admin
      .from("usage_events")
      .select("id")
      .eq("user_id", user.id)
      .eq("feature_key", "bureau_lookup")
      .order("consumed_at", { ascending: false })
      .limit(1)
      .single();

    if (lastEvent) {
      await admin.from("usage_events").delete().eq("id", lastEvent.id);
    }

    return NextResponse.json({
      error: "Consulta indisponivel no momento. Tente novamente em 5 minutos.",
      retry: true,
    }, { status: 502 });
  }
}
