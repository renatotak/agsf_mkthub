import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";
import { logActivity } from "@/lib/activity-log";

/**
 * POST /api/admin/users — Admin-only user creation for noCampo
 *
 * Creates a Supabase auth user + assigns a plan tier.
 * Only authenticated admin users (checked via Supabase session) can call this.
 *
 * Body: {
 *   email: string,
 *   password: string,
 *   plan_tier?: "free" | "pro" | "enterprise",  // default: "free"
 *   farm_cap?: number,      // override default cap
 *   client_cap?: number,    // override default cap
 *   company_id?: string,    // UUID for enterprise accounts
 * }
 *
 * PATCH /api/admin/users — Update plan tier for existing user
 *
 * Body: {
 *   user_id: string,
 *   plan_tier?: string,
 *   status?: string,
 *   farm_cap?: number,
 *   client_cap?: number,
 * }
 */

export const dynamic = "force-dynamic";

const TIER_DEFAULTS: Record<string, { farm_cap: number; client_cap: number }> = {
  free: { farm_cap: 50, client_cap: 100 },
  pro: { farm_cap: 500, client_cap: 1000 },
  enterprise: { farm_cap: 999999, client_cap: 999999 },
};

// Admin emails allowed to manage users. Add via env or hardcode for now.
const ADMIN_EMAILS = (process.env.NOCAMPO_ADMIN_EMAILS || "renato.takamura@agrisafe.agr.br").split(",").map(e => e.trim().toLowerCase());

function isAdmin(email: string | undefined): boolean {
  return !!email && ADMIN_EMAILS.includes(email.toLowerCase());
}

export async function POST(request: NextRequest) {
  // Verify admin session — must be an authenticated user AND in the admin list
  const supabase = await createClient();
  const { data: { user: adminUser }, error: authError } = await supabase.auth.getUser();
  if (authError || !adminUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdmin(adminUser.email)) {
    return NextResponse.json({ error: "Forbidden — admin access required" }, { status: 403 });
  }

  let body: {
    email?: string;
    password?: string;
    plan_tier?: string;
    farm_cap?: number;
    client_cap?: number;
    company_id?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.email || !body.password) {
    return NextResponse.json({ error: "email and password required" }, { status: 400 });
  }

  const tier = body.plan_tier || "free";
  if (!["free", "pro", "enterprise"].includes(tier)) {
    return NextResponse.json({ error: "Invalid plan_tier" }, { status: 400 });
  }

  const defaults = TIER_DEFAULTS[tier];
  const admin = createAdminClient();

  // Create auth user
  const { data: newUser, error: createError } = await admin.auth.admin.createUser({
    email: body.email,
    password: body.password,
    email_confirm: true,
  });

  if (createError) {
    return NextResponse.json({ error: createError.message }, { status: 400 });
  }

  // Create plan record
  const { error: planError } = await admin.from("user_plans").insert({
    user_id: newUser.user.id,
    plan_tier: tier,
    farm_cap: body.farm_cap ?? defaults.farm_cap,
    client_cap: body.client_cap ?? defaults.client_cap,
    company_id: body.company_id || null,
    created_by: adminUser.id,
  });

  if (planError) {
    return NextResponse.json({ error: planError.message }, { status: 500 });
  }

  await logActivity(admin, {
    action: "insert",
    target_table: "user_plans",
    target_id: newUser.user.id,
    source: "admin-users",
    source_kind: "manual",
    summary: `Admin created noCampo user: ${body.email} (${tier})`,
    metadata: { email: body.email, tier, farm_cap: body.farm_cap ?? defaults.farm_cap },
  });

  return NextResponse.json({
    success: true,
    user_id: newUser.user.id,
    email: body.email,
    plan_tier: tier,
  }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user: adminUser }, error: authError } = await supabase.auth.getUser();
  if (authError || !adminUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdmin(adminUser.email)) {
    return NextResponse.json({ error: "Forbidden — admin access required" }, { status: 403 });
  }

  let body: {
    user_id?: string;
    plan_tier?: string;
    status?: string;
    farm_cap?: number;
    client_cap?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.user_id) {
    return NextResponse.json({ error: "user_id required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const updates: Record<string, unknown> = {};
  if (body.plan_tier) updates.plan_tier = body.plan_tier;
  if (body.status) updates.status = body.status;
  if (body.farm_cap !== undefined) updates.farm_cap = body.farm_cap;
  if (body.client_cap !== undefined) updates.client_cap = body.client_cap;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const { error } = await admin
    .from("user_plans")
    .update(updates)
    .eq("user_id", body.user_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logActivity(admin, {
    action: "update",
    target_table: "user_plans",
    target_id: body.user_id,
    source: "admin-users",
    source_kind: "manual",
    summary: `Admin updated plan for user ${body.user_id}`,
    metadata: updates,
  });

  return NextResponse.json({ success: true, updated: updates });
}
