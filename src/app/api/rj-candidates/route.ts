/**
 * Phase 29 — RJ candidates read API.
 *
 * GET /api/rj-candidates
 *   - ?status=pending|accepted|rejected (default: pending)
 *   - ?limit=N (default: 50)
 * Returns candidates joined with legal_entities for display.
 *
 * PATCH /api/rj-candidates
 *   - body: { id: uuid, status: 'accepted'|'rejected', notes?: string }
 *   - Marks a candidate resolved. Promoting to recuperacao_judicial is
 *     done by the user via the existing /api/rj-add flow; this endpoint
 *     just records the review decision.
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { logActivity } from "@/lib/activity-log";

export const dynamic = "force-dynamic";

const VALID_STATUS = new Set(["pending", "accepted", "rejected"]);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const statusParam = url.searchParams.get("status") || "pending";
  const limitParam = parseInt(url.searchParams.get("limit") || "50", 10);
  const limit = Math.min(200, Math.max(1, isNaN(limitParam) ? 50 : limitParam));

  if (!VALID_STATUS.has(statusParam)) {
    return NextResponse.json(
      { error: `Invalid status. Must be one of: ${Array.from(VALID_STATUS).join(", ")}` },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();

  // Pull candidates + entity display fields in one round-trip via a join.
  // We only return the columns the UI needs; legal_entities holds many more.
  const { data, error } = await supabase
    .from("rj_candidates")
    .select(
      `
      id,
      entity_uid,
      news_id,
      news_snippet,
      news_published_at,
      keyword_match,
      status,
      detected_at,
      resolved_at,
      resolved_by,
      notes,
      entity:legal_entities!rj_candidates_entity_uid_fkey ( display_name, tax_id, tax_id_type ),
      news:agro_news!rj_candidates_news_id_fkey ( title, source_url, source_name )
    `,
    )
    .eq("status", statusParam)
    .order("detected_at", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ candidates: data || [], count: (data || []).length });
}

export async function PATCH(request: Request) {
  let body: { id?: string; status?: string; notes?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.id || !body.status) {
    return NextResponse.json({ error: "Missing required fields: id, status" }, { status: 400 });
  }
  if (!VALID_STATUS.has(body.status) || body.status === "pending") {
    return NextResponse.json(
      { error: "status must be 'accepted' or 'rejected'" },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("rj_candidates")
    .update({
      status: body.status,
      resolved_at: new Date().toISOString(),
      resolved_by: "manual_ui",
      notes: body.notes ?? null,
    })
    .eq("id", body.id)
    .select("id, entity_uid, status")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logActivity(supabase, {
    action: "update",
    source: "api/rj-candidates",
    source_kind: "manual",
    target_table: "rj_candidates",
    target_id: data.id,
    summary: `RJ candidate ${data.status} for entity ${data.entity_uid}`,
    metadata: { id: data.id, status: data.status, notes: body.notes ?? null },
  }).catch(() => {});

  return NextResponse.json({ ok: true, candidate: data });
}
