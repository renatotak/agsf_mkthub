/**
 * POST /api/crm/meetings/rematch
 *
 * Re-runs entity matching for meetings that were imported from OneNote
 * and either have never been through the matcher OR are still flagged
 * as 'needs_review'.
 *
 * Targets:
 *   - meetings WHERE source = 'onenote_import' AND entity_match_confidence IS NULL
 *   - meetings WHERE entity_match_confidence = 'needs_review'
 *
 * For each meeting, extracts the best available company name string:
 *   1. metadata.company_name (if present from a future import revision)
 *   2. agenda  (meeting title — often contains the company name or context)
 *   3. summary (first 120 chars as last resort)
 *
 * Then calls matchMeetingEntity() and:
 *   - confidence='auto'  → update entity_uid + set entity_match_confidence='auto'
 *   - confidence='needs_review' → set entity_match_confidence='needs_review' only
 *   - confidence='no_match'    → set entity_match_confidence='no_match' only
 *
 * Returns: { matched, reviewNeeded, noMatch, totalProcessed, errors }
 *
 * Auth: This is a user-triggered action from the UI; no CRON_SECRET gate.
 * All write paths call logActivity().
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { matchMeetingEntity } from "@/lib/meeting-entity-matcher";
import { logActivity } from "@/lib/activity-log";

export const dynamic = "force-dynamic";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

interface MeetingRow {
  id: string;
  entity_uid: string;
  agenda: string | null;
  summary: string | null;
  metadata: Record<string, unknown> | null;
  source: string;
  entity_match_confidence: string | null;
}

/**
 * Extract the best available company name string from a meeting row.
 * Priority: metadata.company_name → agenda → summary (first 120 chars).
 */
function extractSearchTerm(row: MeetingRow): string | null {
  // Future OneNote import revisions may store company_name in metadata
  const mdName =
    row.metadata &&
    typeof row.metadata === "object" &&
    typeof (row.metadata as Record<string, unknown>).company_name === "string"
      ? String((row.metadata as Record<string, unknown>).company_name).trim()
      : null;
  if (mdName) return mdName;

  // agenda is typically the meeting title and often contains the company name
  if (row.agenda?.trim()) return row.agenda.trim().slice(0, 200);

  // Last resort: first 120 chars of summary
  if (row.summary?.trim()) return row.summary.trim().slice(0, 120);

  return null;
}

export async function POST(_req: NextRequest) {
  // ── Fetch candidate meetings ───────────────────────────────────────
  // Page to avoid memory pressure on large datasets
  const BATCH = 200;
  const allRows: MeetingRow[] = [];

  // Batch 1: onenote imports never matched
  const { data: unreviewed, error: err1 } = await supabaseAdmin
    .from("meetings")
    .select("id, entity_uid, agenda, summary, metadata, source, entity_match_confidence")
    .eq("source", "onenote_import")
    .is("entity_match_confidence", null)
    .limit(BATCH);

  if (err1) {
    return NextResponse.json({ error: `Fetch error: ${err1.message}` }, { status: 500 });
  }
  allRows.push(...(unreviewed || []));

  // Batch 2: meetings already flagged as needs_review (any source)
  const { data: needsReview, error: err2 } = await supabaseAdmin
    .from("meetings")
    .select("id, entity_uid, agenda, summary, metadata, source, entity_match_confidence")
    .eq("entity_match_confidence", "needs_review")
    .limit(BATCH);

  if (err2) {
    return NextResponse.json({ error: `Fetch error: ${err2.message}` }, { status: 500 });
  }
  allRows.push(...(needsReview || []));

  // Dedup by id (a row can't appear in both batches, but defensive)
  const deduped = Array.from(new Map(allRows.map((r) => [r.id, r])).values());

  if (deduped.length === 0) {
    return NextResponse.json({
      matched: 0,
      reviewNeeded: 0,
      noMatch: 0,
      totalProcessed: 0,
      errors: [],
    });
  }

  // ── Run matching ───────────────────────────────────────────────────
  let matched = 0;
  let reviewNeeded = 0;
  let noMatch = 0;
  const errors: string[] = [];

  for (const row of deduped) {
    const searchTerm = extractSearchTerm(row);
    if (!searchTerm) {
      // No usable text — mark as no_match and move on
      await supabaseAdmin
        .from("meetings")
        .update({ entity_match_confidence: "no_match" })
        .eq("id", row.id);
      noMatch++;
      continue;
    }

    let matchResult;
    try {
      matchResult = await matchMeetingEntity(supabaseAdmin, searchTerm);
    } catch (e: any) {
      errors.push(`Meeting ${row.id}: matcher error — ${String(e?.message || e).slice(0, 100)}`);
      continue;
    }

    const { best, confidence } = matchResult;

    if (confidence === "auto" && best) {
      // High confidence — update entity_uid if it differs (or even if it's
      // the same, to stamp the confidence column)
      const updates: Record<string, unknown> = { entity_match_confidence: "auto" };
      if (best.entity_uid !== row.entity_uid) {
        updates.entity_uid = best.entity_uid;
      }
      const { error: upErr } = await supabaseAdmin
        .from("meetings")
        .update(updates)
        .eq("id", row.id);
      if (upErr) {
        errors.push(`Meeting ${row.id}: update failed — ${upErr.message}`);
      } else {
        matched++;
      }
    } else if (confidence === "needs_review") {
      // Ambiguous — flag but do NOT overwrite entity_uid
      const { error: upErr } = await supabaseAdmin
        .from("meetings")
        .update({ entity_match_confidence: "needs_review" })
        .eq("id", row.id);
      if (upErr) {
        errors.push(`Meeting ${row.id}: flag failed — ${upErr.message}`);
      } else {
        reviewNeeded++;
      }
    } else {
      // no_match
      const { error: upErr } = await supabaseAdmin
        .from("meetings")
        .update({ entity_match_confidence: "no_match" })
        .eq("id", row.id);
      if (upErr) {
        errors.push(`Meeting ${row.id}: flag failed — ${upErr.message}`);
      } else {
        noMatch++;
      }
    }
  }

  // ── Activity log ───────────────────────────────────────────────────
  const totalProcessed = matched + reviewNeeded + noMatch;
  await logActivity(supabaseAdmin, {
    action: "update",
    target_table: "meetings",
    source: "manual:meeting_rematch",
    source_kind: "manual",
    summary: `Rematch: ${matched} corrigidos, ${reviewNeeded} para revisar, ${noMatch} sem match — ${totalProcessed} processados`,
    confidentiality: "agrisafe_confidential",
    metadata: {
      matched,
      review_needed: reviewNeeded,
      no_match: noMatch,
      total_processed: totalProcessed,
      errors_count: errors.length,
    },
  });

  return NextResponse.json({
    matched,
    reviewNeeded,
    noMatch,
    totalProcessed,
    errors: errors.slice(0, 20), // cap error list for response size
  });
}
