import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { logActivity } from "@/lib/activity-log";
import { generateApiKey } from "@/lib/api-key-auth";

/**
 * /api/api-keys — CRUD for API key management (Phase 29: App Campo).
 *
 *   GET    /api/api-keys       — list all keys (key_hash omitted)
 *   POST   /api/api-keys       — generate new key, returns raw key once
 *   PATCH  /api/api-keys?id=X  — update name or active status
 *   DELETE /api/api-keys?id=X  — hard-delete key (access_logs FK → SET NULL)
 */

export const dynamic = "force-dynamic";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const EDITABLE_FIELDS = ["name", "active"] as const;

function pickEditable(body: any): Record<string, any> {
  const out: Record<string, any> = {};
  for (const k of EDITABLE_FIELDS) {
    if (k in body) out[k] = body[k];
  }
  return out;
}

// ─── GET ───────────────────────────────────────────────────────────────────

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("api_keys")
    .select("id, name, key_prefix, permissions, active, created_at, last_used_at, access_count, created_by")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ api_keys: data || [] });
}

// ─── POST ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const name = String(body.name || "").trim();
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const permissions = Array.isArray(body.permissions) ? body.permissions : ["events:read"];
  const { raw, hash, prefix } = generateApiKey();

  const { data, error } = await supabaseAdmin
    .from("api_keys")
    .insert({
      name,
      key_hash: hash,
      key_prefix: prefix,
      permissions,
      created_by: body.created_by || null,
    })
    .select("id, name, key_prefix, permissions, active, created_at, last_used_at, access_count, created_by")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logActivity(supabaseAdmin, {
    action: "insert",
    target_table: "api_keys",
    target_id: data?.id,
    source: "manual:api_key_create",
    source_kind: "manual",
    summary: `Chave de API criada: "${name}" (${prefix}…)`,
    metadata: { permissions },
  });

  return NextResponse.json({ api_key: data, raw_key: raw });
}

// ─── PATCH ─────────────────────────────────────────────────────────────────

export async function PATCH(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const updates = pickEditable(body);
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "no editable fields in body" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("api_keys")
    .update(updates)
    .eq("id", id)
    .select("id, name, key_prefix, permissions, active, created_at, last_used_at, access_count, created_by")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });

  await logActivity(supabaseAdmin, {
    action: "update",
    target_table: "api_keys",
    target_id: id,
    source: "manual:api_key_update",
    source_kind: "manual",
    summary: `Chave "${data.name}" (${data.key_prefix}…) atualizada — campos: ${Object.keys(updates).join(", ")}`,
    metadata: { fields: Object.keys(updates) },
  });

  return NextResponse.json({ api_key: data });
}

// ─── DELETE ────────────────────────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { data: existing } = await supabaseAdmin
    .from("api_keys")
    .select("name, key_prefix")
    .eq("id", id)
    .maybeSingle();

  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { error } = await supabaseAdmin.from("api_keys").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logActivity(supabaseAdmin, {
    action: "delete",
    target_table: "api_keys",
    target_id: id,
    source: "manual:api_key_revoke",
    source_kind: "manual",
    summary: `Chave revogada: "${existing.name}" (${existing.key_prefix}…)`,
    metadata: {},
  });

  return NextResponse.json({ ok: true });
}
