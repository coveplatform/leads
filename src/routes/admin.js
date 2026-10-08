// Kris's admin panel API.

import express from "express";
import { requireAdmin } from "../middleware.js";
import { getAllBusinesses, getAllLeadsWithBusiness } from "../db.js";

const router = express.Router();

router.use("/api/admin", requireAdmin);

router.get("/api/admin/businesses", async (_req, res) => {
  try {
    const businesses = await getAllBusinesses();
    return res.json({ ok: true, businesses, count: businesses.length });
  } catch (error) {
    console.error("[admin/businesses] error:", error);
    return res.status(500).json({ ok: false, error: "Internal server error" });
  }
});

router.get("/api/admin/leads", async (_req, res) => {
  try {
    const leads = await getAllLeadsWithBusiness();
    return res.json({ ok: true, leads, count: leads.length });
  } catch (error) {
    console.error("[admin/leads] error:", error);
    return res.status(500).json({ ok: false, error: "Internal server error" });
  }
});

export default router;
