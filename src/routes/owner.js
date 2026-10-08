// The owner's dashboard API: everything under /api/me/*.

import express from "express";
import { config } from "../config.js";
import { requireAuth } from "../middleware.js";
import { startLead } from "../services/leads.js";
import { confirmBooking, declineBooking, setOutcome } from "../services/lead-actions.js";
import {
  getBusinessByUserId,
  getUserById,
  getRecentLeadsByBusinessId,
  getLeadsChangedSince,
  searchLeadsByPhone,
  getLeadByIdAndBusiness,
  getMessagesByLeadId,
  getPendingScheduled,
  markLeadCalled,
  updateBusiness,
  updateBusinessExtras,
  sql,
} from "../db.js";
import { getIntegrationConfig, getNotificationConfig } from "../integrations.js";
import { normalizePhone } from "../phone.js";
import { getSettings, mergeSettings } from "../settings.js";
import { getFlowConfig } from "../flow-engine.js";
import { localParts, zonedDate, businessTimezone, localDayAfter } from "../time.js";
import { forwardingCodes, dialLink } from "../services/forwarding.js";

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

// ?since=<iso> → leads created or changed since then (the 30s poll)
// ?q=<digits>  → search by phone number
// ?days=N|all  → recent leads (default 7)
router.get("/api/me/leads", async (req, res) => {
  try {
    const business = await getBusinessByUserId(req.userId);
    if (!business) return res.json({ ok: true, leads: [] });
    const serverTime = new Date().toISOString();
    let leads;
    if (req.query.since && !Number.isNaN(Date.parse(req.query.since))) {
      leads = await getLeadsChangedSince(business.id, new Date(req.query.since).toISOString());
    } else if (req.query.q && String(req.query.q).replace(/\D/g, "").length >= 3) {
      leads = await searchLeadsByPhone(business.id, req.query.q);
    } else {
      const daysParam = req.query.days;
      const days = daysParam === "all" ? null : (Number(daysParam) || 7);
      leads = await getRecentLeadsByBusinessId(business.id, days);
    }
    return res.json({ ok: true, leads, serverTime });
  } catch (err) {
    console.error("Get leads error:", err);
    return res.status(500).json({ ok: false, error: "Could not fetch leads" });
  }
});

// One lead with its conversation and any follow-ups still to send.
router.get("/api/me/leads/:leadId", async (req, res) => {
  try {
    const business = await ownBusiness(req, res);
    if (!business) return;
    const lead = await getLeadByIdAndBusiness(req.params.leadId, business.id);
    if (!lead) return res.status(404).json({ ok: false, error: "Lead not found" });
    const [messages, scheduled] = await Promise.all([
      getMessagesByLeadId(lead.id),
      getPendingScheduled(lead.id).catch(() => []),
    ]);
    return res.json({ ok: true, lead, messages, scheduled });
  } catch (err) {
    console.error("Get lead error:", err);
    return res.status(500).json({ ok: false, error: "Could not fetch lead" });
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

    const lead = await getLeadByIdAndBusiness(req.params.leadId, business.id);
    if (!lead) return res.status(404).json({ ok: false, error: "Lead not found" });
    const updated = await setOutcome(business, lead, outcome, value);
    return res.json({ ok: true, lead: updated });
  } catch (err) {
    console.error("Set outcome error:", err);
    return res.status(500).json({ ok: false, error: "Could not update outcome" });
  }
});

// Confirm or decline a proposed booking (same as the owner replying Y / N).
router.post("/api/me/leads/:leadId/booking", async (req, res) => {
  try {
    const business = await ownBusiness(req, res);
    if (!business) return;
    const { action } = req.body || {};
    if (!["confirm", "decline"].includes(action)) {
      return res.status(400).json({ ok: false, error: "action must be 'confirm' or 'decline'" });
    }
    const lead = await getLeadByIdAndBusiness(req.params.leadId, business.id);
    if (!lead) return res.status(404).json({ ok: false, error: "Lead not found" });
    try {
      const result = action === "confirm"
        ? await confirmBooking(business, lead, { via: "dashboard" })
        : await declineBooking(business, lead, { via: "dashboard" });
      return res.json({ ok: true, lead: result.lead });
    } catch (err) {
      return res.status(409).json({ ok: false, error: err.message });
    }
  } catch (err) {
    console.error("Booking action error:", err);
    return res.status(500).json({ ok: false, error: "Could not update booking" });
  }
});

// "This week" (Monday onwards, in the business's timezone): calls caught,
// customers who replied, bookings, jobs won. Exact counts, no estimates.
router.get("/api/me/summary", async (req, res) => {
  try {
    const business = await ownBusiness(req, res);
    if (!business) return;
    const tz = businessTimezone(business);
    const now = new Date();
    const today = localParts(tz, now);
    const monday = localDayAfter(tz, now, -((today.weekday + 6) % 7));
    const weekStart = zonedDate(tz, monday.year, monday.month, monday.day, 0, 0).toISOString();

    const [row] = await sql`
      SELECT
        COUNT(*) FILTER (WHERE COALESCE(source, '') <> 'test')::int AS leads,
        COUNT(*) FILTER (WHERE COALESCE(source, '') <> 'test' AND EXISTS (
          SELECT 1 FROM messages m WHERE m.lead_id = leads.id AND m.direction = 'inbound'))::int AS replied,
        COUNT(*) FILTER (WHERE booking_status IN ('proposed', 'confirmed'))::int AS booked,
        COUNT(*) FILTER (WHERE outcome = 'won')::int AS won
      FROM leads
      WHERE business_id = ${business.id} AND created_at >= ${weekStart}::timestamptz
    `;
    return res.json({ ok: true, weekStart, week: row });
  } catch (err) {
    console.error("Summary error:", err);
    return res.status(500).json({ ok: false, error: "Could not load summary" });
  }
});

// The flow in use (the business's own, or its industry template).
router.get("/api/me/flow", async (req, res) => {
  try {
    const business = await ownBusiness(req, res);
    if (!business) return;
    return res.json({ ok: true, flow: getFlowConfig(business) });
  } catch (err) {
    console.error("Get flow error:", err);
    return res.status(500).json({ ok: false, error: "Could not load flow" });
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

// Alerts + follow-up settings in one place for the dashboard.
router.get("/api/me/settings", async (req, res) => {
  try {
    const business = await ownBusiness(req, res);
    if (!business) return;
    const nc = getNotificationConfig(business);
    return res.json({
      ok: true,
      settings: getSettings(business),
      notifications: { sms: nc.sms.enabled, email: nc.email.enabled, urgent_only: nc.urgentOnly },
      review_link: business.review_link || null,
      forwarding: business.twilio_from_number
        ? { codes: forwardingCodes(business.twilio_from_number), link: dialLink(forwardingCodes(business.twilio_from_number).noAnswer) }
        : null,
    });
  } catch (err) {
    console.error("Get settings error:", err);
    return res.status(500).json({ ok: false, error: "Could not load settings" });
  }
});

// Body: { missed_call_alert?, followups?: { kind: { enabled?, body? } },
//         notifications?: { sms?, email?, urgent_only? }, review_link? }
router.put("/api/me/settings", async (req, res) => {
  try {
    const business = await ownBusiness(req, res);
    if (!business) return;
    const body = req.body || {};

    const n = body.notifications;
    if (n && typeof n === "object") {
      const current = getIntegrationConfig(business);
      const notifications = { ...(current.notifications || {}) };
      if (typeof n.sms === "boolean") notifications.sms = { ...(notifications.sms || {}), enabled: n.sms };
      if (typeof n.email === "boolean") notifications.email = { ...(notifications.email || {}), enabled: n.email };
      if (typeof n.urgent_only === "boolean") notifications.urgent_only = n.urgent_only;
      await updateBusiness(business.id, { integrations: { ...current, notifications } });
    }

    let reviewLink;
    if (body.review_link !== undefined) {
      const link = String(body.review_link || "").trim();
      if (link && !/^https:\/\/\S+$/.test(link)) {
        return res.status(400).json({ ok: false, error: "Review link must start with https://" });
      }
      reviewLink = link;
    }
    await updateBusinessExtras(business.id, { settings: mergeSettings(business.settings, body), reviewLink });
    return res.json({ ok: true });
  } catch (err) {
    console.error("Update settings error:", err);
    return res.status(500).json({ ok: false, error: "Could not save settings" });
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
      source: "test",
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
