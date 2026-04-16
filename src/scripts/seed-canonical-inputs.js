#!/usr/bin/env node
/**
 * Phase 5a — Seed culture_canonical_inputs from the CSV extracted
 * from Ivan's AMIS soybean report.
 *
 * Usage:
 *   node --env-file=.env.local src/scripts/seed-canonical-inputs.js
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const supabase = createClient(supabaseUrl, supabaseKey);

// Parse CSV
const csvPath = resolve(__dirname, "../data/culture-canonical-inputs.csv");
const raw = readFileSync(csvPath, "utf-8");
const lines = raw.trim().split("\n");
const headers = lines[0].split(",");

const rows = lines.slice(1).map((line) => {
  const vals = line.split(",");
  const obj = {};
  headers.forEach((h, i) => {
    const v = (vals[i] || "").trim();
    obj[h] = v === "" ? null : v;
  });
  return obj;
});

console.log(`Parsed ${rows.length} rows from CSV`);

// Resolve industry_entity_uid from the industries table (has name_display)
async function resolveIndustryUids(rows) {
  const { data: industries } = await supabase
    .from("industries")
    .select("id, name_display, entity_uid")
    .not("entity_uid", "is", null);

  const map = new Map();
  for (const ind of industries || []) {
    const nd = (ind.name_display || "").toLowerCase();
    map.set(nd, ind.entity_uid);
  }

  for (const row of rows) {
    if (!row.industry_name) continue;
    const key = row.industry_name.toLowerCase();
    // Exact match
    if (map.has(key)) {
      row.industry_entity_uid = map.get(key);
      continue;
    }
    // Partial match: CSV "Bayer" matches "bayer cropscience"
    for (const [nd, uid] of map) {
      if (nd.startsWith(key) || nd.includes(key)) {
        row.industry_entity_uid = uid;
        break;
      }
    }
  }
}

// Try linking to AGROFIT industry_products by product_name
async function linkAgrofitProducts(rows) {
  const names = [...new Set(rows.map((r) => r.product_name))];
  const { data: products } = await supabase
    .from("industry_products")
    .select("id, product_name")
    .in("product_name", names);

  const map = new Map();
  for (const p of products || []) {
    map.set(p.product_name, p.id);
  }

  for (const row of rows) {
    const pid = map.get(row.product_name);
    if (pid) row.agrofit_product_id = pid;
  }
  console.log(`  Linked ${rows.filter((r) => r.agrofit_product_id).length}/${rows.length} to AGROFIT products`);
}

async function main() {
  await resolveIndustryUids(rows);
  console.log(`  Resolved ${rows.filter((r) => r.industry_entity_uid).length}/${rows.length} industry UIDs`);

  await linkAgrofitProducts(rows);

  // Upsert
  const upsertRows = rows.map((r) => ({
    culture: r.culture,
    category: r.category,
    product_name: r.product_name,
    active_ingredient: r.active_ingredient,
    purpose: r.purpose,
    industry_name: r.industry_name,
    industry_entity_uid: r.industry_entity_uid || null,
    region: r.region || null,
    rank: r.rank ? parseInt(r.rank) : null,
    market_share_pct: r.market_share_pct ? parseFloat(r.market_share_pct) : null,
    cost_usd_ha: r.cost_usd_ha ? parseFloat(r.cost_usd_ha) : null,
    source: r.source || "AMIS 19/20",
    agrofit_product_id: r.agrofit_product_id || null,
  }));

  const { data, error } = await supabase
    .from("culture_canonical_inputs")
    .upsert(upsertRows, { onConflict: "culture,category,product_name" })
    .select("id");

  if (error) {
    console.error("Upsert error:", error.message);
    process.exit(1);
  }

  console.log(`✓ Upserted ${data.length} canonical input rows`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
