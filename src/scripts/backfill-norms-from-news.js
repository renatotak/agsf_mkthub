/**
 * Phase 24F backfill — scan every row in agro_news for embedded norm
 * citations and upsert detected norms into regulatory_norms.
 *
 * Use case 1: one-off historical backfill after merging the extractor
 * (because sync-agro-news only runs the extractor on NEW inserts).
 *
 * Use case 2: dev/testing — after inserting a synthetic article into
 * agro_news, run this script to verify the extractor picks it up.
 *
 * Pure regex via the same lib used by sync-agro-news. No LLM.
 *
 * Usage:
 *   node --env-file=.env.local src/scripts/backfill-norms-from-news.js [--limit N] [--dry]
 */

const { Client } = require("pg");

// Inline the regex set so we don't have to TS-compile the lib in this script.
// Keep this in sync with src/lib/extract-norms-from-news.ts.

const NUM_PREFIX = "(?:n[ºo°.]\\s*)?";

const NORM_PATTERNS = [
  { pattern: new RegExp(`\\b(?:CNJ\\s+)?Provimento\\s+${NUM_PREFIX}(\\d{1,4}(?:[\\/.-]\\d{2,4})?)\\b`, "gi"), body: "CNJ", norm_type: "provimento" },
  { pattern: new RegExp(`\\b(?:CNJ|Conselho Nacional de Justiça)\\s+Resolução\\s+${NUM_PREFIX}(\\d{1,4}(?:[\\/.-]\\d{2,4})?)\\b`, "gi"), body: "CNJ", norm_type: "resolucao" },
  { pattern: new RegExp(`\\b(?:CNJ\\s+)?Recomendação\\s+${NUM_PREFIX}(\\d{1,4}(?:[\\/.-]\\d{2,4})?)\\b`, "gi"), body: "CNJ", norm_type: "recomendacao" },
  { pattern: new RegExp(`\\b(?:CMN|Conselho Monetário(?: Nacional)?)\\s+(?:Resolução|Resol\\.)\\s+${NUM_PREFIX}(\\d{1,4}(?:[\\/.-]\\d{2,4})?)\\b`, "gi"), body: "CMN", norm_type: "resolucao" },
  { pattern: new RegExp(`\\b(?:BCB|BACEN|Banco Central)\\s+Circular\\s+${NUM_PREFIX}(\\d{1,4}(?:[\\/.-]\\d{2,4})?)\\b`, "gi"), body: "BCB", norm_type: "circular" },
  { pattern: new RegExp(`\\b(?:CVM|Comissão de Valores Mobiliários)\\s+(?:Instrução|Resolução)\\s+${NUM_PREFIX}(\\d{1,4}(?:[\\/.-]\\d{2,4})?)\\b`, "gi"), body: "CVM", norm_type: "instrucao" },
  { pattern: new RegExp(`\\b(?:MAPA|Ministério da Agricultura)\\s+(?:Instrução Normativa|IN|Portaria)\\s+${NUM_PREFIX}(\\d{1,4}(?:[\\/.-]\\d{2,4})?)\\b`, "gi"), body: "MAPA", norm_type: "instrucao_normativa" },
  { pattern: new RegExp(`\\bLei\\s+${NUM_PREFIX}(\\d{1,2}\\.\\d{3}(?:[\\/-]\\d{2,4})?)\\b`, "gi"), body: "CONGRESSO", norm_type: "lei" },
  { pattern: new RegExp(`\\bLei\\s+Complementar\\s+${NUM_PREFIX}(\\d{1,3}(?:[\\/-]\\d{2,4})?)\\b`, "gi"), body: "CONGRESSO", norm_type: "lei_complementar" },
  { pattern: new RegExp(`\\bDecreto\\s+${NUM_PREFIX}(\\d{1,2}\\.\\d{3}(?:[\\/-]\\d{2,4})?)\\b`, "gi"), body: "PRES_REPUBLICA", norm_type: "decreto" },
  { pattern: new RegExp(`\\bMedida\\s+Provisória\\s+${NUM_PREFIX}(\\d{1,4}(?:[\\/-]\\d{2,4})?)\\b`, "gi"), body: "PRES_REPUBLICA", norm_type: "medida_provisoria" },
];

const AGRO_CONTEXT_PATTERN = /\bagroneg[óo]cio|\brura(?:l|is)\b|\bagr[íi]col|\bsafra\b|\bproduto[rs]e?s?\s+rura(?:l|is)|\bcooperativ|\bfazend|\bcpr\b|c[ée]dula de produto rural|\bfiagro|\bcra\b\s+(?:do\s+)?agr|\bcr[ée]dito\s+rural|\brecupera[çc][ãa]o\s+judicial.{0,80}(?:rura(?:l|is)|agro|produto[rs])|fal[êe]ncia.{0,80}(?:rura(?:l|is)|agro|produto[rs])/i;

function classifyImpact(text) {
  const t = text.toLowerCase();
  if (/recupera[çc][ãa]o judicial|fal[êe]ncia|cr[ée]dito rural|cpr|fiagro|patrim[ôo]nio rural/.test(t)) return "high";
  if (/registro|atualiza|prorrog|amplia|reduz|altera/.test(t)) return "medium";
  return "low";
}

function extractAffectedAreas(text) {
  const areas = [];
  const t = text.toLowerCase();
  if (/\bcpr\b|c[ée]dula de produto rural/.test(t)) areas.push("cpr");
  if (/fiagro/.test(t)) areas.push("fiagro");
  if (/cr[ée]dito rural/.test(t)) areas.push("credito_rural");
  if (/recupera[çc][ãa]o judicial|fal[êe]ncia/.test(t)) areas.push("risco");
  if (/cooperativa/.test(t)) areas.push("cooperativas");
  return areas.length > 0 ? areas : ["geral"];
}

function extract(article) {
  const text = `${article.title} ${article.summary || ""}`;
  if (!AGRO_CONTEXT_PATTERN.test(text)) return [];
  const seen = new Set();
  const candidates = [];
  for (const np of NORM_PATTERNS) {
    np.pattern.lastIndex = 0;
    let m;
    while ((m = np.pattern.exec(text)) !== null) {
      const number = m[1];
      const key = `${np.body}-${np.norm_type}-${number}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const matchIdx = m.index;
      const snippet = text.slice(Math.max(0, matchIdx - 80), Math.min(text.length, matchIdx + 160)).replace(/\s+/g, " ").trim();
      candidates.push({
        id: `news-${key.toLowerCase()}`,
        body: np.body,
        norm_type: np.norm_type,
        norm_number: number,
        title: `${np.body} ${np.norm_type === "provimento" ? "Provimento" : np.norm_type === "resolucao" ? "Resolução" : np.norm_type === "lei" ? "Lei" : np.norm_type === "circular" ? "Circular" : np.norm_type === "decreto" ? "Decreto" : np.norm_type === "medida_provisoria" ? "Medida Provisória" : np.norm_type === "lei_complementar" ? "Lei Complementar" : np.norm_type === "instrucao_normativa" ? "Instrução Normativa" : np.norm_type === "instrucao" ? "Instrução" : np.norm_type === "recomendacao" ? "Recomendação" : np.norm_type} ${number}`,
        summary: snippet.slice(0, 500),
        impact_level: classifyImpact(text),
        affected_areas: extractAffectedAreas(text),
      });
    }
  }
  return candidates;
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry");
  const limitIdx = args.indexOf("--limit");
  const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : 5000;

  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL not set in .env.local");
    process.exit(1);
  }
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();

  console.log(`=== Backfilling norms from agro_news (limit=${limit}, dry=${dryRun}) ===\n`);

  const { rows } = await c.query(
    "select id, title, summary, source_url, published_at from agro_news order by published_at desc limit $1",
    [limit],
  );
  console.log(`Scanning ${rows.length} articles...\n`);

  const upserts = [];
  let scanned = 0;
  let withHits = 0;

  for (const r of rows) {
    scanned++;
    const candidates = extract({ title: r.title, summary: r.summary, source_url: r.source_url });
    if (candidates.length > 0) {
      withHits++;
      console.log(`✓ [${r.id}] ${r.title.slice(0, 70)}`);
      for (const c of candidates) {
        console.log(`    → ${c.body} ${c.norm_type} ${c.norm_number}`);
        upserts.push({
          id: c.id,
          body: c.body,
          norm_type: c.norm_type,
          norm_number: c.norm_number,
          title: c.title,
          summary: c.summary,
          published_at: (r.published_at || new Date()).toISOString().slice(0, 10),
          effective_at: null,
          impact_level: c.impact_level,
          affected_areas: c.affected_areas,
          source_url: r.source_url,
        });
      }
    }
  }

  console.log(`\nScanned: ${scanned}`);
  console.log(`With hits: ${withHits}`);
  console.log(`Total norm candidates: ${upserts.length}`);

  if (upserts.length === 0) {
    console.log("No norms detected. Done.");
    await c.end();
    return;
  }

  if (dryRun) {
    console.log("DRY RUN — not writing.");
    await c.end();
    return;
  }

  // Upsert via the same shape sync-agro-news uses
  let inserted = 0;
  for (const row of upserts) {
    const { error } = await c.query(
      `insert into regulatory_norms (id, body, norm_type, norm_number, title, summary, published_at, effective_at, impact_level, affected_areas, source_url)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       on conflict (id) do update set
         title = excluded.title,
         summary = excluded.summary,
         impact_level = excluded.impact_level,
         affected_areas = excluded.affected_areas`,
      [row.id, row.body, row.norm_type, row.norm_number, row.title, row.summary, row.published_at, row.effective_at, row.impact_level, row.affected_areas, row.source_url],
    ).then(() => ({ error: null })).catch((e) => ({ error: e }));
    if (!error) inserted++;
  }
  console.log(`Upserted: ${inserted}/${upserts.length}`);

  await c.end();
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(2);
});
