/**
 * Phase 29 — /api/mailing/drafts CRUD.
 *
 * GET    ?status=...&persona=...&briefing_id=...&limit=50&offset=0
 *          → paginated list with total count
 * POST                          → create draft (manual or from-briefing modes)
 *
 * Per-draft GET/PATCH/DELETE live in ./[id]/route.ts.
 * Send action lives in ./[id]/send/route.ts.
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { logActivity } from "@/lib/activity-log"
import {
  createDraftFromBriefing,
  type MailingDraft,
  type MailingDraftStatus,
  type MailingPersona,
} from "@/lib/mailing"

export const dynamic = "force-dynamic"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const PERSONAS: MailingPersona[] = ["ceo", "intel", "marketing", "credit"]
const STATUSES: MailingDraftStatus[] = [
  "draft",
  "reviewing",
  "approved",
  "sent",
  "archived",
  "failed",
]

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const status = sp.get("status")
  const persona = sp.get("persona")
  const briefingId = sp.get("briefing_id")
  const limit = Math.min(Number(sp.get("limit") ?? DEFAULT_LIMIT) || DEFAULT_LIMIT, MAX_LIMIT)
  const offset = Math.max(Number(sp.get("offset") ?? 0) || 0, 0)

  let query = supabaseAdmin
    .from("mailing_drafts")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1)

  if (status && STATUSES.includes(status as MailingDraftStatus)) {
    query = query.eq("status", status)
  }
  if (persona && PERSONAS.includes(persona as MailingPersona)) {
    query = query.eq("persona", persona)
  }
  if (briefingId) {
    query = query.eq("briefing_id", briefingId)
  }

  const { data, error, count } = await query
  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    data: (data ?? []) as MailingDraft[],
    total: count ?? 0,
  })
}

async function resolveLatestActiveTemplateId(slug = "briefing-diario-v1"): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("mailing_templates")
    .select("id")
    .eq("slug", slug)
    .eq("active", true)
    .maybeSingle()
  if (data?.id) return data.id

  // Fallback — any active template, newest first
  const { data: any2 } = await supabaseAdmin
    .from("mailing_templates")
    .select("id")
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  return any2?.id ?? null
}

async function resolveLatestBriefingId(): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("executive_briefings")
    .select("id")
    .order("briefing_date", { ascending: false })
    .limit(1)
    .maybeSingle()
  return data?.id ?? null
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const persona = body.persona as MailingPersona | undefined

  if (!persona || !PERSONAS.includes(persona)) {
    return NextResponse.json(
      { success: false, error: `persona must be one of ${PERSONAS.join(", ")}` },
      { status: 400 },
    )
  }

  const cultureFilter = Array.isArray(body.culture_filter)
    ? (body.culture_filter as unknown[]).filter((c): c is string => typeof c === "string")
    : []

  // ── Mode A: From briefing (subject/body cloned from the briefing payload)
  const isFromBriefing =
    typeof body.briefing_id === "string" &&
    typeof body.body_html_pt !== "string" &&
    typeof body.subject_pt !== "string"

  if (isFromBriefing) {
    const briefingId = body.briefing_id as string

    const { data: briefing, error: bErr } = await supabaseAdmin
      .from("executive_briefings")
      .select("id, briefing_date, theme, executive_summary")
      .eq("id", briefingId)
      .maybeSingle()

    if (bErr || !briefing) {
      return NextResponse.json(
        { success: false, error: bErr?.message ?? "briefing not found" },
        { status: 404 },
      )
    }

    let templateId =
      typeof body.template_id === "string" ? body.template_id : await resolveLatestActiveTemplateId()
    if (!templateId) {
      return NextResponse.json(
        { success: false, error: "no active template found (seed mig 083)" },
        { status: 500 },
      )
    }

    const summary: string = (briefing as { executive_summary?: string }).executive_summary || ""
    const date = (briefing as { briefing_date?: string }).briefing_date || ""

    const subjectPt = `AgriSafe — Briefing Executivo ${date}`
    // Wrap summary in a basic <p>-per-paragraph block. No LLM.
    const bodyHtmlPt = summary
      .split(/\n\s*\n/)
      .map((p) => `<p>${p.trim().replace(/\n/g, "<br>")}</p>`)
      .join("\n")

    const created = await createDraftFromBriefing(supabaseAdmin, {
      briefing_id: briefingId,
      template_id: templateId,
      persona,
      culture_filter: cultureFilter,
      subject_pt: subjectPt,
      body_html_pt: bodyHtmlPt,
    })

    const { data: draft } = await supabaseAdmin
      .from("mailing_drafts")
      .select("*")
      .eq("id", created.id)
      .single()

    return NextResponse.json({ success: true, data: draft as MailingDraft })
  }

  // ── Mode B: Manual insert
  const subjectPt = typeof body.subject_pt === "string" ? body.subject_pt : ""
  const bodyHtmlPt = typeof body.body_html_pt === "string" ? body.body_html_pt : ""
  const subjectEn = typeof body.subject_en === "string" ? body.subject_en : null
  const bodyHtmlEn = typeof body.body_html_en === "string" ? body.body_html_en : null
  const templateIdRaw = typeof body.template_id === "string" ? body.template_id : null

  if (!subjectPt) {
    return NextResponse.json({ success: false, error: "subject_pt required" }, { status: 400 })
  }
  if (!bodyHtmlPt) {
    return NextResponse.json({ success: false, error: "body_html_pt required" }, { status: 400 })
  }

  const templateId = templateIdRaw ?? (await resolveLatestActiveTemplateId())
  if (!templateId) {
    return NextResponse.json(
      { success: false, error: "no active template found and template_id not supplied" },
      { status: 400 },
    )
  }

  let briefingId: string | null =
    typeof body.briefing_id === "string" ? body.briefing_id : await resolveLatestBriefingId()
  if (!briefingId) {
    return NextResponse.json(
      { success: false, error: "no briefing available — seed executive_briefings first" },
      { status: 400 },
    )
  }

  const insertRow = {
    briefing_id: briefingId,
    template_id: templateId,
    persona,
    culture_filter: cultureFilter,
    status: "draft" as MailingDraftStatus,
    subject_pt: subjectPt,
    subject_en: subjectEn,
    body_html_pt: bodyHtmlPt,
    body_html_en: bodyHtmlEn,
  }

  const { data, error } = await supabaseAdmin
    .from("mailing_drafts")
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
    target_table: "mailing_drafts",
    target_id: data.id,
    source: "manual:mailing_draft",
    source_kind: "manual",
    summary: `Draft criado · ${persona} · ${subjectPt}`.slice(0, 200),
    confidentiality: "agrisafe_confidential",
    metadata: {
      persona,
      culture_filter: cultureFilter,
      briefing_id: briefingId,
      mode: "manual",
    },
  })

  return NextResponse.json({ success: true, data: data as MailingDraft })
}
