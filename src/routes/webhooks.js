// Inbound traffic from outside: Twilio voice + SMS webhooks, the generic lead
// webhook (Zapier/Make/forms), the public lead API and the marketing-site
// enquiry form.

import express from "express";
import { config } from "../config.js";
import { validateTwilioSignature, rateLimited } from "../middleware.js";
import { startLead } from "../services/leads.js";
import { handleLeadReply, handleNonLeadText } from "../services/conversation.js";
import { isOwnerPhone, handleOwnerReply } from "../services/owner-replies.js";
import {
  getBusinessById,
  getBusinessByTwilioNumber,
  getLatestActiveLeadByBusinessAndPhone,
  recordInboundCall,
  claimMessageSid,
  releaseMessageSid,
  saveMessage,
  createWebsiteInquiry,
} from "../db.js";
import { alertKris } from "../integrations.js";
import { normalizePhone } from "../phone.js";
import { withRequestId, log } from "../log.js";

const router = express.Router();

// Twilio (and plain HTML forms) post application/x-www-form-urlencoded.
// Signature validation needs the params exactly as sent, so Twilio routes parse
// here, before the validator. JSON bodies are parsed app-wide in server.js.
const formBody = express.urlencoded({ extended: false });
const twilioHook = [formBody, withRequestId, validateTwilioSignature];

const xml = (s) => String(s).replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]);
const twiml = (inner) => `<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`;
const TEXTING_YOU = twiml(`<Say voice="alice">Thanks for calling. We'll send you a text message shortly.</Say><Hangup/>`);

// Twilio gives up on a webhook after 15 seconds. Do the work (it must finish
// before responding: serverless freezes after res.send), but never take more
// than 10 seconds to answer, and flag anything over 5.
const DEADLINE_MS = 10_000;
async function withinDeadline(label, work) {
  const started = Date.now();
  let timer;
  const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve("timeout"), DEADLINE_MS); });
  try {
    const result = await Promise.race([work().catch((err) => { log.error(`[${label}] error:`, err); return "error"; }), timeout]);
    if (result === "timeout") log.error(`[${label}] webhook_timeout after ${DEADLINE_MS}ms — answered anyway`);
    return result;
  } finally {
    clearTimeout(timer);
    const ms = Date.now() - started;
    if (ms > 5000) log.warn(`[${label}] webhook_slow ${ms}ms`);
  }
}

function phoneParam(req, key) {
  return normalizePhone(String(req.body?.[key] || ""), config.defaultCountryCode);
}

// ─── Inbound Voice (missed call → text-back) ───
//
// voice_mode (flow_config):
//   hangup     (default) the owner's phone already rang out; text the caller now
//   dial_first ring dial_to (default the owner's mobile) for 20s first; text
//              the caller only if nobody answers. For businesses whose main
//              line forwards everything to Cove. The Dial shows the Cove number
//              as caller id, so if the dialled phone forwards back to Cove it's
//              recognised and rejected instead of looping.

router.post("/api/voice/inbound", ...twilioHook, async (req, res) => {
  res.set("Content-Type", "text/xml");
  let response = TEXTING_YOU;

  await withinDeadline("voice/inbound", async () => {
    const from = phoneParam(req, "From");
    const to = phoneParam(req, "To");
    log.info(`[voice/inbound] from=${from} to=${to} forwardedFrom=${req.body?.ForwardedFrom || ""}`);
    if (!from || !to) return;

    // Only active businesses resolve; is_active is the one switch, and only Kris flips it.
    const business = await getBusinessByTwilioNumber(to);
    if (!business) { log.info(`[voice/inbound] no active business for ${to}`); return; }

    // Our own number calling in: a dial_first call forwarded back to us, or a
    // test loop. Reject so the dialling leg sees "busy" and nothing is texted.
    if (from === normalizePhone(business.twilio_from_number, config.defaultCountryCode)) {
      log.info("[voice/inbound] loopback from own number — rejecting");
      response = twiml(`<Reject reason="busy"/>`);
      return;
    }

    // Forwarding heartbeat: any real forwarded call proves forwarding works now.
    await recordInboundCall(business.id).catch((err) => log.error("[voice/inbound] heartbeat:", err.message));

    const dialTo = normalizePhone(business.flow_config?.dial_to || business.owner_notify_phone || "", config.defaultCountryCode);
    if (business.flow_config?.voice_mode === "dial_first" && dialTo && dialTo !== from && dialTo !== to) {
      const action = `${config.publicBaseUrl}/api/voice/status`;
      response = twiml(
        `<Dial timeout="20" callerId="${xml(business.twilio_from_number)}" action="${xml(action)}" method="POST">` +
        `<Number>${xml(dialTo)}</Number></Dial>`,
      );
      log.info(`[voice/inbound] dial_first → ${dialTo}`);
      return;
    }

    const { status } = await startLead({
      business, phone: from, message: "Missed call", systemNote: "📞 Missed call", source: "missed_call",
    });
    log.info(`[voice/inbound] ${from}: ${status}`);
  });

  return res.send(response);
});

// dial_first: Twilio reports how the <Dial> went. Text the caller back only if
// nobody picked up.
router.post("/api/voice/status", ...twilioHook, async (req, res) => {
  res.set("Content-Type", "text/xml");
  const status = String(req.body?.DialCallStatus || "");
  const duration = Number(req.body?.DialCallDuration || 0);
  // A "completed" call of a few seconds is the dialled phone rejecting or
  // bouncing the call, not a conversation.
  const missed = ["no-answer", "busy", "failed", "canceled"].includes(status) || (status === "completed" && duration < 5);
  log.info(`[voice/status] DialCallStatus=${status} duration=${duration} missed=${missed}`);
  if (!missed) return res.send(twiml("<Hangup/>"));

  await withinDeadline("voice/status", async () => {
    const from = phoneParam(req, "From");
    const to = phoneParam(req, "To");
    if (!from || !to) return;
    const business = await getBusinessByTwilioNumber(to);
    if (!business) return;
    const result = await startLead({
      business, phone: from, message: "Missed call", systemNote: `📞 Missed call (${status})`, source: "missed_call",
    });
    log.info(`[voice/status] ${from}: ${result.status}`);
  });
  return res.send(twiml(`<Say voice="alice">Sorry we missed you. We'll text you now.</Say><Hangup/>`));
});

// ─── Inbound SMS ───
//
// Routing, in order:
//   1. The owner texting their Cove number (no test flow running) → Y/N/new time
//   2. An active conversation → the flow
//   3. STOP, a reply to a reminder / rebook nudge, or a recent customer → handled
//      without starting a new flow
//   4. Anyone else → a new lead (cold inbound SMS)

router.post("/api/sms/inbound", ...twilioHook, async (req, res) => {
  const numMedia = Number(req.body?.NumMedia || 0);
  let bodyRaw = String(req.body?.Body || "").trim();
  // An MMS with no text reads as "sent a photo" rather than a blank reply.
  if (numMedia > 0 && !bodyRaw) bodyRaw = "[photo]";

  const from = phoneParam(req, "From");
  const to = phoneParam(req, "To");
  if (!from || !to) return res.status(400).send("Invalid Twilio payload");

  // ── Idempotency ── Twilio delivers at-least-once and retries on slow/failed
  // responses. Claim the MessageSid first so a retry is ignored instead of
  // advancing the flow twice. Released on error so the retry can run.
  const messageSid = req.body?.MessageSid || req.body?.SmsMessageSid || null;
  let claimed = false;
  try {
    if (!(await claimMessageSid(messageSid))) return res.status(200).send("OK");
    claimed = !!messageSid;
  } catch { /* dedup unavailable — process normally */ }

  const result = await withinDeadline("sms/inbound", async () => {
    const business = await getBusinessByTwilioNumber(to);
    if (!business) return;

    const lead = await getLatestActiveLeadByBusinessAndPhone({ businessId: business.id, phone: from });

    if (!lead && isOwnerPhone(business, from)) {
      await handleOwnerReply(business, bodyRaw);
      return;
    }

    if (lead) {
      await saveMessage({ leadId: lead.id, direction: "inbound", body: bodyRaw });
      await handleLeadReply({ business, lead, bodyRaw });
      return;
    }

    if (await handleNonLeadText({ business, phone: from, bodyRaw })) return;

    await startLead({ business, phone: from, message: bodyRaw, inboundBody: bodyRaw, source: "sms" });
  });

  if (result === "error" && claimed) {
    try { await releaseMessageSid(messageSid); } catch { /* ignore */ }
  }
  return res.status(200).send("OK");
});

// ─── Generic lead webhook (Zapier, Make, website forms) ───

router.post("/api/webhook/generic/:businessId", formBody, withRequestId, async (req, res) => {
  try {
    const business = await getBusinessById(req.params.businessId);
    if (!business) return res.status(404).json({ ok: false, error: "Business not found" });

    const webhookSecret = business.integrations?.webhook_secret;
    if (webhookSecret) {
      const provided = req.headers["x-cove-secret"] || "";
      if (provided !== webhookSecret) return res.status(401).json({ ok: false, error: "Invalid webhook secret" });
    }
    if (!business.twilio_from_number) {
      return res.status(503).json({ ok: false, error: "SMS number not yet provisioned for this business" });
    }

    const { name, phone, email, message, source } = req.body || {};
    if (!phone) return res.status(400).json({ ok: false, error: "phone is required" });

    const normalizedPhone = normalizePhone(phone, config.defaultCountryCode);
    if (!normalizedPhone) return res.status(400).json({ ok: false, error: "Invalid phone format" });

    const { status, lead } = await startLead({
      business,
      phone: normalizedPhone,
      name: name || null,
      email: email || null,
      message: source ? `[${source}] ${message || ""}` : message || null,
      source: "webhook",
    });
    if (status === "opted_out") {
      return res.status(403).json({ ok: false, error: "This number has opted out of SMS messages from this business" });
    }
    return res.json({ ok: true, leadId: lead.id });
  } catch (error) {
    log.error("Generic webhook error:", error);
    return res.status(500).json({ ok: false, error: "Internal server error" });
  }
});

// ─── Public lead API ───

router.post("/api/lead", formBody, withRequestId, async (req, res) => {
  try {
    const { businessId, name, phone, email, message } = req.body || {};
    if (!businessId || !phone) {
      return res.status(400).json({ ok: false, error: "businessId and phone are required" });
    }

    const business = await getBusinessById(businessId);
    if (!business) return res.status(404).json({ ok: false, error: "Business not found or inactive" });
    if (!business.twilio_from_number) {
      return res.status(503).json({ ok: false, error: "SMS number not yet provisioned for this business" });
    }

    const normalizedPhone = normalizePhone(phone, config.defaultCountryCode);
    if (!normalizedPhone) return res.status(400).json({ ok: false, error: "Invalid phone format" });

    const { status, lead } = await startLead({ business, phone: normalizedPhone, name, email, message, source: "api" });
    if (status === "opted_out") {
      return res.status(403).json({ ok: false, error: "This number has opted out of SMS messages from this business" });
    }
    if (status === "duplicate") {
      return res.json({ ok: true, leadId: lead.id, message: "Lead already active" });
    }
    return res.json({ ok: true, leadId: lead.id, step: lead.current_step, message: "Lead created and first SMS sent" });
  } catch (error) {
    log.error("/api/lead error", error);
    return res.status(500).json({ ok: false, error: "Internal server error" });
  }
});

// ─── Marketing-site enquiry form ───
// Saves the enquiry and alerts Kris. Never texts the enquirer.

router.post("/api/website-inquiry", async (req, res) => {
  try {
    if (await rateLimited(req, res, "inquiry", 3600, 10)) return; // 10/hour per IP
    const { name, email, phone, businessName, websiteUrl, message } = req.body || {};
    if (!name || !email || !businessName) {
      return res.status(400).json({ ok: false, error: "name, email, and businessName are required" });
    }

    const normalizedPhone = phone ? normalizePhone(phone, config.defaultCountryCode) : null;
    const inquiry = await createWebsiteInquiry({
      name, email,
      phone: normalizedPhone || phone || null,
      businessName, websiteUrl, message,
    });

    const summary = [
      `Name: ${name}`,
      `Email: ${email}`,
      `Phone: ${phone || "—"}`,
      `Business: ${businessName}`,
      websiteUrl ? `Website: ${websiteUrl}` : null,
      message ? `\nMessage: ${message}` : null,
    ].filter(Boolean).join("\n");

    await alertKris(`New enquiry from ${name} — ${businessName}`, summary);
    return res.status(201).json({ ok: true, inquiryId: inquiry.id });
  } catch (error) {
    log.error("/api/website-inquiry error", error);
    return res.status(500).json({ ok: false, error: "Internal server error" });
  }
});

export default router;
