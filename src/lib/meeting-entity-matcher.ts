/**
 * Meeting-entity matcher — algorithm-first, no LLM.
 *
 * A higher-level layer built on top of the legal_entities table.
 * Used exclusively by the meeting re-match path; does NOT modify or
 * depend on the existing entity-matcher.ts (which is text-corpus based).
 *
 * Strategy (in priority order):
 *   1. Exact tax_id match — if the input looks like a CPF/CNPJ document.
 *   2. Exact normalized display_name / trade_name equality.
 *   3. Bidirectional ILIKE substring match on display_name / trade_name.
 *   4. In-process trigram-style similarity fallback (no pg_trgm required).
 *
 * Confidence tiers:
 *   score > 0.85  → 'auto'         (auto-update entity_uid)
 *   score 0.5..0.85 → 'needs_review' (flag for human review)
 *   score < 0.5   → 'no_match'
 *
 * Guardrails:
 *   - Algorithms only — no LLM calls.
 *   - Reads from legal_entities; never writes (callers write).
 *   - Deterministic given the same DB state.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

// ─── Public types ────────────────────────────────────────────────────

export type MatchType = "exact" | "display_name" | "trade_name" | "fuzzy";
export type Confidence = "auto" | "needs_review" | "no_match";

export interface MatchCandidate {
  entity_uid: string;
  display_name: string | null;
  trade_name: string | null;
  tax_id: string;
  score: number;
  match_type: MatchType;
}

export interface MatchResult {
  best: MatchCandidate | null;
  candidates: MatchCandidate[];
  confidence: Confidence;
}

// ─── Legal-suffix strip regex ────────────────────────────────────────

/**
 * Suffixes to strip before comparison. Ordered longest-first to avoid
 * partial matches (e.g. strip "S.A." before "S.A" before "SA").
 * Also strips generic agro descriptors that are noise in a company name.
 */
const SUFFIX_RE = /\b(ltda\.?|s\.a\.?|s\/a|eireli|mei|epp|me|sa|corp|ag|cia|comercial|com[eé]rcio|agro|agricola|agr[ií]cola|agroneg[oó]cio|agronegocio|do\s+brasil|brasil)\b\.?/gi;

/** Normalize: strip suffixes, diacritics, punctuation, collapse whitespace. */
function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(SUFFIX_RE, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Returns true if the string looks like a CPF or CNPJ (digits only). */
function looksTaxId(s: string): boolean {
  const digits = s.replace(/\D/g, "");
  return digits.length === 11 || digits.length === 14;
}

// ─── In-process trigram similarity ──────────────────────────────────

/** Build the set of 3-character substrings of a string. */
function trigrams(s: string): Set<string> {
  const out = new Set<string>();
  const padded = `  ${s}  `;
  for (let i = 0; i < padded.length - 2; i++) {
    out.add(padded.slice(i, i + 3));
  }
  return out;
}

/** Dice coefficient on trigram sets: 2|A∩B| / (|A|+|B|). */
function trigramSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const ta = trigrams(a);
  const tb = trigrams(b);
  let intersection = 0;
  for (const t of ta) {
    if (tb.has(t)) intersection++;
  }
  return (2 * intersection) / (ta.size + tb.size);
}

// ─── Bidirectional substring containment score ───────────────────────

/**
 * Returns a score in [0, 1] based on how much the shorter string is
 * contained within the longer one. This catches "Agro João" vs
 * "João Agropecuária" style partial name matches.
 */
function substringScore(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  if (longer.includes(shorter)) {
    // Exact substring: score proportional to coverage
    return shorter.length / longer.length;
  }
  // Partial token overlap: count how many tokens of the shorter appear in the longer
  const shorterTokens = shorter.split(" ").filter(Boolean);
  const longerText = " " + longer + " ";
  const matched = shorterTokens.filter((tok) =>
    tok.length >= 3 && longerText.includes(` ${tok} `)
  );
  if (shorterTokens.length === 0) return 0;
  return matched.length / shorterTokens.length;
}

// ─── Main matcher ────────────────────────────────────────────────────

/**
 * Resolve the best legal_entities candidate for a free-text company name.
 *
 * @param supabase   An admin-capable Supabase client.
 * @param companyName  Raw string from meeting notes (e.g. "Agro João & Filhos").
 * @returns { best, candidates, confidence }
 */
export async function matchMeetingEntity(
  supabase: SupabaseClient,
  companyName: string,
): Promise<MatchResult> {
  const raw = companyName.trim();
  if (!raw) return { best: null, candidates: [], confidence: "no_match" };

  // ── Step 1: Tax ID exact match ──────────────────────────────────
  if (looksTaxId(raw)) {
    const taxIdDigits = raw.replace(/\D/g, "");
    const { data: taxRows } = await supabase
      .from("legal_entities")
      .select("entity_uid, display_name, trade_name, tax_id")
      .eq("tax_id", taxIdDigits)
      .limit(1);

    if (taxRows && taxRows.length > 0) {
      const row = taxRows[0];
      const c: MatchCandidate = {
        entity_uid: row.entity_uid,
        display_name: row.display_name,
        trade_name: row.trade_name ?? null,
        tax_id: row.tax_id,
        score: 1.0,
        match_type: "exact",
      };
      return { best: c, candidates: [c], confidence: "auto" };
    }
  }

  // ── Step 2 & 3: ILIKE search on display_name + trade_name ──────
  const normalizedInput = normalize(raw);

  // We'll search using the original un-normalized name AND the normalized
  // variant to maximize recall. Supabase ILIKE is case-insensitive but
  // doesn't strip diacritics — we rely on the candidate list being broad
  // and then score client-side with normalization.
  const searchTerm = `%${raw.replace(/[%_]/g, "\\$&")}%`;
  const shortNorm = normalizedInput.slice(0, 60); // cap to avoid huge ILIKE
  const searchTermNorm = `%${shortNorm.replace(/[%_]/g, "\\$&")}%`;

  const queries = await Promise.all([
    supabase
      .from("legal_entities")
      .select("entity_uid, display_name, trade_name, tax_id")
      .ilike("display_name", searchTerm)
      .limit(20),
    supabase
      .from("legal_entities")
      .select("entity_uid, display_name, trade_name, tax_id")
      .ilike("trade_name", searchTerm)
      .limit(20),
    supabase
      .from("legal_entities")
      .select("entity_uid, display_name, trade_name, tax_id")
      .ilike("display_name", searchTermNorm)
      .limit(20),
    supabase
      .from("legal_entities")
      .select("entity_uid, display_name, trade_name, tax_id")
      .ilike("trade_name", searchTermNorm)
      .limit(20),
  ]);

  // Merge and dedup by entity_uid
  const seen = new Map<string, {
    entity_uid: string;
    display_name: string | null;
    trade_name: string | null;
    tax_id: string;
    source_field: "display_name" | "trade_name";
  }>();
  for (let qi = 0; qi < queries.length; qi++) {
    const sourceField: "display_name" | "trade_name" = qi % 2 === 0 ? "display_name" : "trade_name";
    for (const row of queries[qi].data || []) {
      if (!seen.has(row.entity_uid)) {
        seen.set(row.entity_uid, { ...row, source_field: sourceField });
      }
    }
  }

  if (seen.size === 0) {
    // ── Step 4: Trigram fallback — load a broader candidate set ──
    // We fetch entities whose display_name starts with at least the first
    // token of the input (simple heuristic to narrow the pool) and then
    // score all of them via trigram similarity.
    const firstToken = normalizedInput.split(" ")[0] || "";
    if (firstToken.length < 3) {
      return { best: null, candidates: [], confidence: "no_match" };
    }

    const { data: broadRows } = await supabase
      .from("legal_entities")
      .select("entity_uid, display_name, trade_name, tax_id")
      .ilike("display_name", `${firstToken}%`)
      .limit(100);

    if (!broadRows || broadRows.length === 0) {
      return { best: null, candidates: [], confidence: "no_match" };
    }

    const fuzzyCandidates: MatchCandidate[] = [];
    for (const row of broadRows) {
      const normDN = normalize(row.display_name || "");
      const sim = trigramSimilarity(normalizedInput, normDN);
      if (sim >= 0.4) {
        fuzzyCandidates.push({
          entity_uid: row.entity_uid,
          display_name: row.display_name,
          trade_name: row.trade_name ?? null,
          tax_id: row.tax_id,
          score: sim,
          match_type: "fuzzy",
        });
      }
    }

    fuzzyCandidates.sort((a, b) => b.score - a.score);
    const top3 = fuzzyCandidates.slice(0, 3);
    const best = top3[0] ?? null;
    return {
      best,
      candidates: top3,
      confidence: scoreToConfidence(best?.score ?? 0),
    };
  }

  // ── Score the ILIKE candidates ─────────────────────────────────
  const scoredRows: MatchCandidate[] = [];
  for (const [, row] of seen) {
    const normDN = normalize(row.display_name || "");
    const normTN = normalize(row.trade_name || "");

    // Best score across both fields
    let bestScore = 0;
    let bestMatchType: MatchType = row.source_field;

    // Exact normalized match
    if (normDN === normalizedInput) {
      bestScore = 1.0;
      bestMatchType = "display_name";
    } else if (normTN === normalizedInput) {
      bestScore = 1.0;
      bestMatchType = "trade_name";
    } else {
      // Trigram + substring combo — take the max
      const simDN = normDN
        ? Math.max(
            trigramSimilarity(normalizedInput, normDN),
            substringScore(normalizedInput, normDN),
          )
        : 0;
      const simTN = normTN
        ? Math.max(
            trigramSimilarity(normalizedInput, normTN),
            substringScore(normalizedInput, normTN),
          )
        : 0;

      if (simDN >= simTN) {
        bestScore = simDN;
        bestMatchType = "display_name";
      } else {
        bestScore = simTN;
        bestMatchType = "trade_name";
      }
      // The ILIKE pass guarantees a substring hit, so the floor is 0.5
      if (bestScore < 0.5) bestScore = 0.5;
    }

    scoredRows.push({
      entity_uid: row.entity_uid,
      display_name: row.display_name,
      trade_name: row.trade_name ?? null,
      tax_id: row.tax_id,
      score: Math.min(bestScore, 1),
      match_type: bestMatchType,
    });
  }

  scoredRows.sort((a, b) => b.score - a.score);
  const top3 = scoredRows.slice(0, 3);
  const best = top3[0] ?? null;

  return {
    best,
    candidates: top3,
    confidence: scoreToConfidence(best?.score ?? 0),
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────

function scoreToConfidence(score: number): Confidence {
  if (score > 0.85) return "auto";
  if (score >= 0.5) return "needs_review";
  return "no_match";
}
