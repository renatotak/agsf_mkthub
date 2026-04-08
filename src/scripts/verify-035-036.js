// Verify migrations 035 + 036 are fully applied (Phase 24B).
// Run: node --env-file=.env.local src/scripts/verify-035-036.js
const { Client } = require("pg");

async function main() {
  const c = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  // 035 — cnpj_establishments columns
  const est = await c.query(`
    select column_name from information_schema.columns
    where table_schema='public' and table_name='cnpj_establishments'
    order by ordinal_position`);
  const estCols = est.rows.map(r => r.column_name);
  console.log("cnpj_establishments columns:", estCols.length);
  const required = ["cnpj","cnpj_raiz","ordem","matriz_filial","razao_social","nome_fantasia","situacao_cadastral","logradouro","numero","complemento","bairro","cep","municipio","uf","latitude","longitude","geo_precision","email","telefone","source","fetched_at","raw_response"];
  const missing = required.filter(c => !estCols.includes(c));
  console.log(missing.length ? "  MISSING:" + missing.join(",") : "  ✓ all required columns present");
  const estCount = await c.query("select count(*)::int as n from cnpj_establishments");
  console.log("  rows:", estCount.rows[0].n);

  // 035 — company_research.analysis_type
  const cr = await c.query(`
    select column_name from information_schema.columns
    where table_schema='public' and table_name='company_research' and column_name='analysis_type'`);
  console.log("company_research.analysis_type:", cr.rows.length ? "✓ present" : "✗ MISSING");

  // 036 — analysis_lenses table + seed
  const lensCols = await c.query(`
    select column_name from information_schema.columns
    where table_schema='public' and table_name='analysis_lenses'
    order by ordinal_position`);
  console.log("analysis_lenses columns:", lensCols.rows.map(r => r.column_name).join(", "));
  const lenses = await c.query("select id, label_pt, is_builtin, enabled, length(system_prompt) as prompt_len from analysis_lenses order by id");
  console.log("analysis_lenses rows:", lenses.rows.length);
  for (const r of lenses.rows) {
    console.log(`  - ${r.id}: ${r.label_pt} (builtin=${r.is_builtin}, enabled=${r.enabled}, prompt_len=${r.prompt_len})`);
  }

  // 036 — trigger
  const trig = await c.query(`
    select trigger_name from information_schema.triggers
    where event_object_table='analysis_lenses'`);
  console.log("triggers on analysis_lenses:", trig.rows.map(r => r.trigger_name).join(", ") || "(none)");

  // Industries with role for backfill scope
  const inds = await c.query(`
    select count(*)::int as n
    from entity_roles er
    join legal_entities le on le.entity_uid = er.entity_uid
    where er.role_type='industry' and le.tax_id is not null`);
  console.log("\nbackfill scope (role_type=industry, tax_id present):", inds.rows[0].n);

  await c.end();
}

main().catch(e => { console.error(e); process.exit(1); });
