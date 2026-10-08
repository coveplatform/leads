// The owner's dashboard API: everything under /api/me/*.

import express from "express";
import { config } from "../config.js";
import { requireAuth } from "../middleware.js";
import { startLead } from "../services/leads.js";
import {
  getBusinessByUserId,
  getUserById,
  getRecentLeadsByBusinessId,
  getLeadByIdAndBusiness,
  getMessagesByLeadId,
  markLeadCalled,
  setLeadOutcome,
  updateBusiness,
} from "../db.js";
import { getIntegrationConfig } from "../integrations.js";
import { normalizePhone } from "../phone.js";

const router = express.Router();

router.use("/api/me", requireAuth);

// Resolve the signed-in owner's business, or answer 404 and return null.
async function ownBusiness(req, res) {
  const business = await getBusinessByUserId(req.userId);
  if (!business) res.status(404).json({ ok: false, error: "No business found" });
  return business;
}

router.get("/api/me/business", async (req, res) => {
  try {
    const business = await getBusinessByUserId(req.userId);
    const user = await getUserById(req.userId);
    return res.json({ ok: true, business: business || null, user });
  } catch (err) {
    console.error("Get business error:", err);
    return res.status(500).json({ ok: false, error: "Could not fetch business" });
  }
});

router.put("/api/me/business", async (req, res) => {
  try {
    const business = await ownBusiness(req, res);
    if (!business) return;

    const { name, bookingLink, avgJobValue } = req.body || {};
    const updates = {};
    if (name !== undefined) updates.name = name || business.name;
    if (bookingLink !== undefined) updates.bookingLink = bookingLink || null;
    if (avgJobValue !== undefined) {
      const v = avgJobValue === null || avgJobValue === "" ? null : Number(avgJobValue);
      if (v !== null && (!Number.isFinite(v) || v < 0)) {
        return res.status(400).json({ ok: false, error: "Invalid average job value" });
      }
      updates.avgJobValue = v;
    }

    await updateBusiness(business.id, updates);
    return res.json({ ok: true });
  } catch (err) {
    console.error("Update business error:", err);
    return res.status(500).json({ ok: false, error: "Could not update business" });
  }
});

router.get("/api/me/leads", async (req, res) => {
  try {
    const business = await getBusinessByUserId(req.userId);
    if (!business) return res.json({ ok: true, leads: [] });
    const daysParam = req.query.days;
    const days = daysParam === "all" ? null : (Number(daysParam) || 7);
    const leads = await getRecentLeadsByBusinessId(business.id, days);
    return res.json({ ok: true, leads });
  } catch (err) {
    console.error("Get leads error:", err);
    return res.status(500).json({ ok: false, error: "Could not fetch leads" });
  }
});

router.get("/api/me/leads/:leadId/messages", async (req, res) => {
  try {
    const business = await ownBusiness(req, res);
    if (!business) return;
    const owned = await getLeadByIdAndBusiness(req.params.leadId, business.id);
    if (!owned) return res.status(404).json({ ok: false, error: "Lead not found" });
    const messages = await getMessagesByLeadId(req.params.leadId);
    return res.json({ ok: true, messages });
  } catch (err) {
    console.error("Get messages error:", err);
    return res.status(500).json({ ok: false, error: "Could not fetch messages" });
  }
});

router.post("/api/me/leads/:leadId/mark-called", async (req, res) => {
  try {
    const business = await ownBusiness(req, res);
    if (!business) return;
    const result = await markLeadCalled(req.params.leadId, business.id);
    if (!result) return res.status(404).json({ ok: false, error: "Lead not found" });
    return res.json({ ok: true });
  } catch (err) {
    console.error("Mark called error:", err);
    return res.status(500).json({ ok: false, error: "Could not mark lead" });
  }
});

// Lead outcome: 'won' | 'lost' | null (clears).
router.post("/api/me/leads/:leadId/outcome", async (req, res) => {
  try {
    const business = await ownBusiness(req, res);
    if (!business) return;

    const { outcome, jobValue } = req.body || {};
    if (outcome !== null && !["won", "lost"].includes(outcome)) {
      return res.status(400).json({ ok: false, error: "outcome must be 'won', 'lost', or null" });
    }
    const value = jobValue === undefined || jobValue === null || jobValue === ""
      ? null
      : Number(jobValue);
    if (value !== null && (!Number.isFinite(value) || value < 0)) {
      return res.status(400).json({ ok: false, error: "Invalid job value" });
    }

    const updated = await setLeadOutcome(req.params.leadId, business.id, outcome, value);
    if (!updated) return res.status(404).json({ ok: false, error: "Lead not found" });
    return res.json({ ok: true, lead: updated });
  } catch (err) {
    console.error("Set outcome error:", err);
    return res.status(500).json({ ok: false, error: "Could not update outcome" });
  }
});

router.put("/api/me/flow", async (req, res) => {
  try {
    const business = await ownBusiness(req, res);
    if (!business) return;

    const { flowConfig } = req.body || {};
    if (!flowConfig || !Array.isArray(flowConfig.steps) || flowConfig.steps.length === 0) {
      return res.status(400).json({ ok: false, error: "flowConfig with at least one step is required" });
    }

    if (flowConfig.booking && typeof flowConfig.booking === "object") {
      flowConfig.booking = {
        enabled: !!flowConfig.booking.enabled,
        slots: Math.min(3, Math.max(1, Number(flowConfig.booking.slots) || 2)),
        prompt: String(flowConfig.booking.prompt || "").slice(0, 200) || undefined,
      };
    }
    // Instant quotes are parked; never persist a quote setup.
    delete flowConfig.quote_spec;

    await updateBusiness(business.id, { flowConfig });
    return res.json({ ok: true });
  } catch (err) {
    console.error("Update flow error:", err);
    return res.status(500).json({ ok: false, error: "Could not update flow" });
  }
});

router.put("/api/me/notifications", async (req, res) => {
  try {
    const business = await ownBusiness(req, res);
    if (!business) return;

    const { notifyPhone, notifyEmail, webhookUrl, operatingHours } = req.body || {};
    const updates = {};
    if (notifyPhone !== undefined) {
      const normalized = normalizePhone(notifyPhone, config.defaultCountryCode);
      if (!normalized) return res.status(400).json({ ok: false, error: "Invalid phone number" });
      updates.ownerNotifyPhone = normalized;
    }
    if (notifyEmail !== undefined) updates.ownerNotifyEmail = notifyEmail || null;
    if (operatingHours !== undefined) updates.operatingHours = operatingHours;
    if (webhookUrl !== undefined) {
      updates.integrations = { ...getIntegrationConfig(business), completion_webhook_url: webhookUrl || null };
    }

    await updateBusiness(business.id, updates);
    return res.json({ ok: true });
  } catch (err) {
    console.error("Update notifications error:", err);
    return res.status(500).json({ ok: false, error: "Could not update settings" });
  }
});

// Forwarding health from the heartbeat (last_inbound_call_at).
const FORWARDING_STALE_DAYS = 30;

router.get("/api/me/forwarding-status", async (req, res) => {
  try {
    const business = await ownBusiness(req, res);
    if (!business) return;

    const verified = !!business.forwarding_verified;
    const lastCallAt = business.last_inbound_call_at || null;
    const daysSince = lastCallAt ? (Date.now() - new Date(lastCallAt).getTime()) / 86400000 : null;

    let health = "not_set_up";
    if (verified && daysSince != null && daysSince <= FORWARDING_STALE_DAYS) {
      health = "live";          // a forwarded call landed recently — confirmed working
    } else if (verified) {
      health = "verified";      // worked before, but quiet — prompt a re-test
    }

    return res.json({ ok: true, forwarding_verified: verified, last_call_at: lastCallAt, health });
  } catch (err) {
    console.error("[forwarding-status] error:", err);
    return res.status(500).json({ ok: false, error: "Could not check status" });
  }
});

// Texts the first question to the owner's own phone, simulating a missed call,
// so they can try the flow without carrier forwarding set up.
router.post("/api/me/send-test-lead", async (req, res) => {
  try {
    if (!config.twilio.accountSid || !config.twilio.authToken) {
      return res.status(503).json({ ok: false, error: "SMS not configured" });
    }
    const business = await ownBusiness(req, res);
    if (!business) return;
    if (!business.owner_notify_phone) {
      return res.status(400).json({ ok: false, error: "No phone number on file — add one in Settings first" });
    }
    if (!business.twilio_from_number) {
      return res.status(400).json({ ok: false, error: "Cove number not provisioned yet" });
    }

    const phone = normalizePhone(business.owner_notify_phone, config.defaultCountryCode);
    const { status } = await startLead({
      business,
      phone,
      message: "[Test] Simulated missed call",
      systemNote: "📞 Test missed call (simulated)",
      skipDedupe: true, // owner testing their own number
    });
    if (status === "opted_out") {
      return res.status(400).json({ ok: false, error: "Your phone has opted out (STOP) of this number" });
    }

    console.log(`[send-test-lead] sent to ${phone} for business ${business.id}`);
    return res.json({ ok: true });
  } catch (err) {
    console.error("[send-test-lead] error:", err);
    return res.status(500).json({ ok: false, error: "Could not send test — " + (err.message || "unknown error") });
  }
});

export default router;
