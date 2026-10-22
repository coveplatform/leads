# ADR-0001: Embedded Postgres (PGlite) for zero-config demo mode

**Status:** accepted

The blueprint requires "a fully functional seeded demo mode" when credentials are
missing, *and* real Postgres migrations with RLS. Rather than maintain a second
in-memory repository, DIG runs the same SQL on PGlite (Postgres compiled to WASM)
when `DATABASE_URL` is unset. One `Db` interface (`src/lib/db/client.ts`) wraps
PGlite or node-postgres. Tests use PGlite in memory, so CI needs no service.

Consequences: PGlite is single-connection (transactions are serialised), its
data directory does not persist on serverless hosts (deploys must set
`DATABASE_URL`), and `pgcrypto` is unavailable (we use core `gen_random_uuid()`).
