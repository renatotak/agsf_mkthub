/**
 * Phase 7a — Seed SICOR-eligible financial institutions.
 *
 * Reads BACEN's SICOR lista de IFs CSV, resolves entity_uid for each CNPJ,
 * upserts into financial_institutions with is_sicor_eligible=true,
 * and adds entity_roles rows.
 *
 * CSV: semicolon-delimited, Latin-1 encoding.
 * Columns: CNPJ_IF;NOME_IF;SEGMENTO_IF
 *
 * Usage:
 *   npx tsx --env-file=.env.local src/scripts/seed-sicor-ifs.ts [--dry-run] [--limit N]
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { ensureLegalEntityUid } from "../lib/entities";
import { logActivity } from "../lib/activity-log";
import * as fs from "fs";
import * as path from "path";

const CSV_PATH = path.resolve(
  __dirname,
  "../../local files/financial institutions/SICOR_LISTA_IFS.csv",
);

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const limitIdx = args.indexOf("--limit");
const LIMIT = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : Infinity;

// ─── Segment → institution_type mapping ──────────────────────────────────────

function mapSegment(seg: string): string {
  const s = seg.toUpperCase().trim();
  if (s.includes("COOPERATIV")) return "cooperative_bank";
  if (s.includes("DESENVOLVIMENTO") || s.includes("FOMENTO")) return "development_bank";
  if (s.includes("BANCO COOPERATIVO")) return "cooperative_bank";
  // BANCO PÚBLICO, BANCO PRIVADO, SOCIEDADE DE CRÉDITO
  return "bank";
}

// ─── CSV parser ──────────────────────────────────────────────────────────────

interface SicorRow {
  cnpj: string;
  name: string;
  segment: string;
}

function parseCSV(): SicorRow[] {
  const raw = fs.readFileSync(CSV_PATH, "latin1");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  // Skip header (starts with #)
  const dataLines = lines.filter((l) => !l.startsWith("#"));
  return dataLines.map((line) => {
    const [cnpj, name, segment] = line.split(";");
    return {
      cnpj: (cnpj || "").replace(/\D/g, "").padStart(8, "0").slice(0, 8),
      name: (name || "").trim(),
      segment: (segment || "").trim(),
    };
  }).filter((r) => r.cnpj && r.cnpj !== "00000000" || r.name);
}

// ─── Main ────────────────────────────────────────────────────────────────────

function initSupabase(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function main() {
  const rows = parseCSV();
  console.log(`=== Seed SICOR-eligible IFs ===`);
  console.log(`Source: ${CSV_PATH}`);
  console.log(`Rows: ${rows.length}`);
  console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "LIVE"}`);
  if (LIMIT < Infinity) console.log(`Limit: ${LIMIT}`);
  console.log();

  if (DRY_RUN) {
    const segments = new Map<string, number>();
    for (const r of rows) {
      const s = r.segment || "(empty)";
      segments.set(s, (segments.get(s) || 0) + 1);
    }
    console.log("Segment breakdown:");
    for (const [s, c] of [...segments.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${s}: ${c} → ${s === "(empty)" ? "bank" : mapSegment(s)}`);
    }
    console.log(`\nSample rows:`);
    for (const r of rows.slice(0, 10)) {
      console.log(`  CNPJ=${r.cnpj} NAME=${r.name} SEG=${r.segment}`);
    }
    return;
  }

  const sb = initSupabase();
  let upserted = 0;
  let rolesAdded = 0;
  let entityResolved = 0;
  let errors = 0;

  const toProcess = rows.slice(0, LIMIT);

  for (let i = 0; i < toProcess.length; i++) {
    const row = toProcess[i];
    if (i > 0 && i % 50 === 0) {
      console.log(`  [${i}/${toProcess.length}] upserted=${upserted} roles=${rolesAdded} errors=${errors}`);
    }

    try {
      // 1. Resolve entity_uid
      const entityUid = await ensureLegalEntityUid(sb, row.cnpj, {
        legalName: row.name,
        displayName: row.name,
      });
      if (entityUid) entityResolved++;

      const instType = row.segment ? mapSegment(row.segment) : "bank";

      // 2. Upsert into financial_institutions (by cnpj)
      const { error: fiError } = await sb
        .from("financial_institutions")
        .upsert(
          {
            name: row.name,
            cnpj: row.cnpj,
            institution_type: instType,
            is_sicor_eligible: true,
            sicor_segment: row.segment || null,
            entity_uid: entityUid,
          },
          { onConflict: "cnpj" },
        );

      if (fiError) {
        // If upsert fails (no unique on cnpj yet), try insert-or-skip
        const { data: existing } = await sb
          .from("financial_institutions")
          .select("id")
          .eq("cnpj", row.cnpj)
          .maybeSingle();

        if (existing) {
          // Update existing row
          await sb
            .from("financial_institutions")
            .update({
              is_sicor_eligible: true,
              sicor_segment: row.segment || null,
              entity_uid: entityUid,
            })
            .eq("cnpj", row.cnpj);
        } else {
          // Insert fresh
          const { error: insErr } = await sb
            .from("financial_institutions")
            .insert({
              name: row.name,
              cnpj: row.cnpj,
              institution_type: instType,
              is_sicor_eligible: true,
              sicor_segment: row.segment || null,
              entity_uid: entityUid,
            });
          if (insErr) {
            console.error(`  ERR insert ${row.cnpj} ${row.name}: ${insErr.message}`);
            errors++;
            continue;
          }
        }
      }
      upserted++;

      // 3. Add entity_roles if we have entity_uid
      if (entityUid) {
        // Use 'financial_institution' role — specific type is on the FI table
        const { error: roleErr } = await sb
          .from("entity_roles")
          .insert({ entity_uid: entityUid, role_type: "financial_institution" })
          .select()
          .maybeSingle();

        if (!roleErr) rolesAdded++;
        // Ignore duplicate key errors (already has the role)
      }
    } catch (e: any) {
      console.error(`  ERR ${row.cnpj} ${row.name}: ${e.message}`);
      errors++;
    }
  }

  console.log(`\n=== Done ===`);
  console.log(`  Processed: ${toProcess.length}`);
  console.log(`  Entities resolved: ${entityResolved}`);
  console.log(`  FI rows upserted: ${upserted}`);
  console.log(`  Entity roles added: ${rolesAdded}`);
  console.log(`  Errors: ${errors}`);

  // Log activity
  await logActivity(sb, {
    action: "upsert",
    source: "seed-sicor-ifs",
    source_kind: "backfill",
    target_table: "financial_institutions",
    summary: `SICOR seed: ${upserted} FIs upserted, ${entityResolved} entities resolved, ${rolesAdded} roles added`,
    metadata: {
      total_rows: toProcess.length,
      entities_resolved: entityResolved,
      roles_added: rolesAdded,
      errors,
    },
  });

  console.log("  Activity logged.");
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
