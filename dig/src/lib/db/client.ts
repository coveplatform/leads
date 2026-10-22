/**
 * One tiny query interface with two backends:
 *  - PGlite (embedded Postgres, WASM) for zero-config demo mode and tests
 *  - node-postgres for Supabase / any hosted Postgres (DATABASE_URL)
 * Everything above this file speaks SQL with $1.. parameters and never cares
 * which backend answers.
 */
import path from "node:path";

export interface QueryResult<T> {
  rows: T[];
  rowCount: number;
}

export interface Db {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<QueryResult<T>>;
  /** Run a multi-statement SQL script (migrations). */
  exec(text: string): Promise<void>;
  /** Run fn inside a transaction (serialised on PGlite). */
  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
  close(): Promise<void>;
  readonly backend: "pglite" | "postgres";
}

type Backend = "memory" | "file" | "postgres";

function resolveBackend(): Backend {
  const explicit = process.env.DIG_DB as Backend | undefined;
  if (explicit === "memory" || explicit === "file" || explicit === "postgres") return explicit;
  return process.env.DATABASE_URL ? "postgres" : "file";
}

async function createPglite(dataDir: string | undefined): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { pg_trgm } = await import("@electric-sql/pglite/contrib/pg_trgm");
  const pg = await PGlite.create({
    dataDir,
    extensions: { pg_trgm },
  });
  // PGlite is single-connection; serialise transactions through one chain.
  let chain: Promise<unknown> = Promise.resolve();
  const wrap = (runner: {
    query: (t: string, p?: unknown[]) => Promise<{ rows: unknown[]; affectedRows?: number }>;
    exec: (t: string) => Promise<unknown>;
  }): Db => ({
    backend: "pglite",
    async query<T>(text: string, params: unknown[] = []) {
      const res = await runner.query(text, params);
      return { rows: res.rows as T[], rowCount: res.affectedRows ?? res.rows.length };
    },
    async exec(text: string) {
      await runner.exec(text);
    },
    async transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
      const run = async () => pg.transaction(async (tx) => fn(wrap(tx)));
      const p = chain.then(run, run);
      chain = p.catch(() => undefined);
      return p;
    },
    async close() {
      await pg.close();
    },
  });
  return wrap(pg);
}

async function createPostgres(url: string): Promise<Db> {
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: url, max: 5 });
  const wrap = (runner: {
    query: (t: string, p?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number | null }>;
  }): Db => ({
    backend: "postgres",
    async query<T>(text: string, params: unknown[] = []) {
      const res = await runner.query(text, params);
      return { rows: res.rows as T[], rowCount: res.rowCount ?? res.rows.length };
    },
    async exec(text: string) {
      await runner.query(text);
    },
    async transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const out = await fn(wrap(client));
        await client.query("COMMIT");
        return out;
      } catch (e) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw e;
      } finally {
        client.release();
      }
    },
    async close() {
      await pool.end();
    },
  });
  return wrap(pool);
}

export async function createDb(): Promise<Db> {
  const backend = resolveBackend();
  if (backend === "postgres") {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DIG_DB=postgres requires DATABASE_URL");
    return createPostgres(url);
  }
  if (backend === "memory") return createPglite(undefined);
  const dir = process.env.PGLITE_DATA_DIR || "./.data/pglite";
  return createPglite(path.resolve(process.cwd(), dir));
}

// Process-wide singleton (survives Next.js dev hot reloads via globalThis).
const g = globalThis as unknown as { __digDb?: Promise<Db> };

export function getDb(): Promise<Db> {
  if (!g.__digDb) g.__digDb = createDb();
  return g.__digDb;
}

/** Tests: replace the singleton with a fresh in-memory database. */
export async function resetDbForTests(): Promise<Db> {
  if (g.__digDb) await (await g.__digDb).close().catch(() => undefined);
  process.env.DIG_DB = "memory";
  g.__digDb = createDb();
  return g.__digDb;
}
