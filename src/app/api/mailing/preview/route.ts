/**
 * Phase 29 — /api/mailing/preview.
 *
 * POST { draft_id, sample_client_id? }
 *   → { subject, html } — renders the draft against the template
 *     using either a real client's personalization vars or sensible
 *     placeholders. No send.
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { renderTemplate } from "@/lib/mailing"

export const dynamic = "force-dynamic"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    draft_id?: string
    sample_client_id?: string
  }
  const draftId = body.draft_id
  if (!draftId) {
    return NextResponse.json({ success: false, error: "draft_id required" }, { status: 400 })
  }

  const { data: draft, error: dErr } = await supabaseAdmin
    .from("mailing_drafts")
    .select("id, persona, subject_pt, body_html_pt, template_id")
    .eq("id", draftId)
    .maybeSingle()

  if (dErr) {
    return NextResponse.json({ success: false, error: dErr.message }, { status: 500 })
  }
  if (!draft) {
    return NextResponse.json({ success: false, error: "draft not found" }, { status: 404 })
  }

  const { data: template, error: tErr } = await supabaseAdmin
    .from("mailing_templates")
    .select("body_html")
    .eq("id", draft.template_id)
    .maybeSingle()

  if (tErr) {
    return NextResponse.json({ success: false, error: tErr.message }, { status: 500 })
  }
  if (!template) {
    return NextResponse.json({ success: false, error: "template not found" }, { status: 404 })
  }

  // Optional sample client for personalization
  let recipientName = "Cliente AgriSafe"
  let recipientEmail = "exemplo@cliente.com.br"
  let clientId = "preview-sample"

  if (body.sample_client_id) {
    const { data: client } = await supabaseAdmin
      .from("mailing_clients")
      .select("id, full_name, email")
      .eq("id", body.sample_client_id)
      .maybeSingle()
    if (client) {
      clientId = client.id
      recipientName = client.full_name
      recipientEmail = client.email
    }
  }

  const vars = {
    recipient_name: recipientName,
    recipient_email: recipientEmail,
    persona: draft.persona,
    date_pt: new Date().toLocaleDateString("pt-BR"),
    date_en: new Date().toLocaleDateString("en-US"),
    subject: draft.subject_pt,
    body: draft.body_html_pt,
    unsubscribe_url: `https://agsf-mkthub.vercel.app/api/mailing/unsubscribe?cid=${clientId}`,
  }

  const subject = renderTemplate(draft.subject_pt, vars)
  const html = renderTemplate(template.body_html, vars)

  return NextResponse.json({ success: true, data: { subject, html } })
}
