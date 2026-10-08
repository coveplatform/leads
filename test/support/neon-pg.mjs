// Test-only stand-in for @neondatabase/serverless, backed by a plain local
// Postgres (E2E_PG_URL) through pg. Loaded by neon-pg-register.mjs.
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.E2E_PG_URL });

export function neon() {
  return async (strings, ...values) => {
    let text = strings[0];
    values.forEach((_, i) => { text += `$${i + 1}${strings[i + 1]}`; });
    return (await pool.query(text, values.map((v) => (v === undefined ? null : v)))).rows;
  };
}

// scripts/migrate.mjs uses Pool; ignore its connection string and use ours.
export class Pool extends pg.Pool {
  constructor() { super({ connectionString: process.env.E2E_PG_URL }); }
}

export async function closeShim() {
  await pool.end();
}
