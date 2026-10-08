// System checks for /api/health and the hourly cron: the database answers,
// every migration has run, and every active business's Twilio number still
// points its voice + SMS webhooks at us.

import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import twilio from "twilio";
import { config } from "../config.js";
import { ping, getAppliedMigrations, getAllBusinesses } from "../db.js";
import { webhookUrls } from "./twilio-numbers.js";

const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "migrations");

export async function pendingMigrations() {
  const files = (await readdir(migrationsDir)).filter((f) => /^\d+_.*\.sql$/.test(f)).sort();
  const applied = new Set(await getAppliedMigrations());
  return files.filter((f) => !applied.has(f));
}

// Active numbers whose webhooks don't point at BASE_URL (or that Twilio doesn't have).
export async function webhookProblems() {
  if (!config.twilio.accountSid || !config.twilio.authToken) return { skipped: "Twilio not configured", problems: [] };
  const client = twilio(config.twilio.accountSid, config.twilio.authToken);
  const { smsUrl, voiceUrl } = webhookUrls();
  const owned = await client.incomingPhoneNumbers.list({ limit: 1000 });
  const byNumber = new Map(owned.map((n) => [n.phoneNumber, n]));

  const problems = [];
  for (const b of await getAllBusinesses()) {
    if (!b.twilio_from_number) continue;
    const n = byNumber.get(b.twilio_from_number);
    if (!n) problems.push(`${b.name}: ${b.twilio_from_number} is not on the Twilio account`);
    else if (n.voiceUrl !== voiceUrl || n.smsUrl !== smsUrl) {
      problems.push(`${b.name}: ${b.twilio_from_number} webhooks point at ${n.voiceUrl || "nothing"} / ${n.smsUrl || "nothing"}`);
    }
  }
  return { problems };
}

export async function runHealthChecks() {
  const checks = {};
  try {
    await ping();
    checks.db = { ok: true };
  } catch (err) {
    checks.db = { ok: false, error: err.message };
  }

  if (checks.db.ok) {
    try {
      const pending = await pendingMigrations();
      checks.migrations = { ok: pending.length === 0, pending };
    } catch (err) {
      // migrations/ not bundled into the function (see vercel.json includeFiles)
      checks.migrations = err.code === "ENOENT"
        ? { ok: true, skipped: "migrations folder not deployed" }
        : { ok: false, error: err.message };
    }
  }

  try {
    const { skipped, problems } = await webhookProblems();
    checks.twilio = skipped ? { ok: true, skipped } : { ok: problems.length === 0, problems };
  } catch (err) {
    checks.twilio = { ok: false, error: err.message };
  }

  const ok = Object.values(checks).every((c) => c.ok);
  return { ok, checks };
}
