/**
 * Phase 29 — /api/mailing/drafts/[id] CRUD.
 *
 * GET    → draft + joined template
 * PATCH  → update editable fields. Status='sent' is rejected here
 *          (use /api/mailing/drafts/[id]/send instead).
 * DELETE → hard-delete (mailing_log cascades per mig 083)
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { logActivity } from "@/lib/activity-log"
import type { MailingDraft, MailingDraftStatus } from "@/lib/mailing"

export const dynamic = "force-dynamic"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const PATCHABLE_FIELDS = [
  "subject_pt",
  "subject_en",
  "body_html_pt",
  "body_html_en",
  "culture_filter",
  "status",
  "template_id",
  "ai_draft_raw",
] as const

const ALLOWED_PATCH_STATUSES: MailingDraftStatus[] = [
  "draft",
  "reviewing",
  "approved",
  "archived",
  "failed",
]

function pickPatchable(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const k of PATCHABLE_FIELDS) {
    if (k in body) out[k] = body[k]
  }
  return out
}

interface RouteCtx {
  params: Promise<{ id: string }>
}

export async function GET(_req: NextRequest, ctx: RouteCtx) {
  const { id } = await ctx.params

  const { data, error } = await supabaseAdmin
    .from("mailing_drafts")
    .select(`
      *,
      template:mailing_templates ( id, slug, name_pt, name_en, subject_template_pt, subject_template_en, body_html, active )
    `)
    .eq("id", id)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ success: false, error: "not found" }, { status: 404 })
  }

  return NextResponse.json({ success: true, data })
}

export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  const { id } = await ctx.params
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const updates = pickPatchable(body)

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { success: false, error: "no editable fields in body" },
      { status: 400 },
    )
  }

  if ("status" in updates) {
    const newStatus = updates.status as string
    if (newStatus === "sent") {
      return NextResponse.json(
        { success: false, error: "cannot set status='sent' via PATCH; use /send" },
        { status: 400 },
      )
    }
    if (!ALLOWED_PATCH_STATUSES.includes(newStatus as MailingDraftStatus)) {
      return NextResponse.json(
        {
          success: false,
          error: `invalid status; allowed: ${ALLOWED_PATCH_STATUSES.join(", ")}`,
        },
        { status: 400 },
      )
    }
  }

  // Load current draft to detect status transitions for reviewer stamping
  const { data: existing, error: existErr } = await supabaseAdmin
    .from("mailing_drafts")
    .select("status, reviewer_uid, reviewed_at, persona, subject_pt")
    .eq("id", id)
    .maybeSingle()

  if (existErr) {
    return NextResponse.json({ success: false, error: existErr.message }, { status: 500 })
  }
  if (!existing) {
    return NextResponse.json({ success: false, error: "not found" }, { status: 404 })
  }

  const newStatus = (updates.status as MailingDraftStatus | undefined) ?? null
  const isPromotion =
    newStatus !== null &&
    existing.status === "draft" &&
    (newStatus === "reviewing" || newStatus === "approved")

  if (isPromotion) {
    const reviewerUid = req.headers.get("x-agrisafe-uid")
    if (reviewerUid) updates.reviewer_uid = reviewerUid
    updates.reviewed_at = new Date().toISOString()
  }

  const { data, error } = await supabaseAdmin
    .from("mailing_drafts")
    .update(updates)
    .eq("id", id)
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
    target_table: "mailing_drafts",
    target_id: id,
    source: "manual:mailing_draft_update",
    source_kind: "manual",
    summary: `Draft atualizado [${existing.status} → ${data.status}] · ${data.persona}`.slice(
      0,
      200,
    ),
    confidentiality: "agrisafe_confidential",
    metadata: {
      fields: Object.keys(updates),
      old_status: existing.status,
      new_status: data.status,
    },
  })

  return NextResponse.json({ success: true, data: data as MailingDraft })
}

export async function DELETE(_req: NextRequest, ctx: RouteCtx) {
  const { id } = await ctx.params

  const { data: existing } = await supabaseAdmin
    .from("mailing_drafts")
    .select("persona, subject_pt, status")
    .eq("id", id)
    .maybeSingle()

  const { error } = await supabaseAdmin.from("mailing_drafts").delete().eq("id", id)
  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  await logActivity(supabaseAdmin, {
    action: "delete",
    target_table: "mailing_drafts",
    target_id: id,
    source: "manual:mailing_draft_delete",
    source_kind: "manual",
    summary: `Draft removido${existing?.persona ? ` · ${existing.persona}` : ""}${
      existing?.subject_pt ? ` · ${existing.subject_pt}` : ""
    }`.slice(0, 200),
    confidentiality: "agrisafe_confidential",
    metadata: { status: existing?.status },
  })

  return NextResponse.json({ success: true, data: { id } })
}
