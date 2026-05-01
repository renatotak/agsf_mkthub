/**
 * Phase 29 — Mailing workflow library.
 *
 * Reads from the schema in mig 083 (mailing_clients, mailing_client_cultures,
 * mailing_templates, mailing_drafts, mailing_log). Wraps Resend for delivery
 * and provides a fan-out helper that:
 *   1. Loads an approved draft + its template + the matching clients
 *   2. Renders the template with per-recipient personalization
 *   3. Sends via Resend
 *   4. Logs every send into mailing_log and the activity feed
 *
 * Algorithm-first per CLAUDE.md guardrail #1: handlebars-style {{var}}
 * replacement, no LLM calls anywhere in this file. AI drafting lives in
 * a separate cron / endpoint layer.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { Resend } from "resend"
import { logActivity } from "./activity-log"

// ──────────────────────────────────────────────────────────────────────────
// Types — mirror the mig-083 schema
// ──────────────────────────────────────────────────────────────────────────

export type MailingPersona = "ceo" | "intel" | "marketing" | "credit"

export type MailingChannel = "email" | "app_campo" | "agrisafe_app" | "whatsapp"

export type MailingDraftStatus =
  | "draft"
  | "reviewing"
  | "approved"
  | "sent"
  | "archived"
  | "failed"

export type MailingLogStatus =
  | "queued"
  | "sent"
  | "delivered"
  | "opened"
  | "clicked"
  | "bounced"
  | "failed"

export interface MailingClient {
  id: string
  entity_uid: string | null
  full_name: string
  email: string
  persona: MailingPersona
  phone: string | null
  notes: string | null
  active: boolean
  confidentiality: string
  created_at: string
  updated_at: string
}

export interface MailingClientWithCultures extends MailingClient {
  cultures: string[]
}

export interface MailingTemplate {
  id: string
  slug: string
  name_pt: string
  name_en: string
  subject_template_pt: string
  subject_template_en: string
  body_html: string
  body_mjml: string | null
  active: boolean
}

export interface MailingDraft {
  id: string
  briefing_id: string
  template_id: string
  persona: MailingPersona
  culture_filter: string[]
  status: MailingDraftStatus
  subject_pt: string
  subject_en: string | null
  body_html_pt: string
  body_html_en: string | null
  ai_draft_raw: Record<string, unknown> | null
  reviewer_uid: string | null
  reviewed_at: string | null
  sent_at: string | null
  recipient_count: number | null
  confidentiality: string
  created_at: string
  updated_at: string
}

// ──────────────────────────────────────────────────────────────────────────
// Resend client
// ──────────────────────────────────────────────────────────────────────────

let _resend: Resend | null = null

export function getResendClient(): Resend {
  if (_resend) return _resend
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    throw new Error("RESEND_API_KEY env var is missing — cannot send email")
  }
  _resend = new Resend(apiKey)
  return _resend
}

export function getFromAddress(): string {
  const email = process.env.RESEND_FROM_EMAIL || "briefing@agrisafe.agr.br"
  const name = process.env.RESEND_FROM_NAME || "AgriSafe Inteligência"
  return `${name} <${email}>`
}

export function getReplyToAddress(): string | undefined {
  return process.env.RESEND_REPLY_TO || undefined
}

// ──────────────────────────────────────────────────────────────────────────
// Template rendering — handlebars-style {{var}} replacement
// ──────────────────────────────────────────────────────────────────────────

const RENDER_VAR_RE = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g

/**
 * Replace {{var.path}} placeholders with values from `vars`.
 * Unknown vars become empty strings (no error — tolerant by design).
 * HTML in values is NOT escaped — caller is responsible for sanitization.
 */
export function renderTemplate(template: string, vars: Record<string, unknown>): string {
  return template.replace(RENDER_VAR_RE, (_match, path: string) => {
    const segments = path.split(".")
    let v: unknown = vars
    for (const seg of segments) {
      if (v && typeof v === "object" && seg in (v as Record<string, unknown>)) {
        v = (v as Record<string, unknown>)[seg]
      } else {
        return ""
      }
    }
    return v == null ? "" : String(v)
  })
}

// ──────────────────────────────────────────────────────────────────────────
// Fan-out — load draft, find clients, render, send, log
// ──────────────────────────────────────────────────────────────────────────

export interface SendDraftResult {
  draft_id: string
  status: "sent" | "partial" | "failed"
  recipients_total: number
  recipients_sent: number
  recipients_failed: number
  errors: string[]
}

/**
 * Send a single draft to all matching clients.
 *
 * Matching rule:
 *   - client.active = true
 *   - client.persona = draft.persona
 *   - if draft.culture_filter is empty: all clients of that persona match
 *   - else: at least one of client.cultures intersects draft.culture_filter
 *
 * On send: writes one mailing_log row per recipient (status='sent' or 'failed'),
 * updates draft.status to 'sent' (or 'failed' if 0 succeeded), denormalizes
 * draft.recipient_count, sets draft.sent_at = now(), and logs to activity_log.
 */
export async function sendDraft(
  supabase: SupabaseClient,
  draftId: string,
  reviewerUid?: string,
): Promise<SendDraftResult> {
  // 1. Load draft
  const { data: draft, error: draftErr } = await supabase
    .from("mailing_drafts")
    .select("*")
    .eq("id", draftId)
    .single()

  if (draftErr || !draft) {
    throw new Error(`Draft ${draftId} not found: ${draftErr?.message ?? "no row"}`)
  }

  if (draft.status === "sent") {
    throw new Error(`Draft ${draftId} was already sent at ${draft.sent_at}`)
  }

  // 2. Load template
  const { data: template, error: tplErr } = await supabase
    .from("mailing_templates")
    .select("*")
    .eq("id", draft.template_id)
    .single()

  if (tplErr || !template) {
    throw new Error(`Template ${draft.template_id} not found: ${tplErr?.message ?? "no row"}`)
  }

  // 3. Load matching clients (persona + culture intersection)
  const cultureFilter = (draft.culture_filter as string[] | null) ?? []
  const cultureFilterSet = new Set(cultureFilter)

  const { data: clientRows, error: clientsErr } = await supabase
    .from("mailing_clients")
    .select(`
      id, entity_uid, full_name, email, persona, active,
      mailing_client_cultures ( culture_slug )
    `)
    .eq("active", true)
    .eq("persona", draft.persona)

  if (clientsErr) {
    throw new Error(`Failed to load clients: ${clientsErr.message}`)
  }

  type ClientWithJoin = {
    id: string
    entity_uid: string | null
    full_name: string
    email: string
    persona: MailingPersona
    mailing_client_cultures: { culture_slug: string }[]
  }

  const candidates = (clientRows ?? []) as ClientWithJoin[]
  const recipients = candidates.filter((c) => {
    if (cultureFilter.length === 0) return true
    const cs = c.mailing_client_cultures.map((r) => r.culture_slug)
    return cs.some((slug) => cultureFilterSet.has(slug))
  })

  if (recipients.length === 0) {
    // Don't fail the draft — set 'failed' so the reviewer knows nobody matched.
    await supabase
      .from("mailing_drafts")
      .update({ status: "failed", sent_at: new Date().toISOString(), recipient_count: 0 })
      .eq("id", draftId)
    return {
      draft_id: draftId,
      status: "failed",
      recipients_total: 0,
      recipients_sent: 0,
      recipients_failed: 0,
      errors: ["No matching clients for this persona × culture combination"],
    }
  }

  // 4. Render + send per recipient
  const resend = getResendClient()
  const fromAddr = getFromAddress()
  const replyTo = getReplyToAddress()

  let sentCount = 0
  let failedCount = 0
  const errors: string[] = []
  const logRows: Record<string, unknown>[] = []

  for (const r of recipients) {
    // Build personalization vars WITHOUT body/subject — those are interpolated separately.
    const personalVars: Record<string, unknown> = {
      recipient_name: r.full_name,
      recipient_email: r.email,
      persona: draft.persona,
      date_pt: new Date().toLocaleDateString("pt-BR"),
      date_en: new Date().toLocaleDateString("en-US"),
      // unsubscribe URL — caller can wire this to a /api/mailing/unsubscribe?token=... later
      unsubscribe_url: `https://agsf-mkthub.vercel.app/api/mailing/unsubscribe?cid=${r.id}`,
    }

    // Two-pass render so {{recipient_name}} inside the reviewer-edited body
    // gets expanded BEFORE it's slotted into the template's {{body}} placeholder.
    const renderedSubject = renderTemplate(draft.subject_pt, personalVars)
    const renderedBody = renderTemplate(draft.body_html_pt, personalVars)
    const renderedHtml = renderTemplate(template.body_html, {
      ...personalVars,
      subject: renderedSubject,
      body: renderedBody,
    })

    try {
      const { data, error } = await resend.emails.send({
        from: fromAddr,
        to: r.email,
        subject: renderedSubject,
        html: renderedHtml,
        replyTo: replyTo,
        headers: {
          "X-AgriSafe-Draft-Id": draftId,
          "X-AgriSafe-Persona": draft.persona,
        },
      })

      if (error) {
        failedCount++
        errors.push(`${r.email}: ${error.message}`)
        logRows.push({
          draft_id: draftId,
          client_id: r.id,
          channel: "email",
          recipient_address: r.email,
          provider: "resend",
          status: "failed",
          error_message: error.message,
        })
      } else {
        sentCount++
        logRows.push({
          draft_id: draftId,
          client_id: r.id,
          channel: "email",
          recipient_address: r.email,
          provider: "resend",
          provider_msg_id: data?.id ?? null,
          status: "sent",
          sent_at: new Date().toISOString(),
        })
      }
    } catch (err) {
      failedCount++
      const msg = err instanceof Error ? err.message : String(err)
      errors.push(`${r.email}: ${msg}`)
      logRows.push({
        draft_id: draftId,
        client_id: r.id,
        channel: "email",
        recipient_address: r.email,
        provider: "resend",
        status: "failed",
        error_message: msg,
      })
    }
  }

  // 5. Persist log rows in one round-trip
  if (logRows.length > 0) {
    const { error: logErr } = await supabase.from("mailing_log").insert(logRows)
    if (logErr) {
      // Logging failure shouldn't poison the result — surface but proceed.
      errors.push(`mailing_log insert error: ${logErr.message}`)
    }
  }

  // 6. Update draft state
  const finalStatus: MailingDraftStatus = sentCount === 0 ? "failed" : "sent"
  await supabase
    .from("mailing_drafts")
    .update({
      status: finalStatus,
      sent_at: new Date().toISOString(),
      recipient_count: sentCount,
      reviewer_uid: reviewerUid ?? draft.reviewer_uid,
      reviewed_at: reviewerUid ? new Date().toISOString() : draft.reviewed_at,
    })
    .eq("id", draftId)

  // 7. Activity feed
  await logActivity(supabase, {
    action: "update",
    source: "manual:mailing_send",
    source_kind: "manual",
    target_table: "mailing_drafts",
    target_id: draftId,
    summary: `Mailing enviado · ${draft.persona} · ${sentCount}/${recipients.length} destinatários`,
    confidentiality: "agrisafe_confidential",
    metadata: {
      persona: draft.persona,
      culture_filter: cultureFilter,
      recipients_total: recipients.length,
      recipients_sent: sentCount,
      recipients_failed: failedCount,
      template_slug: template.slug,
    },
  })

  return {
    draft_id: draftId,
    status: failedCount === 0 ? "sent" : sentCount === 0 ? "failed" : "partial",
    recipients_total: recipients.length,
    recipients_sent: sentCount,
    recipients_failed: failedCount,
    errors,
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Helper — clone a persona briefing into a draft (skeleton, no AI call)
// ──────────────────────────────────────────────────────────────────────────

/**
 * Create a mailing draft from a briefing payload. The reviewer can then
 * edit subject/body before sending. Pure copy — no LLM invocation.
 */
export interface CreateDraftFromBriefingInput {
  briefing_id: string
  template_id: string
  persona: MailingPersona
  culture_filter?: string[]
  subject_pt: string
  subject_en?: string
  body_html_pt: string
  body_html_en?: string
  ai_draft_raw?: Record<string, unknown>
}

export async function createDraftFromBriefing(
  supabase: SupabaseClient,
  input: CreateDraftFromBriefingInput,
): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from("mailing_drafts")
    .insert({
      briefing_id: input.briefing_id,
      template_id: input.template_id,
      persona: input.persona,
      culture_filter: input.culture_filter ?? [],
      status: "draft",
      subject_pt: input.subject_pt,
      subject_en: input.subject_en ?? null,
      body_html_pt: input.body_html_pt,
      body_html_en: input.body_html_en ?? null,
      ai_draft_raw: input.ai_draft_raw ?? null,
    })
    .select("id")
    .single()

  if (error || !data) {
    throw new Error(`Failed to create draft: ${error?.message ?? "no row"}`)
  }

  await logActivity(supabase, {
    action: "insert",
    source: "manual:mailing_draft",
    source_kind: "manual",
    target_table: "mailing_drafts",
    target_id: data.id,
    summary: `Novo draft de mailing · ${input.persona}`,
    confidentiality: "agrisafe_confidential",
    metadata: {
      briefing_id: input.briefing_id,
      persona: input.persona,
      culture_filter: input.culture_filter ?? [],
    },
  })

  return data
}
