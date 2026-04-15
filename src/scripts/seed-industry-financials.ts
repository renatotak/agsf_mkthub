/**
 * Seed `industry_financials` from the AgriSafe proprietary dataset.
 *
 * Source file: local files/Kynetec/26-0211 faturamento industria.xlsx
 * (the file lives in the Kynetec folder for convenience; the data
 * itself is AgriSafe proprietary — NOT Kynetec-sourced — and lands
 * at the `agrisafe_confidential` tier).
 *
 * Behavior:
 *   1. For each of the 23 companies in the panel, resolve to an
 *      `industries.id` slug. The 11 curated names are mapped directly;
 *      the remaining 12 are inserted as new minimal `industries` rows
 *      (slug + display name + segment=['defensivos']) so the Diretório
 *      de Indústrias also lists them.
 *   2. Upsert one row per (industry_id, fiscal_year) into
 *      `industry_financials`, carrying revenue_usd_millions (2020-2025)
 *      and market_share_pct (2018-2021) where the panel reports them.
 *
 * Usage:
 *   npx tsx src/scripts/seed-industry-financials.ts
 */

import { createClient } from "@supabase/supabase-js";
// eslint-disable-next-line @typescript-eslint/no-require-imports
require("dotenv").config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const SOURCE = "agrisafe-proprietary";
const SOURCE_NOTE = "Painel defensivos — compilação AgriSafe (26-0211)";
const CONFIDENTIALITY = "agrisafe_confidential";

// ── Panel rows ────────────────────────────────────────────────────────────
// One entry per Kynetec-folder row. `slug` is the `industries.id` (existing
// or to-be-created). `ensureIndustry` controls whether to upsert a minimal
// `industries` row when the slug does not already exist.
//
// Revenue years: [2020, 2021, 2022, 2023, 2024, 2025]  (US$ millions)
// Market share years: [2018, 2019, 2020, 2021]  (fraction 0-1, converted to % on insert)

type Row = {
  slug: string;
  displayName: string;
  revenue: [number | null, number | null, number | null, number | null, number | null, number | null];
  marketShare: [number | null, number | null, number | null, number | null];
  ensureIndustry?: boolean;   // true = insert into `industries` if missing
  segment?: string[];
};

const REVENUE_YEARS = [2020, 2021, 2022, 2023, 2024, 2025] as const;
const MS_YEARS = [2018, 2019, 2020, 2021] as const;

const PANEL: Row[] = [
  { slug: "syngenta",      displayName: "Syngenta",         revenue: [2558, 3252, 4875, 3500, 3476, 3339], marketShare: [0.195, 0.205, 0.215, 0.222] },
  { slug: "bayer",         displayName: "Bayer",            revenue: [1681, 1918, 3000, 2335, 2300, 2405], marketShare: [0.158, 0.165, 0.142, 0.131] },
  { slug: "corteva",       displayName: "Corteva",          revenue: [1316, 1677, 2200, 1530, 1480, 1780], marketShare: [0.115, 0.105, 0.111, 0.114] },
  { slug: "basf",          displayName: "BASF",             revenue: [1205, 1276, 1700, 1360, 1451, null], marketShare: [0.097, 0.108, 0.101, 0.087] },
  { slug: "upl",           displayName: "UPL",              revenue: [1066, 1379, 1678, 1313, 1060, 1130], marketShare: [0.094, 0.083, 0.090, 0.094] },
  { slug: "fmc",           displayName: "FMC",              revenue: [1077, 1210, 1450,  960, 1015,  931], marketShare: [0.089, 0.090, 0.091, 0.083] },
  { slug: "adama",         displayName: "ADAMA",            revenue: [ 664,  770, 1145,  850,  701,  707], marketShare: [0.057, 0.053, 0.056, 0.053] },
  { slug: "ihara",         displayName: "Ihara",            revenue: [ 526,  761, 1140,  750,  735,  810], marketShare: [0.040, 0.042, 0.044, 0.052] },
  { slug: "sumitomo",      displayName: "Sumitomo",         revenue: [ 530,  700,  985,  691,  681,  627], marketShare: [0.058, 0.053, 0.045, 0.048] },
  { slug: "albaugh",       displayName: "Albaugh + Rotam",  revenue: [ 263,  381,  600,  405,  510,  550], marketShare: [0.025, 0.022, 0.022, 0.026] },

  // Not in the curated catalog — inserted as minimal `industries` rows.
  { slug: "rainbow",       displayName: "Rainbow",          revenue: [null, null, null,  220,  320,  350], marketShare: [null, null, null, null], ensureIndustry: true, segment: ["defensivos"] },
  { slug: "tecnomyl",      displayName: "Tecnomyl",         revenue: [null, null,  400,  350,  475,  600], marketShare: [null, null, null, null], ensureIndustry: true, segment: ["defensivos"] },

  { slug: "ourofino",      displayName: "Ouro Fino",        revenue: [ 267,  313,  417,  321,  406,  362], marketShare: [0.016, 0.016, 0.022, 0.021] },

  { slug: "helm",          displayName: "Helm",             revenue: [ 102,  147,  218,  153,  140, null], marketShare: [0.013, 0.014, 0.009, 0.010], ensureIndustry: true, segment: ["defensivos"] },

  { slug: "sipcam",        displayName: "Sipcam",           revenue: [  75,   98,  141,  128,  120,  123], marketShare: [0.007, 0.007, 0.006, 0.007] },

  { slug: "alta",          displayName: "Alta",             revenue: [  52,   89,  120,   90,  110, null], marketShare: [0.007, 0.006, 0.004, 0.006], ensureIndustry: true, segment: ["defensivos"] },
  { slug: "ccab",          displayName: "CCAB",             revenue: [ 122,  102,  230,  161,  289, null], marketShare: [null, null, 0.010, 0.007], ensureIndustry: true, segment: ["defensivos"] },
  { slug: "gowan",         displayName: "Gowan",            revenue: [null, null, null, null,   35, null], marketShare: [null, null, null, null], ensureIndustry: true, segment: ["defensivos"] },

  { slug: "nortox",        displayName: "Nortox",           revenue: [ 274,  316,  500,  410,  450,  500], marketShare: [0.028, 0.028, 0.023, 0.022] },

  { slug: "agriconnection",displayName: "Agriconnection",   revenue: [  60,  123,  267,  283,  315,  376], marketShare: [null, null, 0.005, 0.008], ensureIndustry: true, segment: ["defensivos"] },
  { slug: "cropchem",      displayName: "Cropchem",         revenue: [  34,   75,  154,  116,  170,  200], marketShare: [0.001, 0.003, 0.003, 0.005], ensureIndustry: true, segment: ["defensivos"] },
  { slug: "chds",          displayName: "CHDs",             revenue: [null,   50,  230,  161, null, null], marketShare: [null, null, null, null], ensureIndustry: true, segment: ["defensivos"] },
  { slug: "prentiss",      displayName: "Prentiss",         revenue: [null,   15,   57,   40,   30, null], marketShare: [null, null, null, 0.001], ensureIndustry: true, segment: ["defensivos"] },
];

async function ensureIndustryRows() {
  const toEnsure = PANEL.filter((r) => r.ensureIndustry);
  if (toEnsure.length === 0) return;

  const rows = toEnsure.map((r) => ({
    id: r.slug,
    name: r.displayName.toUpperCase(),
    name_display: r.displayName,
    segment: r.segment || ["defensivos"],
  }));

  const { error } = await supabase
    .from("industries")
    .upsert(rows, { onConflict: "id", ignoreDuplicates: false });

  if (error) throw error;
  console.log(`✓ Ensured ${rows.length} non-curated industries rows`);
}

async function seedFinancials() {
  const upserts: Record<string, unknown>[] = [];

  for (const r of PANEL) {
    // Revenue rows
    for (let i = 0; i < REVENUE_YEARS.length; i++) {
      const rev = r.revenue[i];
      if (rev == null) continue;
      upserts.push({
        industry_id: r.slug,
        fiscal_year: REVENUE_YEARS[i],
        revenue_usd_millions: rev,
        market_share_pct: null,
        source: SOURCE,
        source_note: SOURCE_NOTE,
        confidentiality: CONFIDENTIALITY,
      });
    }
    // Market-share rows (may overlap revenue year 2020/2021 — merged below)
    for (let i = 0; i < MS_YEARS.length; i++) {
      const ms = r.marketShare[i];
      if (ms == null) continue;
      upserts.push({
        industry_id: r.slug,
        fiscal_year: MS_YEARS[i],
        revenue_usd_millions: null,
        market_share_pct: Math.round(ms * 10000) / 100, // 0.195 → 19.50
        source: SOURCE,
        source_note: SOURCE_NOTE,
        confidentiality: CONFIDENTIALITY,
      });
    }
  }

  // Merge rows keyed by (industry_id, fiscal_year) — same year can carry
  // both revenue and market share, and we want one row per year per source.
  const merged = new Map<string, Record<string, unknown>>();
  for (const row of upserts) {
    const key = `${row.industry_id}|${row.fiscal_year}|${row.source}`;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, { ...row });
    } else {
      if (row.revenue_usd_millions != null) existing.revenue_usd_millions = row.revenue_usd_millions;
      if (row.market_share_pct != null)     existing.market_share_pct = row.market_share_pct;
    }
  }

  const final = Array.from(merged.values());
  const { error } = await supabase
    .from("industry_financials")
    .upsert(final, { onConflict: "industry_id,fiscal_year,source" });

  if (error) throw error;
  console.log(`✓ Upserted ${final.length} rows into industry_financials`);
}

(async () => {
  try {
    await ensureIndustryRows();
    await seedFinancials();
    console.log("Done.");
  } catch (err) {
    console.error("Seed failed:", err);
    process.exit(1);
  }
})();
