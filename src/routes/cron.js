// Scheduled jobs (vercel.json crons) and the public health check.
// Vercel cron calls send `Authorization: Bearer <CRON_SECRET>`.

import express from "express";
import { randomBytes } from "node:crypto";
import { dispatchDue } from "../services/scheduler.js";
import { runForwardingCheck } from "../services/forwarding.js";
import { runHealthChecks } from "../services/health.js";
import { alertKris } from "../integrations.js";
import { rateLimitExceeded } from "../db.js";
import { runWithId, log } from "../log.js";

const router = express.Router();

function requireCron(req, res, next) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.authorization || "";
  const ok = secret
    ? auth === `Bearer ${secret}`
    : /vercel-cron/i.test(req.headers["user-agent"] || ""); // no secret set: Vercel's own scheduler only
  if (!ok) return res.status(401).json({ ok: false, error: "Unauthorized" });
  next();
}

const cronJob = (name, fn) => [requireCron, (req, res) =>
  runWithId(`cron-${name}-${randomBytes(3).toString("hex")}`, async () => {
    try {
      const result = await fn();
      log.info(`[cron/${name}]`, JSON.stringify(result));
      res.json({ ok: true, ...result });
    } catch (err) {
      log.error(`[cron/${name}] failed:`, err);
      res.status(500).json({ ok: false, error: err.message });
    }
  }),
];

// Every 5 minutes: send due follow-ups.
router.get("/api/cron/dispatch", ...cronJob("dispatch", () => dispatchDue()));

// Daily: warn owners whose forwarding seems to have stopped.
router.get("/api/cron/forwarding-check", ...cronJob("forwarding-check", () => runForwardingCheck()));

// Hourly: full health check; texts Kris on failure (at most every 6 hours).
router.get("/api/cron/health", ...cronJob("health", async () => {
  const result = await runHealthChecks();
  if (!result.ok) {
    const quiet = await rateLimitExceeded("health_alert", "kris", 6 * 3600, 1).catch(() => false);
    if (!quiet) {
      const lines = Object.entries(result.checks)
        .filter(([, c]) => !c.ok)
        .map(([name, c]) => `${name}: ${c.error || (c.pending || c.problems || []).join("; ")}`);
      await alertKris("Health check failed", lines.join("\n"));
    }
  }
  return result;
}));

// Public: is Cove up? Detail stays coarse; the cron above carries the specifics.
let cached = null;
router.get("/api/health", async (_req, res) => {
  if (!cached || Date.now() - cached.at > 60_000) {
    const result = await runHealthChecks();
    cached = {
      at: Date.now(),
      body: {
        ok: result.ok,
        db: result.checks.db.ok,
        migrations_pending: result.checks.migrations?.pending?.length ?? null,
        twilio_webhooks_ok: result.checks.twilio.ok,
      },
    };
  }
  res.status(cached.body.ok ? 200 : 503).json(cached.body);
});

export default router;
