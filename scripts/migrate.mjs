// Applies migrations/*.sql in filename order, once each, recording them in
// schema_migrations. Each file runs in its own transaction.
//
//   node scripts/migrate.mjs            apply pending migrations
//   node scripts/migrate.mjs --dry-run  list pending migrations, change nothing
//
// Migrations 001–010 predate this runner and are idempotent, so on a database
// that already has them they re-run as no-ops and get recorded.

import "dotenv/config";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "@neondatabase/serverless";

const dryRun = process.argv.includes("--dry-run");
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "migrations");

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}
if (typeof WebSocket === "undefined") {
  // The Pool (needed for multi-statement files) talks to Neon over WebSockets.
  console.error("Node 22+ is required (global WebSocket).");
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();

try {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  const applied = new Set((await client.query("SELECT name FROM schema_migrations")).rows.map((r) => r.name));
  const files = (await readdir(dir)).filter((f) => /^\d+_.*\.sql$/.test(f)).sort();
  const pending = files.filter((f) => !applied.has(f));

  if (pending.length === 0) {
    console.log("Up to date.");
  } else if (dryRun) {
    console.log("Pending:\n" + pending.map((f) => `  ${f}`).join("\n"));
  } else {
    for (const file of pending) {
      const sqlText = await readFile(path.join(dir, file), "utf8");
      try {
        await client.query("BEGIN");
        await client.query(sqlText);
        await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
        await client.query("COMMIT");
        console.log(`✓ ${file}`);
      } catch (err) {
        await client.query("ROLLBACK");
        console.error(`✗ ${file}: ${err.message}`);
        process.exitCode = 1;
        break;
      }
    }
  }
} finally {
  client.release();
  await pool.end();
}
