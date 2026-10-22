import fs from "node:fs";
import path from "node:path";
// Minimal .env loader so scripts behave like `next dev` without extra deps.
for (const f of [".env.local", ".env"]) {
  const p = path.resolve(process.cwd(), f);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]!] === undefined)
      process.env[m[1]!] = m[2]!.replace(/^["']|["']$/g, "");
  }
}
