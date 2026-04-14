/**
 * Backfill: link event organizers (organizer_cnpj) to legal_entities + entity_mentions.
 *
 * For every event with organizer_cnpj:
 *   1. ensureLegalEntityUid() — idempotent upsert into legal_entities
 *   2. writeEntityMentions() — upsert into entity_mentions with mention_type='organizer'
 *
 * Usage:
 *   npx tsx --env-file=.env.local src/scripts/backfill-event-organizers.ts [--dry-run] [--limit N]
 */

import { createClient } from "@supabase/supabase-js";
import { ensureLegalEntityUid } from "../lib/entities";
import { writeEntityMentions } from "../lib/entity-matcher";
import { logActivity } from "../lib/activity-log";

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const limitIdx = args.indexOf("--limit");
const LIMIT = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : 9999;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function main() {
  console.log(`[backfill-event-organizers] start${DRY_RUN ? " (DRY RUN)" : ""}`);

  const { data: events, error } = await supabase
    .from("events")
    .select("id, name, organizer_cnpj")
    .not("organizer_cnpj", "is", null)
    .limit(LIMIT);

  if (error) {
    console.error("Failed to query events:", error.message);
    process.exit(1);
  }

  if (!events || events.length === 0) {
    console.log("No events with organizer_cnpj found.");
    return;
  }

  console.log(`Found ${events.length} events with organizer_cnpj`);

  let linked = 0;
  let failed = 0;
  let skipped = 0;

  for (const ev of events) {
    const cnpj = ev.organizer_cnpj as string;
    console.log(`  [${ev.id}] ${ev.name} → CNPJ ${cnpj}`);

    if (DRY_RUN) {
      skipped++;
      continue;
    }

    const entityUid = await ensureLegalEntityUid(supabase, cnpj);
    if (!entityUid) {
      console.error(`    ✗ Failed to resolve entity for CNPJ ${cnpj}`);
      failed++;
      continue;
    }

    const written = await writeEntityMentions(supabase, {
      entityUids: [entityUid],
      sourceTable: "events",
      sourceId: ev.id,
      mentionType: "organizer",
      extractedBy: "backfill:event-organizers",
    });

    if (written > 0) {
      console.log(`    ✓ Linked to entity ${entityUid}`);
      linked++;
    } else {
      console.log(`    – Already linked or failed`);
      skipped++;
    }
  }

  const summary = `Linked ${linked} of ${events.length} event organizers (${skipped} skipped, ${failed} failed)${DRY_RUN ? " [DRY RUN]" : ""}`;
  console.log(`\n${summary}`);

  if (!DRY_RUN) {
    await logActivity(supabase, {
      action: "upsert",
      target_table: "entity_mentions",
      source: "backfill:event-organizers",
      source_kind: "backfill",
      summary,
      metadata: { total: events.length, linked, skipped, failed },
    });
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
