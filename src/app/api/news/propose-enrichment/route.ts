import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { logActivity } from "@/lib/activity-log";
import {
  loadMatchableEntities,
  matchEntitiesInText,
  writeEntityMentions,
} from "@/lib/entity-matcher";
import { isGeminiConfigured, summarizeText } from "@/lib/gemini";

/**
 * Phase 4c — News → Directory enrichment endpoint.
 *
 * GET  ?article_id=<id>  → propose enrichment (algorithmic first, LLM fallback)
 * POST { article_id, accepted: [{entity_uid, proposed_role}] } → write accepted proposals
 *
 * GET returns:
 *   { proposals: [{ entity_uid, entity_name, proposed_role, confidence, source_snippet }] }
 *
 * POST writes to entity_mentions + entity_roles (upsert) for accepted proposals,
 * then logs activity.
 */
export const dynamic = "force-dynamic";

export interface EnrichmentProposal {
  entity_uid: string;
  entity_name: string;
  proposed_role: string;
  confidence: number; // 0–1
  source_snippet: string;
  source: "algorithmic" | "llm";
}

// ─── GET: propose enrichment ─────────────────────────────────
export async function GET(req: NextRequest) {
  const articleId = req.nextUrl.searchParams.get("article_id");
  if (!articleId) {
    return NextResponse.json({ error: "article_id is required" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Fetch the article
  const { data: article, error: fetchErr } = await supabase
    .from("agro_news")
    .select("id, title, summary, source_url")
    .eq("id", articleId)
    .maybeSingle();

  if (fetchErr || !article) {
    return NextResponse.json({ error: "Article not found" }, { status: 404 });
  }

  const text = `${article.title || ""} ${article.summary || ""}`;
  const proposals: EnrichmentProposal[] = [];

  // ─── Step 1: Algorithmic matching (entity-matcher) ─────────
  try {
    const matchable = await loadMatchableEntities(supabase);
    const matchedUids = matchEntitiesInText(text, matchable);

    if (matchedUids.length > 0) {
      // Fetch entity details for matched UIDs
      const { data: entities } = await supabase
        .from("legal_entities")
        .select("entity_uid, display_name, legal_name")
        .in("entity_uid", matchedUids);

      // Fetch existing roles for these entities
      const { data: existingRoles } = await supabase
        .from("entity_roles")
        .select("entity_uid, role_type")
        .in("entity_uid", matchedUids);

      const roleMap = new Map<string, string[]>();
      for (const r of existingRoles || []) {
        const list = roleMap.get(r.entity_uid) || [];
        list.push(r.role_type);
        roleMap.set(r.entity_uid, list);
      }

      for (const ent of entities || []) {
        const name = ent.display_name || ent.legal_name || "?";
        const roles = roleMap.get(ent.entity_uid) || [];
        // Propose the most likely role based on existing roles, or "other"
        const proposedRole = roles.length > 0 ? roles[0] : "other";
        // Find snippet containing the name
        const snippet = extractSnippet(text, name);

        proposals.push({
          entity_uid: ent.entity_uid,
          entity_name: name,
          proposed_role: proposedRole,
          confidence: 0.85,
          source_snippet: snippet,
          source: "algorithmic",
        });
      }
    }
  } catch (e: any) {
    console.error("[propose-enrichment] algorithmic match failed:", e?.message);
  }

  // ─── Step 2: LLM fallback for unmatched entities ───────────
  // Only if algorithmic found nothing AND Gemini is configured
  if (proposals.length === 0 && isGeminiConfigured()) {
    try {
      const llmProposals = await extractEntitiesViaLLM(text);
      for (const p of llmProposals) {
        // Try to resolve the LLM-suggested name to an existing entity
        const { data: found } = await supabase
          .from("legal_entities")
          .select("entity_uid, display_name")
          .or(`display_name.ilike.%${p.entity_name}%,legal_name.ilike.%${p.entity_name}%`)
          .limit(1)
          .maybeSingle();

        if (found) {
          proposals.push({
            entity_uid: found.entity_uid,
            entity_name: found.display_name || p.entity_name,
            proposed_role: p.proposed_role,
            confidence: p.confidence * 0.8, // discount LLM confidence
            source_snippet: p.source_snippet,
            source: "llm",
          });
        }
        // If entity doesn't exist in directory, skip — we don't create entities
        // from LLM guesses. User can add them manually.
      }
    } catch (e: any) {
      console.error("[propose-enrichment] LLM extraction failed:", e?.message);
    }
  }

  return NextResponse.json({ proposals, article_id: articleId });
}

// ─── POST: accept proposals and write to DB ──────────────────
export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const { article_id, accepted } = body;
  if (!article_id || !Array.isArray(accepted) || accepted.length === 0) {
    return NextResponse.json(
      { error: "article_id and accepted[] are required" },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();

  // Verify article exists
  const { data: article } = await supabase
    .from("agro_news")
    .select("id, title")
    .eq("id", article_id)
    .maybeSingle();

  if (!article) {
    return NextResponse.json({ error: "Article not found" }, { status: 404 });
  }

  const entityUids = accepted.map((a: any) => a.entity_uid).filter(Boolean);
  let mentionsWritten = 0;
  let rolesWritten = 0;

  // Write entity_mentions
  if (entityUids.length > 0) {
    mentionsWritten = await writeEntityMentions(supabase, {
      entityUids,
      sourceTable: "agro_news",
      sourceId: article_id,
      mentionType: "mentioned",
      extractedBy: "manual_enrichment_v1",
    });
  }

  // Upsert entity_roles for accepted proposals
  for (const item of accepted) {
    if (!item.entity_uid || !item.proposed_role) continue;
    const { error: roleErr } = await supabase
      .from("entity_roles")
      .upsert(
        { entity_uid: item.entity_uid, role_type: item.proposed_role },
        { onConflict: "entity_uid,role_type", ignoreDuplicates: true },
      );
    if (!roleErr) rolesWritten++;
  }

  // Log activity
  await logActivity(supabase, {
    action: "upsert",
    target_table: "entity_mentions",
    target_id: article_id,
    source: "manual:news_enrichment",
    source_kind: "manual",
    summary: `Enriched directory from news: ${article.title?.slice(0, 120)} (${mentionsWritten} mentions, ${rolesWritten} roles)`,
    metadata: {
      article_id,
      entity_uids: entityUids,
      mentions_written: mentionsWritten,
      roles_written: rolesWritten,
    },
  });

  return NextResponse.json({
    success: true,
    mentions_written: mentionsWritten,
    roles_written: rolesWritten,
  });
}

// ─── Helpers ─────────────────────────────────────────────────

/** Extract a short snippet around the entity name in the text. */
function extractSnippet(text: string, name: string): string {
  const lower = text.toLowerCase();
  const nameLower = name.toLowerCase();
  const idx = lower.indexOf(nameLower);
  if (idx === -1) return text.slice(0, 120) + "...";
  const start = Math.max(0, idx - 40);
  const end = Math.min(text.length, idx + name.length + 40);
  let snippet = text.slice(start, end);
  if (start > 0) snippet = "..." + snippet;
  if (end < text.length) snippet = snippet + "...";
  return snippet;
}

/** Use Gemini to extract entity names + roles from article text. */
async function extractEntitiesViaLLM(
  text: string,
): Promise<{ entity_name: string; proposed_role: string; confidence: number; source_snippet: string }[]> {
  const systemPrompt = `You are an agribusiness entity extractor. Given a news article text, extract organizations/companies mentioned and their likely role in the agribusiness supply chain.

Output JSON array with objects containing:
- "entity_name": string — the organization name as it appears
- "proposed_role": one of "industry","retailer","cooperative","frigorifico","trader","distribuidor","rural_producer","government","competitor","other"
- "confidence": number 0-1
- "source_snippet": the sentence or phrase where the entity is mentioned

Only include clearly named organizations. Do not include generic terms. Maximum 10 entities.`;

  const raw = await summarizeText(systemPrompt, text.slice(0, 4000), 1000);
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed.entities)) return parsed.entities;
    return [];
  } catch {
    return [];
  }
}
