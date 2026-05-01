/**
 * Phase 29 — /api/mailing/drafts/[id]/send.
 *
 * POST → fan-out via Resend. Synchronous (no queue/retry).
 *
 * Body (optional): { reviewer_uid?: string }
 *
 * The lib's `sendDraft()` handles all logging — we only translate
 * thrown errors into 500/4xx responses.
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { sendDraft } from "@/lib/mailing"

export const dynamic = "force-dynamic"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

interface RouteCtx {
  params: Promise<{ id: string }>
}

export async function POST(req: NextRequest, ctx: RouteCtx) {
  const { id } = await ctx.params
  const body = (await req.json().catch(() => ({}))) as { reviewer_uid?: string }
  const reviewerUid =
    typeof body.reviewer_uid === "string" && body.reviewer_uid
      ? body.reviewer_uid
      : req.headers.get("x-agrisafe-uid") || undefined

  try {
    const result = await sendDraft(supabaseAdmin, id, reviewerUid)
    return NextResponse.json({ success: true, data: result })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const status = msg.includes("not found") ? 404 : msg.includes("already sent") ? 409 : 500
    return NextResponse.json({ success: false, error: msg }, { status })
  }
}
