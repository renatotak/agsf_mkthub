/**
 * Algorithm-first entity name matcher.
 *
 * Given a set of legal_entities (display_name / legal_name) and a text
 * corpus, returns the entity_uids that appear in the text. Uses pure
 * substring matching with normalization — NO LLM calls.
 *
 * Rules:
 *  - Normalize: lowercase + strip diacritics + strip extra whitespace
 *  - Only match names with >= MIN_NAME_LEN chars to avoid false positives
 *  - Word-boundary enforcement to prevent "BR" matching inside "BRASIL"
 *  - One entity can only match once per text (dedupe)
 */
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Minimum length for a single-word name to be a valid match candidate.
 * Multi-word names skip this check. Single-word names below this length
 * produce too many false positives (generic Portuguese agro terms).
 *
 * Exceptions: see SHORT_NAME_ALLOWLIST below.
 */
const MIN_SINGLE_WORD_LEN = 10;

/**
 * Blocklist of generic Portuguese agro terms that happen to also be the
 * display_name of some retailer shops. Keep this list short and specific —
 * only add terms that have demonstrably caused false positives. Values are
 * already normalized (lowercase + accent-stripped).
 */
const GENERIC_AGRO_STOPWORDS = new Set<string>([
  "rural", "safra", "produtiva", "produza", "agronegocios", "agronegocio",
  "boi gordo", "arroba", "nutricao", "cerrado", "rio grande", "tradicao",
  "elevar", "comigo", "biotech", "agro", "agricola", "pecuaria",
  "sementes", "fertilizantes", "defensivos", "insumos", "cooperativa",
  "agroindustria", "fazenda", "campo", "colheita", "plantio", "lavoura",
  // False positives discovered on first backfill pass — add new ones here
  // as they surface. Keep the list specific to avoid over-filtering.
  "a cooperativa", "inovacao agricola", "nova agricola", "nova safra",
  "mais agricola", "a agricola", "agricola nova",
]);

/**
 * Allowlist of well-known short brand/acronym names that should match even
 * though they fall below MIN_SINGLE_WORD_LEN. These are known iconic
 * agribusiness entities whose normalized name is < 10 chars but unambiguous
 * in context. Adding to this list is a deliberate, audited decision — each
 * entry should map to exactly one (or very few) real entities and the
 * brand should be distinctive enough that false-positive risk is low.
 *
 * Values are normalized (lowercase, no diacritics).
 */
const SHORT_NAME_ALLOWLIST = new Set<string>([
  // Cooperatives
  "comigo",   // Cooperativa Agroindustrial dos Produtores Rurais do Sudoeste Goiano
  "cocamar",  // Cooperativa Agroindustrial de Maringá
  "coamo",    // Cooperativa Agroindustrial de Campo Mourão
  "c.vale",   // Cooperativa Agroindustrial — PR
  "coplacana",// Cooperativa dos Plantadores de Cana — Piracicaba
  "lar",      // Lar Cooperativa Agroindustrial — PR (short, but distinctive in agro context)
  // Industries / brand names that often appear in news
  "basf", "bayer", "fmc", "corteva", "syngenta", "amvac", "yara", "nutrien",
  "bunge", "cargill", "adm", "louis dreyfus",
  // Agencies frequently quoted
  "embrapa", "conab", "ibge", "bndes", "abag", "andef", "abiquim", "abicarnes",
  "abimaq", "anec", "aprosoja", "abcs",
]);

/** Normalize: lowercase, strip diacritics, collapse whitespace. */
function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip combining accents
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Is this normalized name specific enough to be a mention-match candidate?
 *
 * Rules (any-of):
 *  - explicit allowlist (SHORT_NAME_ALLOWLIST) — bypasses stopword + length
 *  - multi-word (contains space) AND not in stopword list
 *  - single word with length >= MIN_SINGLE_WORD_LEN AND not a stopword
 */
function isSpecificEnough(normalized: string): boolean {
  if (!normalized) return false;
  if (SHORT_NAME_ALLOWLIST.has(normalized)) return true;
  if (GENERIC_AGRO_STOPWORDS.has(normalized)) return false;
  const isMultiWord = normalized.includes(" ");
  if (isMultiWord) return true;
  return normalized.length >= MIN_SINGLE_WORD_LEN;
}

export interface MatchableEntity {
  entity_uid: string;
  /** Normalized candidate strings — already lowercased + diacritic-stripped. */
  names: string[];
}

/**
 * Fetch entities that are "notable" for mention detection: anything with a
 * role in entity_roles. Returns the minimum data needed for matching.
 *
 * Paginates to work around PostgREST's default 1,000-row cap — we have
 * ~9,400 role-bearing entities today. Cache per cron run.
 */
export async function loadMatchableEntities(
  supabase: SupabaseClient,
): Promise<MatchableEntity[]> {
  const PAGE = 1000;
  const all: any[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("legal_entities")
      .select("entity_uid, legal_name, display_name, entity_roles!inner(role_type)")
      .range(from, from + PAGE - 1);
    if (error) {
      console.error("[loadMatchableEntities] page fetch failed:", error);
      break;
    }
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }

  const out: MatchableEntity[] = [];
  for (const e of all) {
    const candidates = new Set<string>();
    for (const raw of [e.display_name, e.legal_name]) {
      if (!raw) continue;
      const n = normalize(String(raw));
      if (isSpecificEnough(n)) candidates.add(n);
    }
    if (candidates.size > 0) {
      out.push({ entity_uid: e.entity_uid, names: Array.from(candidates) });
    }
  }
  return out;
}

/**
 * Returns the set of entity_uids whose names appear in the given text.
 * Uses word-boundary substring match on the normalized text.
 */
export function matchEntitiesInText(
  text: string,
  entities: MatchableEntity[],
): string[] {
  if (!text) return [];
  const haystack = normalize(text);
  const hits = new Set<string>();

  for (const ent of entities) {
    for (const name of ent.names) {
      // Word boundary check: name must be preceded/followed by non-word char
      // or start/end of string. Using indexOf + manual boundary check is
      // cheaper than constructing a RegExp per name per article.
      let idx = haystack.indexOf(name);
      while (idx !== -1) {
        const before = idx === 0 ? "" : haystack[idx - 1];
        const after = idx + name.length >= haystack.length ? "" : haystack[idx + name.length];
        const beforeOk = !before || !/[a-z0-9]/.test(before);
        const afterOk = !after || !/[a-z0-9]/.test(after);
        if (beforeOk && afterOk) {
          hits.add(ent.entity_uid);
          break;
        }
        idx = haystack.indexOf(name, idx + 1);
      }
    }
  }
  return Array.from(hits);
}

/**
 * Upsert entity_mentions rows for a given source record. Idempotent via
 * the PK (entity_uid, source_table, source_id, mention_type).
 */
export async function writeEntityMentions(
  supabase: SupabaseClient,
  opts: {
    entityUids: string[];
    sourceTable: string;
    sourceId: string;
    mentionType?: "mentioned" | "subject" | "organizer" | "party" | "beneficiary" | "affected";
    sentiment?: "positive" | "neutral" | "negative" | null;
    extractedBy: string;
  },
): Promise<number> {
  if (opts.entityUids.length === 0) return 0;
  const rows = opts.entityUids.map((entity_uid) => ({
    entity_uid,
    source_table: opts.sourceTable,
    source_id: opts.sourceId,
    mention_type: opts.mentionType ?? "mentioned",
    sentiment: opts.sentiment ?? null,
    extracted_by: opts.extractedBy,
  }));
  const { error } = await supabase
    .from("entity_mentions")
    .upsert(rows, { onConflict: "entity_uid,source_table,source_id,mention_type", ignoreDuplicates: true });
  if (error) {
    console.error("[writeEntityMentions] failed:", error);
    return 0;
  }
  return rows.length;
}
