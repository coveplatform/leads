// Inbound traffic from outside: Twilio voice + SMS webhooks, the generic lead
// webhook (Zapier/Make/forms), the public lead API and the marketing-site
// enquiry form.

import express from "express";
import { config } from "../config.js";
import { validateTwilioSignature, rateLimited } from "../middleware.js";
import { startLead } from "../services/leads.js";
import { handleLeadReply } from "../services/conversation.js";
import { isStopKeyword } from "../flow-engine.js";
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
import { sendEmailViaResend } from "../integrations.js";
import { normalizePhone } from "../phone.js";
import { sendSms } from "../sms.js";

const router = express.Router();

// Twilio (and plain HTML forms) post application/x-www-form-urlencoded.
// Signature validation needs the params exactly as sent, so Twilio routes parse
// here, before the validator. JSON bodies are parsed app-wide in server.js.
const formBody = express.urlencoded({ extended: false });

const twiml = (inner) => `<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`;
const TEXTING_YOU = twiml(`<Say voice="alice">Thanks for calling. We'll send you a text message shortly.</Say><Hangup/>`);

// ─── Inbound Voice (missed call → text-back) ───

router.post("/api/voice/inbound", formBody, validateTwilioSignature, async (req, res) => {
  // Always respond with TwiML — Twilio requires a valid XML response
  res.set("Content-Type", "text/xml");
  try {
    const from = normalizePhone(String(req.body?.From || ""), config.defaultCountryCode);
    const to = normalizePhone(String(req.body?.To || ""), config.defaultCountryCode);
    const forwardedFromRaw = String(req.body?.ForwardedFrom || "");
    const forwardedFrom = forwardedFromRaw ? normalizePhone(forwardedFromRaw, config.defaultCountryCode) : null;

    console.log(`[voice/inbound] from=${from} to=${to} forwardedFrom=${forwardedFrom}`);

    if (!from || !to) {
      console.log("[voice/inbound] invalid from/to, skipping");
      return res.send(TEXTING_YOU);
    }

    // Only active businesses resolve here; is_active is the single on/off
    // switch and only Kris flips it. Billing never drops a tradie's calls.
    const business = await getBusinessByTwilioNumber(to);
    if (!business) {
      console.log(`[voice/inbound] no active business found for ${to}`);
      return res.send(TEXTING_YOU);
    }

    console.log(`[voice/inbound] business=${business.name} id=${business.id}`);

    // Test call loopback: a call Cove placed from its own number to the owner
    // that forwarded back here.
    const isTestCall = forwardedFrom &&
      from === normalizePhone(business.twilio_from_number, config.defaultCountryCode);
    if (isTestCall) {
      console.log(`[voice/inbound] test call loopback — skipping lead creation for business ${business.id}`);
      return res.send(twiml("<Hangup/>"));
    }

    // Forwarding heartbeat: any real forwarded call proves forwarding works now.
    recordInboundCall(business.id).catch((err) =>
      console.error("[voice/inbound] heartbeat update error:", err),
    );

    // Do SMS work before responding — serverless kills background async after res.send()
    try {
      const { status } = await startLead({
        business, phone: from, message: "Missed call", systemNote: "📞 Missed call",
      });
      console.log(`[voice/inbound] ${from}: ${status}`);
    } catch (err) {
      console.error("[voice/inbound] SMS flow error:", err);
    }

    return res.send(TEXTING_YOU);
  } catch (err) {
    console.error("[voice/inbound] error:", err);
    return res.send(TEXTING_YOU);
  }
});

// ─── Inbound SMS ───

router.post("/api/sms/inbound", formBody, validateTwilioSignature, async (req, res) => {
  // Tracked outside the try so the error handler can release it on failure.
  let claimedSid = null;
  try {
    const numMedia = Number(req.body?.NumMedia || 0);
    let bodyRaw = String(req.body?.Body || "").trim();
    // An MMS with no text reads as "sent a photo" rather than a blank reply.
    if (numMedia > 0 && !bodyRaw) bodyRaw = "[photo]";

    const from = normalizePhone(String(req.body?.From || ""), config.defaultCountryCode);
    const to = normalizePhone(String(req.body?.To || ""), config.defaultCountryCode);
    if (!from || !to) return res.status(400).send("Invalid Twilio payload");

    // ── Idempotency ── Twilio delivers at-least-once and retries on slow/failed
    // responses. Claim the MessageSid up front so a retry is ignored instead of
    // advancing the flow twice. Released in catch so genuine errors can still
    // be retried. Fails open if the dedup store is unavailable.
    const messageSid = req.body?.MessageSid || req.body?.SmsMessageSid || null;
    try {
      const fresh = await claimMessageSid(messageSid);
      if (!fresh) return res.status(200).send("OK"); // duplicate — already handled
      claimedSid = messageSid;
    } catch { /* dedup unavailable — process normally */ }

    const business = await getBusinessByTwilioNumber(to);
    if (!business) return res.status(200).send("OK");

    const lead = await getLatestActiveLeadByBusinessAndPhone({ businessId: business.id, phone: from });

    if (!lead) {
      // Cold inbound SMS — someone texted directly with no active flow. Start one.
      if (!isStopKeyword(bodyRaw)) {
        await startLead({ business, phone: from, message: bodyRaw, inboundBody: bodyRaw });
      }
      return res.status(200).send("OK");
    }

    await saveMessage({ leadId: lead.id, direction: "inbound", body: bodyRaw });
    await handleLeadReply({ business, lead, bodyRaw });
    return res.status(200).send("OK");
  } catch (error) {
    console.error("/api/sms/inbound error", error);
    if (claimedSid) { try { await releaseMessageSid(claimedSid); } catch { /* ignore */ } }
    return res.status(200).send("OK");
  }
});

// ─── Generic lead webhook (Zapier, Make, website forms) ───

router.post("/api/webhook/generic/:businessId", formBody, async (req, res) => {
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
    });
    if (status === "opted_out") {
      return res.status(403).json({ ok: false, error: "This number has opted out of SMS messages from this business" });
    }
    return res.json({ ok: true, leadId: lead.id });
  } catch (error) {
    console.error("Generic webhook error:", error);
    return res.status(500).json({ ok: false, error: "Internal server error" });
  }
});

// ─── Public lead API ───

router.post("/api/lead", formBody, async (req, res) => {
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

    const { status, lead } = await startLead({ business, phone: normalizedPhone, name, email, message });
    if (status === "opted_out") {
      return res.status(403).json({ ok: false, error: "This number has opted out of SMS messages from this business" });
    }
    if (status === "duplicate") {
      return res.json({ ok: true, leadId: lead.id, message: "Lead already active" });
    }
    return res.json({ ok: true, leadId: lead.id, step: lead.current_step, message: "Lead created and first SMS sent" });
  } catch (error) {
    console.error("/api/lead error", error);
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

    await sendEmailViaResend({
      to: config.adminAlert.email,
      subject: `New enquiry from ${name} — ${businessName}`,
      text: summary,
    });

    const alertTo = normalizePhone(config.adminAlert.to, config.defaultCountryCode);
    if (alertTo && config.adminAlert.from && config.twilio.accountSid) {
      await sendSms({ from: config.adminAlert.from, to: alertTo, body: `New Cove enquiry\n${summary}` })
        .catch((err) => console.error("Inquiry SMS error:", err));
    }

    return res.status(201).json({ ok: true, inquiryId: inquiry.id });
  } catch (error) {
    console.error("/api/website-inquiry error", error);
    return res.status(500).json({ ok: false, error: "Internal server error" });
  }
});

export default router;
