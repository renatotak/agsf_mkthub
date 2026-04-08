// Check geocoding + role coverage for cnpj_establishments.
// Run: node --env-file=.env.local src/scripts/check-establishments-coverage.js
const { Client } = require("pg");

async function main() {
  const c = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  // Geocoding coverage
  const geo = await c.query(`
    select
      count(*)::int as total,
      count(latitude)::int as with_geo,
      count(*) filter (where geo_precision='address')::int as p_address,
      count(*) filter (where geo_precision='cep')::int as p_cep,
      count(*) filter (where geo_precision='municipality')::int as p_muni
    from cnpj_establishments`);
  const g = geo.rows[0];
  console.log("Geocoding coverage:");
  console.log(`  total:        ${g.total}`);
  console.log(`  with coords:  ${g.with_geo} (${Math.round(g.with_geo / g.total * 100)}%)`);
  console.log(`  precision=address:      ${g.p_address}`);
  console.log(`  precision=cep:          ${g.p_cep}`);
  console.log(`  precision=municipality: ${g.p_muni}`);

  // Distinct cnpj_raiz roots already cached
  const roots = await c.query(`
    select count(distinct cnpj_raiz)::int as n from cnpj_establishments`);
  console.log(`\nDistinct CNPJ roots cached: ${roots.rows[0].n}`);

  // How many of those overlap with industry role
  const overlap = await c.query(`
    select count(distinct ce.cnpj_raiz)::int as n
    from cnpj_establishments ce
    join legal_entities le on le.tax_id = ce.cnpj_raiz
    join entity_roles er on er.entity_uid = le.entity_uid and er.role_type='industry'`);
  console.log(`  ↳ that are industries: ${overlap.rows[0].n}`);

  // Industries still missing from cache
  const missing = await c.query(`
    select count(*)::int as n
    from entity_roles er
    join legal_entities le on le.entity_uid = er.entity_uid
    where er.role_type='industry'
      and le.tax_id is not null
      and not exists (
        select 1 from cnpj_establishments ce where ce.cnpj_raiz = le.tax_id
      )`);
  console.log(`\nIndustries with NO cached establishments yet: ${missing.rows[0].n}`);

  // Sample of those missing (for sanity check)
  const sample = await c.query(`
    select le.tax_id, le.display_name, le.legal_name
    from entity_roles er
    join legal_entities le on le.entity_uid = er.entity_uid
    where er.role_type='industry'
      and le.tax_id is not null
      and not exists (select 1 from cnpj_establishments ce where ce.cnpj_raiz = le.tax_id)
    limit 5`);
  if (sample.rows.length) {
    console.log("\nSample missing industries:");
    for (const r of sample.rows) {
      console.log(`  ${r.tax_id} ${r.display_name || r.legal_name}`);
    }
  }

  await c.end();
}

main().catch(e => { console.error(e); process.exit(1); });
