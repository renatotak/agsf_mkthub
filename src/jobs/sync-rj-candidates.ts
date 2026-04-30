/**
 * Phase 29 — sync-rj-candidates discovery job.
 *
 * Replaces the abandoned Serasa CSV backfill (no Serasa CSV with RJ
 * companies exists). This job surfaces companies that appear in
 * agro_news with RJ / falência keywords but are NOT yet in the
 * canonical recuperacao_judicial table.
 *
 * Algorithm-first per CLAUDE.md guardrail #1: regex on news text +
 * JOIN against existing entity_mentions. NO LLM.
 *
 * Cadence: weekly Sunday (registered in src/jobs/sync-orchestrator.ts).
 *
 * Flow:
 *   1. Load existing RJ entity_uids (so we skip companies already tracked).
 *   2. Scan last 90 days of agro_news for RJ keywords.
 *   3. For each match, look up entity_mentions(source_table='agro_news', source_id=<news_id>).
 *   4. For each (entity_uid, news_id) pair where entity is NOT already in RJ,
 *      upsert a row into rj_candidates with the matched snippet + keyword.
 *
 * The user reviews via /api/rj-candidates and either accepts (promotes
 * to recuperacao_judicial via the existing /api/rj-add flow) or rejects.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logSync } from "@/lib/sync-logger";
import { logActivity } from "@/lib/activity-log";
import type { JobResult } from "@/jobs/types";

// Recency window: only scan news published in the last 90 days. Older
// articles are unlikely to surface fresh, actionable RJ candidates.
const WINDOW_DAYS = 90;

// Snippet length around the matched keyword (chars on each side).
const SNIPPET_HALF = 120;

// RJ keyword patterns. Each entry has a label that we record on the
// candidate row so the reviewer knows why it was flagged.
interface KeywordPattern {
  label: string;
  pattern: RegExp;
}

const RJ_PATTERNS: KeywordPattern[] = [
  // Filing patterns: "pediu RJ", "ajuizou recuperação judicial", etc.
  {
    label: "rj_filing",
    pattern: /\b(?:pediu|requereu|ajuizou|protocolou|entrou\s+com)\s+(?:o\s+)?(?:processo\s+de\s+)?(?:pedido\s+de\s+)?recupera[çc][ãa]o\s+judicial\b/i,
  },
  // Generic RJ mention with action verb — broad catch
  {
    label: "rj_mention",
    pattern: /\brecupera[çc][ãa]o\s+judicial\b/i,
  },
  // Approval / decision patterns
  {
    label: "rj_approved",
    pattern: /\b(?:RJ|recupera[çc][ãa]o\s+judicial)\s+(?:deferida|aprovada|homologada|concedida|decretada)\b/i,
  },
  // Bankruptcy / falência
  {
    label: "falencia",
    pattern: /\bfal[êe]ncia\s+(?:decretada|requerida|ajuizada|do\s+grupo)\b/i,
  },
  // Debtor in possession / DIP
  {
    label: "dip_financing",
    pattern: /\b(?:DIP\s+financing|financiamento\s+DIP)\b/i,
  },
];

function extractSnippet(text: string, match: RegExpExecArray): string {
  const start = Math.max(0, match.index - SNIPPET_HALF);
  const end = Math.min(text.length, match.index + match[0].length + SNIPPET_HALF);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < text.length ? "…" : "";
  return prefix + text.slice(start, end).replace(/\s+/g, " ").trim() + suffix;
}

interface CandidateRow {
  entity_uid: string;
  news_id: string;
  news_snippet: string;
  news_published_at: string | null;
  keyword_match: string;
}

export async function runSyncRjCandidates(supabase: SupabaseClient): Promise<JobResult> {
  const startedAt = new Date().toISOString();
  const startedAtMs = Date.now();
  const errors: string[] = [];

  try {
    // ─── 1. Load existing RJ coverage ─────────────────────────
    // Two sources of "already tracked":
    //   (a) recuperacao_judicial rows with a known entity_uid via entity_mentions
    //   (b) RJ rows where entity_cnpj resolves to a legal_entity tax_id
    // The simplest signal: entity_mentions where source_table='recuperacao_judicial'.
    const { data: rjMentions, error: rjErr } = await supabase
      .from("entity_mentions")
      .select("entity_uid")
      .eq("source_table", "recuperacao_judicial");

    if (rjErr) throw new Error(`load RJ entity_mentions: ${rjErr.message}`);

    const trackedEntityUids = new Set<string>(
      (rjMentions || []).map((r) => String(r.entity_uid)),
    );

    // ─── 2. Scan recent news for RJ keywords ─────────────────
    const cutoff = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const { data: newsRows, error: newsErr } = await supabase
      .from("agro_news")
      .select("id, title, summary, published_at")
      .gte("published_at", cutoff);

    if (newsErr) throw new Error(`load agro_news: ${newsErr.message}`);
    if (!newsRows || newsRows.length === 0) {
      const finishedAt = new Date().toISOString();
      return {
        ok: true,
        status: "success",
        startedAt,
        finishedAt,
        durationMs: Date.now() - startedAtMs,
        recordsFetched: 0,
        recordsUpdated: 0,
        errors: [],
        stats: { newsScanned: 0, articlesMatched: 0, candidatesAdded: 0 },
      };
    }

    // For each matching article, find which keyword hit + snippet
    const matchingArticles: Array<{
      news_id: string;
      published_at: string | null;
      keyword_match: string;
      snippet: string;
    }> = [];

    for (const n of newsRows as Array<{ id: string; title: string | null; summary: string | null; published_at: string | null }>) {
      const text = `${n.title || ""}\n${n.summary || ""}`;
      if (!text.trim()) continue;

      // First pattern that matches wins; we record only one keyword per article.
      let hit: { label: string; snippet: string } | null = null;
      for (const p of RJ_PATTERNS) {
        const m = p.pattern.exec(text);
        if (m) {
          hit = { label: p.label, snippet: extractSnippet(text, m) };
          break;
        }
      }
      if (!hit) continue;

      matchingArticles.push({
        news_id: n.id,
        published_at: n.published_at,
        keyword_match: hit.label,
        snippet: hit.snippet,
      });
    }

    if (matchingArticles.length === 0) {
      const finishedAt = new Date().toISOString();
      await logSync(supabase, {
        source: "sync-rj-candidates",
        started_at: startedAt,
        finished_at: finishedAt,
        status: "success",
        records_fetched: newsRows.length,
        records_inserted: 0,
        errors: 0,
      }).catch(() => {});

      return {
        ok: true,
        status: "success",
        startedAt,
        finishedAt,
        durationMs: Date.now() - startedAtMs,
        recordsFetched: newsRows.length,
        recordsUpdated: 0,
        errors: [],
        stats: { newsScanned: newsRows.length, articlesMatched: 0, candidatesAdded: 0 },
      };
    }

    // ─── 3. Look up entity_mentions for matched articles ─────
    const matchedNewsIds = matchingArticles.map((a) => a.news_id);
    const { data: mentions, error: menErr } = await supabase
      .from("entity_mentions")
      .select("entity_uid, source_id")
      .eq("source_table", "agro_news")
      .in("source_id", matchedNewsIds);

    if (menErr) throw new Error(`load entity_mentions for news: ${menErr.message}`);

    // Map news_id -> Set<entity_uid>
    const newsToEntities = new Map<string, Set<string>>();
    for (const m of mentions || []) {
      const sid = String(m.source_id);
      if (!newsToEntities.has(sid)) newsToEntities.set(sid, new Set());
      newsToEntities.get(sid)!.add(String(m.entity_uid));
    }

    // ─── 4. Build candidate rows (filter out already-tracked) ─
    const candidatesByKey = new Map<string, CandidateRow>();
    for (const a of matchingArticles) {
      const entityUids = newsToEntities.get(a.news_id);
      if (!entityUids || entityUids.size === 0) continue;

      for (const uid of entityUids) {
        if (trackedEntityUids.has(uid)) continue;

        const key = `${uid}|${a.news_id}`;
        if (candidatesByKey.has(key)) continue;

        candidatesByKey.set(key, {
          entity_uid: uid,
          news_id: a.news_id,
          news_snippet: a.snippet,
          news_published_at: a.published_at,
          keyword_match: a.keyword_match,
        });
      }
    }

    const candidateRows = Array.from(candidatesByKey.values());

    // ─── 5. Upsert candidates (UNIQUE on entity_uid+news_id) ─
    let candidatesAdded = 0;
    if (candidateRows.length > 0) {
      // Chunk to keep payloads sane.
      const CHUNK = 200;
      for (let i = 0; i < candidateRows.length; i += CHUNK) {
        const chunk = candidateRows.slice(i, i + CHUNK);
        const { error, count } = await supabase
          .from("rj_candidates")
          .upsert(chunk, { onConflict: "entity_uid,news_id", ignoreDuplicates: true, count: "exact" });
        if (error) {
          errors.push(`chunk ${i / CHUNK}: ${error.message}`);
          continue;
        }
        candidatesAdded += count || 0;
      }
    }

    const finishedAt = new Date().toISOString();
    // 3-way status: clean → success; some upsert chunks failed but some
    // landed → partial; all chunks failed → error.
    const status: "success" | "partial" | "error" =
      errors.length === 0
        ? "success"
        : candidatesAdded > 0
          ? "partial"
          : "error";

    await logSync(supabase, {
      source: "sync-rj-candidates",
      started_at: startedAt,
      finished_at: finishedAt,
      status,
      records_fetched: newsRows.length,
      records_inserted: candidatesAdded,
      errors: errors.length,
      error_message: errors.length > 0 ? errors.join("; ") : undefined,
    }).catch(() => {});

    await logActivity(supabase, {
      action: "insert",
      source: "sync-rj-candidates",
      source_kind: "cron",
      target_table: "rj_candidates",
      summary: `RJ Candidates: scanned ${newsRows.length} news (90d), ${matchingArticles.length} matched, ${candidatesAdded} new candidates`,
      metadata: {
        newsScanned: newsRows.length,
        articlesMatched: matchingArticles.length,
        candidateRowsBuilt: candidateRows.length,
        candidatesAdded,
        trackedEntities: trackedEntityUids.size,
      },
    }).catch(() => {});

    return {
      ok: status !== "error",
      status,
      startedAt,
      finishedAt,
      durationMs: Date.now() - startedAtMs,
      recordsFetched: newsRows.length,
      recordsUpdated: candidatesAdded,
      errors,
      stats: {
        newsScanned: newsRows.length,
        articlesMatched: matchingArticles.length,
        candidatesAdded,
      },
    };
  } catch (e: unknown) {
    const finishedAt = new Date().toISOString();
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      status: "error",
      startedAt,
      finishedAt,
      durationMs: Date.now() - startedAtMs,
      recordsFetched: 0,
      recordsUpdated: 0,
      errors: [...errors, msg],
    };
  }
}
