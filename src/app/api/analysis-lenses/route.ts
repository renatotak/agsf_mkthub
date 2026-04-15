import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { logActivity } from "@/lib/activity-log";

/**
 * /api/analysis-lenses — read/write the analysis lens registry (Phase 24B).
 *
 * Backs the Settings → Editable Prompts panel. Lenses control the search
 * query template + OpenAI system prompt that /api/company-research uses,
 * keyed by `analysis_type`. The retailer / industry / generic lenses are
 * seeded by migration 036 with `is_builtin=true`; users can edit those in
 * place but the UI prevents deletion. New lenses can be added freely.
 *
 *   GET    /api/analysis-lenses       — list all (no auth, public read)
 *   GET    /api/analysis-lenses?id=X  — single lens
 *   PATCH  /api/analysis-lenses?id=X  — update prompt fields (service-role)
 *   POST   /api/analysis-lenses       — create new (service-role)
 *   DELETE /api/analysis-lenses?id=X  — delete (service-role; rejects builtins)
 *
 * Service-role gating is enforced via the SUPABASE_SERVICE_ROLE_KEY client
 * — only the server-side route handler talks to Supabase, so the browser
 * never sees the key. We do not require auth on top of that yet because
 * Settings is already a privileged page (single-user app). Add bearer-token
 * checks here when multi-user RBAC lands.
 */

export const dynamic = "force-dynamic";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const EDITABLE_FIELDS = [
  "label_pt",
  "label_en",
  "description",
  "search_template",
  "system_prompt",
  "model",
  "temperature",
  "max_tokens",
  "enabled",
] as const;

function pickEditable(body: any): Record<string, any> {
  const out: Record<string, any> = {};
  for (const k of EDITABLE_FIELDS) {
    if (k in body) out[k] = body[k];
  }
  return out;
}

// ─── GET ───────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");

  if (id) {
    const { data, error } = await supabaseAdmin
      .from("analysis_lenses")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ lens: data });
  }

  const { data, error } = await supabaseAdmin
    .from("analysis_lenses")
    .select("*")
    .order("is_builtin", { ascending: false })
    .order("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ lenses: data || [] });
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
    .from("analysis_lenses")
    .update(updates)
    .eq("id", id)
    .select()
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Phase 24G2 — activity feed (fail-soft)
  await logActivity(supabaseAdmin, {
    action: "update",
    target_table: "analysis_lenses",
    target_id: id,
    source: "manual:analysis_lens_edit",
    source_kind: "manual",
    summary: `Lente "${data.label_pt || id}" atualizada — campos: ${Object.keys(updates).join(", ")}`,
    metadata: { fields: Object.keys(updates), is_builtin: data.is_builtin },
  });

  return NextResponse.json({ lens: data });
}

// ─── POST ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const id = String(body.id || "").trim().toLowerCase();
  if (!id || !/^[a-z0-9_-]+$/.test(id)) {
    return NextResponse.json({ error: "id must be lowercase alphanumeric (a-z0-9_-)" }, { status: 400 });
  }
  if (!body.label_pt || !body.search_template || !body.system_prompt) {
    return NextResponse.json(
      { error: "label_pt, search_template, system_prompt are required" },
      { status: 400 },
    );
  }

  const kind = body.kind === "viewer" ? "viewer" : "task";

  const row = {
    id,
    label_pt: body.label_pt,
    label_en: body.label_en || null,
    description: body.description || null,
    search_template: body.search_template,
    system_prompt: body.system_prompt,
    model: body.model || "gpt-4o-mini",
    temperature: body.temperature ?? 0.3,
    max_tokens: body.max_tokens ?? 400,
    enabled: body.enabled ?? true,
    is_builtin: false,
    kind,
  };

  const { data, error } = await supabaseAdmin
    .from("analysis_lenses")
    .insert(row)
    .select()
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Phase 24G2 — activity feed (fail-soft)
  await logActivity(supabaseAdmin, {
    action: "insert",
    target_table: "analysis_lenses",
    target_id: id,
    source: "manual:analysis_lens_create",
    source_kind: "manual",
    summary: `Lente nova criada: "${row.label_pt}" (${id})`,
    metadata: { model: row.model, temperature: row.temperature, max_tokens: row.max_tokens },
  });

  return NextResponse.json({ lens: data });
}

// ─── DELETE ────────────────────────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  // Refuse to delete builtins — Settings UI also greys out the delete
  // button for them, but enforce on the server too.
  const { data: existing } = await supabaseAdmin
    .from("analysis_lenses")
    .select("is_builtin")
    .eq("id", id)
    .maybeSingle();

  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (existing.is_builtin) {
    return NextResponse.json({ error: "cannot delete a builtin lens" }, { status: 403 });
  }

  const { error } = await supabaseAdmin.from("analysis_lenses").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Phase 24G2 — activity feed (fail-soft)
  await logActivity(supabaseAdmin, {
    action: "delete",
    target_table: "analysis_lenses",
    target_id: id,
    source: "manual:analysis_lens_delete",
    source_kind: "manual",
    summary: `Lente "${id}" removida`,
    metadata: {},
  });

  return NextResponse.json({ ok: true });
}
