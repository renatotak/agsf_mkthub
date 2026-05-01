/**
 * Phase 29 — /api/mailing/log read endpoint.
 *
 * GET ?draft_id=...&status=...&limit=100&offset=0
 *   → joined feed with mailing_clients.full_name and
 *     mailing_drafts.subject_pt + persona, sorted by created_at DESC.
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import type { MailingLogStatus } from "@/lib/mailing"

export const dynamic = "force-dynamic"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const STATUSES: MailingLogStatus[] = [
  "queued",
  "sent",
  "delivered",
  "opened",
  "clicked",
  "bounced",
  "failed",
]

const DEFAULT_LIMIT = 100
const MAX_LIMIT = 500

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const draftId = sp.get("draft_id")
  const status = sp.get("status")
  const limit = Math.min(Number(sp.get("limit") ?? DEFAULT_LIMIT) || DEFAULT_LIMIT, MAX_LIMIT)
  const offset = Math.max(Number(sp.get("offset") ?? 0) || 0, 0)

  let query = supabaseAdmin
    .from("mailing_log")
    .select(
      `
      id, draft_id, client_id, channel, recipient_address, provider, provider_msg_id,
      status, error_message, sent_at, delivered_at, opened_at, clicked_at, created_at,
      mailing_clients ( full_name ),
      mailing_drafts ( subject_pt, persona )
    `,
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1)

  if (draftId) query = query.eq("draft_id", draftId)
  if (status && STATUSES.includes(status as MailingLogStatus)) {
    query = query.eq("status", status)
  }

  const { data, error, count } = await query
  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  // Flatten the join for easier UI consumption
  type LogRow = {
    mailing_clients?: { full_name?: string | null } | null
    mailing_drafts?: { subject_pt?: string | null; persona?: string | null } | null
    [key: string]: unknown
  }
  const flat = (data ?? []).map((r) => {
    const row = r as LogRow
    return {
      ...row,
      client_full_name: row.mailing_clients?.full_name ?? null,
      draft_subject_pt: row.mailing_drafts?.subject_pt ?? null,
      draft_persona: row.mailing_drafts?.persona ?? null,
    }
  })

  return NextResponse.json({ success: true, data: flat, total: count ?? 0 })
}
