/**
 * One-off backfill: scan existing agro_news rows, match against
 * legal_entities via entity-matcher, write entity_mentions rows.
 *
 * Usage:  npx tsx --env-file=.env.local src/scripts/backfill-news-mentions.ts
 *
 * Idempotent: the underlying upsert uses ON CONFLICT DO NOTHING on
 * (entity_uid, source_table, source_id, mention_type).
 */
import { createClient } from "@supabase/supabase-js";
import { loadMatchableEntities, matchEntitiesInText, writeEntityMentions } from "../lib/entity-matcher";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env");
  }
  const supabase = createClient(url, key);

  console.log("[backfill] loading matchable entities...");
  const entities = await loadMatchableEntities(supabase);
  console.log(`[backfill] loaded ${entities.length} entities`);

  console.log("[backfill] loading agro_news...");
  const { data: news, error } = await supabase
    .from("agro_news")
    .select("id, title, summary")
    .order("published_at", { ascending: false })
    .limit(10000);
  if (error) throw error;
  console.log(`[backfill] scanning ${news?.length ?? 0} articles`);

  let scanned = 0;
  let articlesWithHits = 0;
  let totalMentions = 0;
  for (const n of news ?? []) {
    scanned++;
    const text = `${n.title ?? ""} ${n.summary ?? ""}`;
    const hits = matchEntitiesInText(text, entities);
    if (hits.length > 0) {
      articlesWithHits++;
      totalMentions += await writeEntityMentions(supabase, {
        entityUids: hits,
        sourceTable: "agro_news",
        sourceId: n.id,
        mentionType: "mentioned",
        extractedBy: "backfill_regex_v1",
      });
    }
    if (scanned % 50 === 0) console.log(`[backfill] ${scanned}/${news?.length}...`);
  }

  console.log(`[backfill] done: scanned=${scanned}, articles_with_hits=${articlesWithHits}, mentions_written=${totalMentions}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
