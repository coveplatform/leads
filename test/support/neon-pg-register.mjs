// node --import ./test/support/neon-pg-register.mjs <script>
// Swaps @neondatabase/serverless for the pg-backed shim. Requires E2E_PG_URL.
import { register } from "node:module";

if (!process.env.E2E_PG_URL) throw new Error("E2E_PG_URL is required for the local Postgres shim");
process.env.DATABASE_URL = "postgresql://shim@neon-pg-shim.invalid/e2e"; // anything non-empty; the shim ignores it
register("./neon-pg-loader.mjs", import.meta.url);
