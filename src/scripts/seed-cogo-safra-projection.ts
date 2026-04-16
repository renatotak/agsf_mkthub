/**
 * Seed COGO 1ª Projeção Safra 2026/2027 into macro_statistics.
 *
 * Reads the COGO Inteligência em Agronegócio XLSX from local files/,
 * parses:
 *   1. "Brasil resumo" — national totals (11 crops × 3 indicators)
 *   2. "Soja resumo" — per-UF breakdown for soybean
 *   3. "Brasil resumo UF" — per-UF breakdown for total grains
 *   4. Per-crop resumo sheets (Milho, Algodão, Arroz, Feijão, Trigo)
 *
 * Upserts into macro_statistics with source_id='cogo', category='projection',
 * confidentiality='agrisafe_confidential'.
 *
 * Usage:
 *   npx tsx --env-file=.env.local src/scripts/seed-cogo-safra-projection.ts [--dry-run]
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { logActivity } from "../lib/activity-log";
import * as XLSX from "xlsx";
import * as path from "path";

const XLSX_PATH = path.resolve(
  __dirname,
  "../../local files/1ª PROJEÇÃO SAFRA 2026-2027 BRASIL ABR26 - COGO INTELIGÊNCIA EM AGRONEGÓCIO.xlsx",
);

const DRY_RUN = process.argv.includes("--dry-run");

const SOURCE_ID = "cogo";
const CATEGORY = "projection";
const REFERENCE_DATE = "2026-04-15";
const PERIOD = "2026/27";
const PERIOD_PREV = "2025/26";
const BRAZILIAN_STATES = new Set([
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT",
  "PA", "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO",
]);

const BRAZILIAN_REGIONS = new Set([
  "NORTE", "NORDESTE", "SUDESTE", "SUL", "CENTRO-OESTE", "CENTRO OESTE",
]);

const CROP_MAP: Record<string, string> = {
  "GRÃOS TOTAL": "total_grains",
  "SOJA": "soybean",
  "MILHO TOTAL 3 SAFRAS": "corn",
  "MILHO TOTAL": "corn",
  "ARROZ": "rice",
  "TRIGO": "wheat",
  "ALGODÃO EM CAROÇO": "cotton",
  "ALGODÃO": "cotton",
  "FEIJÃO TOTAL 3 SAFRAS": "beans",
  "FEIJÃO TOTAL": "beans",
  "OUTROS GRÃOS": "other_grains",
  "CANA-DE-AÇÚCAR": "sugarcane",
  "CAFÉ": "coffee",
  "CAFÉ ": "coffee",
  "LARANJA": "orange",
  "SORGO": "sorghum",
  "AMENDOIM": "peanut",
  "AVEIA": "oats",
  "CEVADA": "barley",
  "CENTEIO": "rye",
  "CANOLA": "canola",
  "GIRASSOL": "sunflower",
  "GERGELIM": "sesame",
  "TRITICALE": "triticale",
};

const INDICATOR_MAP: Record<string, { indicator: string; unit: string }> = {
  "ÁREA": { indicator: "area_planted", unit: "thousand_hectares" },
  "PRODUÇÃO": { indicator: "production", unit: "thousand_tonnes" },
  "RENDIMENTO": { indicator: "yield", unit: "kg_per_hectare" },
  "PRODUTIVIDADE": { indicator: "yield", unit: "kg_per_hectare" },
};

interface MacroRow {
  source_id: string;
  category: string;
  commodity: string;
  region: string;
  indicator: string;
  value: number;
  unit: string;
  period: string;
  reference_date: string;
  metadata: Record<string, unknown>;
}

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

// ─── Parse "Brasil resumo" — national totals ─────────────────────────────────

function parseBrasilResumo(wb: XLSX.WorkBook): MacroRow[] {
  const ws = wb.Sheets["Brasil resumo"];
  if (!ws) return [];
  const data = XLSX.utils.sheet_to_json<(string | number | null)[]>(ws, { header: 1 });
  const rows: MacroRow[] = [];

  // xlsx strips leading empty columns, so: col0=CULTURA, col1=ITEM, col2=UNIDADES,
  // col3=SAFRA 2026/2027, col4=SAFRA 2025/2026
  let currentCrop = "";
  for (const row of data) {
    const cropCell = String(row[0] ?? "").trim();
    const dado = String(row[1] ?? "").trim();
    const projValue = row[3]; // Safra 2026/2027
    const prevValue = row[4]; // Safra 2025/2026

    if (dado === "ÁREA" || dado === "PRODUÇÃO" || dado === "RENDIMENTO") {
      if (cropCell) currentCrop = cropCell;
      const commodity = CROP_MAP[currentCrop];
      if (!commodity) continue;

      const ind = INDICATOR_MAP[dado];
      if (!ind) continue;

      const val = typeof projValue === "number" ? projValue : parseFloat(String(projValue));
      if (isNaN(val)) continue;

      const prev = typeof prevValue === "number" ? prevValue : parseFloat(String(prevValue));

      rows.push({
        source_id: SOURCE_ID,
        category: CATEGORY,
        commodity,
        region: "Brazil",
        indicator: ind.indicator,
        value: val,
        unit: ind.unit,
        period: PERIOD,
        reference_date: REFERENCE_DATE,
        metadata: {
          source_name: "COGO Inteligência em Agronegócio",
          projection_number: 1,
          safra: "2026/2027",
          previous_safra_value: isNaN(prev) ? null : prev,
          previous_safra: PERIOD_PREV,
        },
      });
    }
  }
  return rows;
}

// ─── Parse per-UF resumo sheets ──────────────────────────────────────────────
// Structure: col 1=REGIÃO/UF, col 2=Safra 2025/2026, col 3=Safra 2026/2027,
//            col 4=Var%, col 5=Produtividade 2025/26, col 6=Produtividade 2026/27,
//            col 7=Var%, col 8=Produção 2025/26, col 9=Produção 2026/27

function parseResumoUF(wb: XLSX.WorkBook, sheetName: string, commodity: string): MacroRow[] {
  const ws = wb.Sheets[sheetName];
  if (!ws) return [];
  const data = XLSX.utils.sheet_to_json<(string | number | null)[]>(ws, { header: 1 });
  const rows: MacroRow[] = [];

  // xlsx strips leading empty columns, so: col0=REGIÃO/UF, col1=Área prev, col2=Área proj,
  // col3=Var%, col4=Produtividade prev, col5=Produtividade proj, col6=Var%,
  // col7=Produção prev, col8=Produção proj, col9=Var%
  for (const row of data) {
    const uf = String(row[0] ?? "").trim();
    if (!uf) continue;

    const isState = BRAZILIAN_STATES.has(uf);
    const isRegion = BRAZILIAN_REGIONS.has(uf) || BRAZILIAN_REGIONS.has(uf.replace("-", " "));
    const isBrasil = uf === "BRASIL";
    if (!isState && !isRegion && !isBrasil) continue;
    if (isBrasil) continue; // already captured from Brasil resumo

    const region = isState ? `BR-${uf}` : uf;

    const indicators = [
      { col: 2, prevCol: 1, indicator: "area_planted", unit: "thousand_hectares" },
      { col: 5, prevCol: 4, indicator: "yield", unit: "kg_per_hectare" },
      { col: 8, prevCol: 7, indicator: "production", unit: "thousand_tonnes" },
    ];

    for (const ind of indicators) {
      const val = typeof row[ind.col] === "number" ? row[ind.col] as number : parseFloat(String(row[ind.col]));
      if (isNaN(val)) continue;
      const prev = typeof row[ind.prevCol] === "number" ? row[ind.prevCol] as number : parseFloat(String(row[ind.prevCol]));

      rows.push({
        source_id: SOURCE_ID,
        category: CATEGORY,
        commodity,
        region,
        indicator: ind.indicator,
        value: val,
        unit: ind.unit,
        period: PERIOD,
        reference_date: REFERENCE_DATE,
        metadata: {
          source_name: "COGO Inteligência em Agronegócio",
          projection_number: 1,
          safra: "2026/2027",
          previous_safra_value: isNaN(prev) ? null : prev,
          previous_safra: PERIOD_PREV,
        },
      });
    }
  }
  return rows;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`[seed-cogo] reading ${XLSX_PATH}`);
  const wb = XLSX.readFile(XLSX_PATH);

  const allRows: MacroRow[] = [];

  // 1. Brasil resumo — national totals
  const brasilRows = parseBrasilResumo(wb);
  console.log(`[seed-cogo] Brasil resumo: ${brasilRows.length} rows`);
  allRows.push(...brasilRows);

  // 2. Per-UF resumo sheets
  const ufSheets: [string, string][] = [
    ["Brasil resumo UF", "total_grains"],
    ["Soja resumo", "soybean"],
    ["Milho 1a resumo", "corn_1st"],
    ["Milho 2a resumo", "corn_2nd"],
    ["Milho 3a resumo", "corn_3rd"],
    ["Algodão resumo", "cotton"],
    ["Arroz resumo", "rice"],
    ["Feijão 1a resumo", "beans_1st"],
    ["Feijão 2a resumo", "beans_2nd"],
    ["Feijão 3a resumo", "beans_3rd"],
    ["Trigo resumo", "wheat"],
  ];

  for (const [sheet, commodity] of ufSheets) {
    const ufRows = parseResumoUF(wb, sheet, commodity);
    console.log(`[seed-cogo] ${sheet}: ${ufRows.length} rows`);
    allRows.push(...ufRows);
  }

  console.log(`[seed-cogo] total rows: ${allRows.length}`);

  if (DRY_RUN) {
    console.log("[seed-cogo] --dry-run, printing first 5 rows:");
    for (const r of allRows.slice(0, 5)) {
      console.log(`  ${r.commodity} | ${r.region} | ${r.indicator} | ${r.value} ${r.unit} | ${r.period}`);
    }
    console.log("[seed-cogo] done (dry run)");
    return;
  }

  const supabase = initSupabase();

  // Upsert in batches of 200
  const BATCH = 200;
  let upserted = 0;
  let errors = 0;

  for (let i = 0; i < allRows.length; i += BATCH) {
    const batch = allRows.slice(i, i + BATCH);
    const { error } = await supabase
      .from("macro_statistics")
      .upsert(batch, { onConflict: "source_id,commodity,region,indicator,period" });

    if (error) {
      console.error(`[seed-cogo] batch ${i}-${i + batch.length} error:`, error.message);
      errors++;
    } else {
      upserted += batch.length;
    }
  }

  console.log(`[seed-cogo] upserted ${upserted} rows, ${errors} batch errors`);

  await logActivity(supabase, {
    action: "seed_cogo_safra_projection",
    source: "script",
    source_kind: "backfill",
    target_table: "macro_statistics",
    record_count: upserted,
    details: {
      file: "1ª PROJEÇÃO SAFRA 2026-2027 BRASIL ABR26 - COGO INTELIGÊNCIA EM AGRONEGÓCIO.xlsx",
      period: PERIOD,
      reference_date: REFERENCE_DATE,
      total_rows: allRows.length,
      errors,
    },
  });

  console.log("[seed-cogo] done");
}

main().catch((err) => {
  console.error("[seed-cogo] uncaught:", err);
  process.exit(1);
});
