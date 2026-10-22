import "./_env.mts";
import fs from "node:fs";
import path from "node:path";
// Demo mode only: wipe the embedded database directory.
if (process.env.DATABASE_URL) {
  console.error(
    "Refusing to reset: DATABASE_URL is set. Drop the schema yourself for a hosted database.",
  );
  process.exit(1);
}
const dir = path.resolve(process.cwd(), process.env.PGLITE_DATA_DIR || "./.data/pglite");
fs.rmSync(dir, { recursive: true, force: true });
console.log(`removed ${dir}`);
