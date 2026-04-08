// Apply a single SQL migration file via the Supabase pooler.
// Usage: node --env-file=.env.local src/scripts/apply-migration.js <migration-filename>
//
// Examples:
//   node --env-file=.env.local src/scripts/apply-migration.js 037_register_phase24d_scrapers.sql
//
// The script reads src/db/migrations/<filename>, executes it as a single
// statement against the configured DATABASE_URL pooler connection, and
// reports row counts. Idempotent migrations (IF NOT EXISTS / ON CONFLICT)
// are safe to re-run; non-idempotent ones are not — read the migration
// before running.

const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

async function main() {
  const filename = process.argv[2];
  if (!filename) {
    console.error("Usage: node --env-file=.env.local src/scripts/apply-migration.js <filename>");
    process.exit(1);
  }

  const migrationPath = path.join(__dirname, "..", "db", "migrations", filename);
  if (!fs.existsSync(migrationPath)) {
    console.error(`Migration not found: ${migrationPath}`);
    process.exit(1);
  }

  const sql = fs.readFileSync(migrationPath, "utf-8");

  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL not set in .env.local");
    process.exit(1);
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  console.log(`Connecting to database...`);
  await client.connect();

  console.log(`Applying ${filename} (${sql.length} bytes)...`);
  try {
    const result = await client.query(sql);
    if (Array.isArray(result)) {
      console.log(`✓ Executed ${result.length} statement(s)`);
      result.forEach((r, i) => {
        if (r.command) console.log(`  ${i + 1}. ${r.command} — rowCount: ${r.rowCount ?? "—"}`);
      });
    } else {
      console.log(`✓ Executed: command=${result.command || "?"} rowCount=${result.rowCount ?? "—"}`);
    }
  } catch (e) {
    console.error(`✗ Migration failed: ${e.message}`);
    if (e.position) console.error(`  position: ${e.position}`);
    process.exit(2);
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(3);
});
