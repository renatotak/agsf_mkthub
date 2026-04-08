// Quick connection test for the Supabase Postgres pooler.
// Run with: node --env-file=.env.local C:/tmp/test-db-conn.js
const { Client } = require("pg");

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }
  console.log("Connecting...");
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  try {
    await client.connect();
    const r = await client.query("select current_database() as db, current_user as user, version() as ver");
    console.log("✓ Connected:");
    console.log("  database:", r.rows[0].db);
    console.log("  user:    ", r.rows[0].user);
    console.log("  version: ", r.rows[0].ver.split(",")[0]);
    // List how many tables exist in public schema
    const t = await client.query("select count(*)::int as n from information_schema.tables where table_schema='public'");
    console.log("  public tables:", t.rows[0].n);
    // Check if our target tables already exist
    const ex = await client.query(
      "select table_name from information_schema.tables where table_schema='public' and table_name in ('cnpj_establishments','analysis_lenses')",
    );
    console.log("  migrations 035/036 tables present:", ex.rows.map(r => r.table_name).join(", ") || "(none)");
  } catch (e) {
    console.error("✗ Connection failed:", e.message);
    process.exit(2);
  } finally {
    await client.end();
  }
}

main();
