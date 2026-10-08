// Kris's admin panel API.

import express from "express";
import { requireAdmin } from "../middleware.js";
import {
  getBusinessesOverview,
  getRecentLeadsAllBusinesses,
  getOptOuts,
  deactivateBusiness,
  reactivateBusiness,
} from "../db.js";
import { log } from "../log.js";

const router = express.Router();

router.use("/api/admin", requireAdmin);

const PUBLIC_FIELDS = [
  "id", "name", "industry", "twilio_from_number", "owner_notify_phone", "is_active",
  "forwarding_verified", "last_inbound_call_at", "leads_this_month", "last_lead_at",
  "deactivated_at", "release_number_after", "created_at",
];

router.get("/api/admin/businesses", async (_req, res) => {
  try {
    const rows = await getBusinessesOverview();
    const businesses = rows.map((b) => Object.fromEntries(PUBLIC_FIELDS.map((k) => [k, b[k] ?? null])));
    return res.json({ ok: true, businesses, count: businesses.length });
  } catch (error) {
    log.error("[admin/businesses] error:", error);
    return res.status(500).json({ ok: false, error: "Internal server error" });
  }
});

// Taking a business off (or back on). Off starts the 30-day grace before its
// Twilio number can be released (scripts/deactivate-client.mjs --release-due).
router.post("/api/admin/businesses/:id/active", async (req, res) => {
  try {
    const active = req.body?.active;
    if (typeof active !== "boolean") return res.status(400).json({ ok: false, error: "active must be true or false" });
    const business = active ? await reactivateBusiness(req.params.id) : await deactivateBusiness(req.params.id);
    if (!business) return res.status(404).json({ ok: false, error: "Business not found" });
    log.info(`[admin] ${business.name} set active=${active}`);
    return res.json({ ok: true, is_active: business.is_active });
  } catch (error) {
    log.error("[admin/active] error:", error);
    return res.status(500).json({ ok: false, error: "Internal server error" });
  }
});

router.get("/api/admin/leads", async (_req, res) => {
  try {
    const leads = await getRecentLeadsAllBusinesses(200);
    return res.json({ ok: true, leads, count: leads.length });
  } catch (error) {
    log.error("[admin/leads] error:", error);
    return res.status(500).json({ ok: false, error: "Internal server error" });
  }
});

router.get("/api/admin/opt-outs", async (_req, res) => {
  try {
    return res.json({ ok: true, optOuts: await getOptOuts() });
  } catch (error) {
    log.error("[admin/opt-outs] error:", error);
    return res.status(500).json({ ok: false, error: "Internal server error" });
  }
});

export default router;
