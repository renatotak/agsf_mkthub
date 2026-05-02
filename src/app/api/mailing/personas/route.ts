/**
 * Phase 30 — /api/mailing/personas CRUD.
 *
 * Personas are the job-roles that mailing recipients are tagged with.
 * Each persona carries an editable AI prompt (system_prompt_pt/en) that
 * the briefing pipeline uses when generating per-persona drafts.
 *
 * GET    ?active=true|false             → list, ordered by position asc
 * POST                                  → create new persona
 * PATCH  ?id=<uuid>  OR  ?slug=<slug>   → update fields
 * DELETE ?id=<uuid>  OR  ?slug=<slug>   → soft-delete (active=false)
 *
 * Built-in personas (is_builtin=true) cannot be hard-deleted; they can
 * only be deactivated. This protects the slugs the briefing cron expects.
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { logActivity } from "@/lib/activity-log"

export const dynamic = "force-dynamic"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const SLUG_RE = /^[a-z][a-z0-9_]*$/

const EDITABLE_FIELDS = [
  "name_pt",
  "name_en",
  "description_pt",
  "description_en",
  "system_prompt_pt",
  "system_prompt_en",
  "content_focus",
  "default_culture_filter",
  "position",
  "active",
] as const

function pickEditable(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const k of EDITABLE_FIELDS) {
    if (k in body) out[k] = body[k]
  }
  return out
}

function targetSelector(req: NextRequest): { kind: "id" | "slug"; value: string } | null {
  const id = req.nextUrl.searchParams.get("id")
  const slug = req.nextUrl.searchParams.get("slug")
  if (id) return { kind: "id", value: id }
  if (slug) return { kind: "slug", value: slug }
  return null
}

// ─── GET ──────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const activeParam = req.nextUrl.searchParams.get("active")

  let query = supabaseAdmin
    .from("mailing_personas")
    .select("*")
    .order("position", { ascending: true })
    .order("name_pt", { ascending: true })

  if (activeParam === "true") query = query.eq("active", true)
  if (activeParam === "false") query = query.eq("active", false)

  const { data, error } = await query
  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
  return NextResponse.json({ success: true, data: data ?? [] })
}

// ─── POST (create) ────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>

  const slug = typeof body.slug === "string" ? body.slug.trim().toLowerCase() : ""
  if (!slug || !SLUG_RE.test(slug)) {
    return NextResponse.json(
      { success: false, error: "slug must be lowercase ASCII, snake_case, starting with a letter" },
      { status: 400 },
    )
  }

  const namePt = typeof body.name_pt === "string" ? body.name_pt.trim() : ""
  const nameEn = typeof body.name_en === "string" ? body.name_en.trim() : ""
  if (!namePt || !nameEn) {
    return NextResponse.json(
      { success: false, error: "name_pt and name_en are required" },
      { status: 400 },
    )
  }

  const insertRow: Record<string, unknown> = {
    slug,
    name_pt: namePt,
    name_en: nameEn,
    description_pt: typeof body.description_pt === "string" ? body.description_pt : null,
    description_en: typeof body.description_en === "string" ? body.description_en : null,
    system_prompt_pt: typeof body.system_prompt_pt === "string" ? body.system_prompt_pt : null,
    system_prompt_en: typeof body.system_prompt_en === "string" ? body.system_prompt_en : null,
    content_focus: Array.isArray(body.content_focus)
      ? (body.content_focus as unknown[]).filter((c): c is string => typeof c === "string")
      : [],
    default_culture_filter: Array.isArray(body.default_culture_filter)
      ? (body.default_culture_filter as unknown[]).filter((c): c is string => typeof c === "string")
      : [],
    position: typeof body.position === "number" ? body.position : 100,
    active: typeof body.active === "boolean" ? body.active : true,
    is_builtin: false, // user-created personas are never built-in
  }

  const { data, error } = await supabaseAdmin
    .from("mailing_personas")
    .insert(insertRow)
    .select()
    .single()

  if (error || !data) {
    return NextResponse.json(
      { success: false, error: error?.message ?? "insert failed" },
      { status: 500 },
    )
  }

  await logActivity(supabaseAdmin, {
    action: "insert",
    target_table: "mailing_personas",
    target_id: data.id,
    source: "manual:mailing_persona_create",
    source_kind: "manual",
    summary: `Persona criada · ${slug}`,
    confidentiality: "agrisafe_confidential",
    metadata: { slug, name_pt: namePt, name_en: nameEn },
  })

  return NextResponse.json({ success: true, data })
}

// ─── PATCH (update) ───────────────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  const sel = targetSelector(req)
  if (!sel) {
    return NextResponse.json({ success: false, error: "id or slug required" }, { status: 400 })
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const updates = pickEditable(body)

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ success: false, error: "no editable fields in body" }, { status: 400 })
  }

  if ("content_focus" in updates && !Array.isArray(updates.content_focus)) {
    return NextResponse.json({ success: false, error: "content_focus must be an array" }, { status: 400 })
  }
  if ("default_culture_filter" in updates && !Array.isArray(updates.default_culture_filter)) {
    return NextResponse.json({ success: false, error: "default_culture_filter must be an array" }, { status: 400 })
  }
  if ("name_pt" in updates && (typeof updates.name_pt !== "string" || !updates.name_pt.trim())) {
    return NextResponse.json({ success: false, error: "name_pt must be a non-empty string" }, { status: 400 })
  }
  if ("name_en" in updates && (typeof updates.name_en !== "string" || !updates.name_en.trim())) {
    return NextResponse.json({ success: false, error: "name_en must be a non-empty string" }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from("mailing_personas")
    .update(updates)
    .eq(sel.kind, sel.value)
    .select()
    .maybeSingle()

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ success: false, error: "not found" }, { status: 404 })
  }

  await logActivity(supabaseAdmin, {
    action: "update",
    target_table: "mailing_personas",
    target_id: data.id,
    source: "manual:mailing_persona_update",
    source_kind: "manual",
    summary: `Persona atualizada · ${data.slug}`,
    confidentiality: "agrisafe_confidential",
    metadata: { fields: Object.keys(updates) },
  })

  return NextResponse.json({ success: true, data })
}

// ─── DELETE (soft) ────────────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const sel = targetSelector(req)
  if (!sel) {
    return NextResponse.json({ success: false, error: "id or slug required" }, { status: 400 })
  }

  // Look up first so we can preserve is_builtin invariants and report the slug.
  const { data: existing, error: lookupErr } = await supabaseAdmin
    .from("mailing_personas")
    .select("id, slug, is_builtin")
    .eq(sel.kind, sel.value)
    .maybeSingle()

  if (lookupErr) {
    return NextResponse.json({ success: false, error: lookupErr.message }, { status: 500 })
  }
  if (!existing) {
    return NextResponse.json({ success: false, error: "not found" }, { status: 404 })
  }

  // Soft-delete only. Built-in personas are NEVER hard-deleted because the
  // briefing cron expects their slugs to exist.
  const { data, error } = await supabaseAdmin
    .from("mailing_personas")
    .update({ active: false })
    .eq("id", existing.id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  await logActivity(supabaseAdmin, {
    action: "update",
    target_table: "mailing_personas",
    target_id: existing.id,
    source: "manual:mailing_persona_delete",
    source_kind: "manual",
    summary: `Persona desativada · ${existing.slug}`,
    confidentiality: "agrisafe_confidential",
    metadata: { soft_delete: true, is_builtin: existing.is_builtin },
  })

  return NextResponse.json({ success: true, data })
}
