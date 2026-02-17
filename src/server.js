import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import {
  buildUrgentOwnerAlert,
  buildCompletionMessage,
  buildIntroAndFirstQuestion,
  buildOwnerSummary,
  buildStoppedMessage,
  getStep,
  isUrgentDentalIntent,
  isStopKeyword,
  FLOW_STEPS,
} from "./flow.js";
import {
  createWebsiteInquiry,
  createLead,
  getBusinessById,
  getBusinessByTwilioNumber,
  getLatestActiveLeadByBusinessAndPhone,
  updateLead,
  createBusiness,
  getAllBusinesses,
} from "./db.js";
import { normalizePhone } from "./phone.js";
import { sendSms } from "./sms.js";

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "..", "public");
app.use(express.static(publicDir));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "quote-accelerator-mvp", timestamp: new Date().toISOString() });
});

app.post("/api/lead", async (req, res) => {
  try {
    const { businessId, name, phone, email, message } = req.body || {};

    if (!businessId || !phone) {
      return res.status(400).json({ ok: false, error: "businessId and phone are required" });
    }

    const business = await getBusinessById(businessId);
    if (!business) {
      return res.status(404).json({ ok: false, error: "Business not found or inactive" });
    }

    const normalizedPhone = normalizePhone(phone, config.defaultCountryCode);
    if (!normalizedPhone) {
      return res.status(400).json({ ok: false, error: "Invalid phone format" });
    }

    const lead = await createLead({
      businessId,
      name,
      phone: normalizedPhone,
      email,
      message,
    });

    const firstMessage = buildIntroAndFirstQuestion(name, business.name);
    await sendSms({
      from: business.twilio_from_number,
      to: normalizedPhone,
      body: firstMessage,
    });

    return res.json({
      ok: true,
      leadId: lead.id,
      step: lead.current_step,
      message: "Lead created and first SMS sent",
    });
  } catch (error) {
    console.error("/api/lead error", error);
    return res.status(500).json({ ok: false, error: "Internal server error" });
  }
});

app.post("/api/website-inquiry", async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      businessName,
      websiteUrl,
      message,
    } = req.body || {};

    if (!name || !email || !businessName) {
      return res.status(400).json({
        ok: false,
        error: "name, email, and businessName are required",
      });
    }

    const normalizedPhone = phone
      ? normalizePhone(phone, config.defaultCountryCode)
      : null;

    const inquiry = await createWebsiteInquiry({
      name,
      email,
      phone: normalizedPhone || phone || null,
      businessName,
      websiteUrl,
      message,
    });

    return res.status(201).json({
      ok: true,
      inquiryId: inquiry.id,
      createdAt: inquiry.created_at,
    });
  } catch (error) {
    console.error("/api/website-inquiry error", error);
    return res.status(500).json({ ok: false, error: "Internal server error" });
  }
});

app.post("/api/admin/auth", async (req, res) => {
  try {
    const { password } = req.body || {};
    const adminPassword = process.env.ADMIN_PASSWORD || "chairflow2024";

    if (password === adminPassword) {
      return res.json({ ok: true, message: "Authenticated" });
    } else {
      return res.status(401).json({ ok: false, error: "Invalid password" });
    }
  } catch (error) {
    console.error("/api/admin/auth error", error);
    return res.status(500).json({ ok: false, error: "Authentication error" });
  }
});

app.post("/api/admin/businesses", async (req, res) => {
  try {
    const {
      name,
      twilio_from_number,
      owner_notify_phone,
      owner_notify_email,
      booking_link,
    } = req.body || {};

    if (!name || !twilio_from_number || !owner_notify_phone) {
      return res.status(400).json({
        ok: false,
        error: "name, twilio_from_number, and owner_notify_phone are required",
      });
    }

    const normalizedTwilio = normalizePhone(twilio_from_number, config.defaultCountryCode);
    const normalizedOwner = normalizePhone(owner_notify_phone, config.defaultCountryCode);

    if (!normalizedTwilio || !normalizedOwner) {
      return res.status(400).json({
        ok: false,
        error: "Invalid phone number format. Use E.164 format (e.g., +61...)",
      });
    }

    const business = await createBusiness({
      name,
      twilioFromNumber: normalizedTwilio,
      ownerNotifyPhone: normalizedOwner,
      ownerNotifyEmail: owner_notify_email || null,
      bookingLink: booking_link || null,
    });

    return res.status(201).json({
      ok: true,
      business,
      message: "Business created successfully",
    });
  } catch (error) {
    console.error("/api/admin/businesses POST error", error);
    if (error.message?.includes("unique")) {
      return res.status(409).json({
        ok: false,
        error: "This Twilio number is already in use",
      });
    }
    return res.status(500).json({ ok: false, error: "Internal server error" });
  }
});

app.get("/api/admin/businesses", async (req, res) => {
  try {
    const businesses = await getAllBusinesses();
    return res.json({
      ok: true,
      businesses,
      count: businesses.length,
    });
  } catch (error) {
    console.error("/api/admin/businesses GET error", error);
    return res.status(500).json({ ok: false, error: "Internal server error" });
  }
});

app.post("/api/demo", async (req, res) => {
  try {
    const { phone } = req.body || {};

    if (!phone) {
      return res.status(400).json({ ok: false, error: "Phone number is required" });
    }

    const normalizedPhone = normalizePhone(phone, config.defaultCountryCode);
    if (!normalizedPhone) {
      return res.status(400).json({ ok: false, error: "Invalid phone format. Use +61... format." });
    }

    if (!config.twilio.accountSid || !config.twilio.authToken) {
      return res.status(500).json({ ok: false, error: "SMS service not configured" });
    }

    const demoMessage = `Hi! This is a ChairFlow demo. You'll experience the exact SMS flow your leads would receive.\n\n${FLOW_STEPS[0].question}`;

    await sendSms({
      from: process.env.DEMO_TWILIO_NUMBER || config.twilio.accountSid,
      to: normalizedPhone,
      body: demoMessage,
    });

    return res.json({
      ok: true,
      message: "Demo SMS sent successfully",
      phone: normalizedPhone,
    });
  } catch (error) {
    console.error("/api/demo error", error);
    return res.status(500).json({ ok: false, error: "Could not send demo SMS" });
  }
});

app.post("/api/sms/inbound", async (req, res) => {
  try {
    const fromRaw = String(req.body?.From || "");
    const toRaw = String(req.body?.To || "");
    const bodyRaw = String(req.body?.Body || "").trim();

    const from = normalizePhone(fromRaw, config.defaultCountryCode);
    const to = normalizePhone(toRaw, config.defaultCountryCode);

    if (!from || !to) {
      return res.status(400).send("Invalid Twilio payload");
    }

    const business = await getBusinessByTwilioNumber(to);
    if (!business) {
      if (config.debug) {
        console.warn(`No business found for Twilio number ${to}`);
      }
      return res.status(200).send("OK");
    }

    const lead = await getLatestActiveLeadByBusinessAndPhone({
      businessId: business.id,
      phone: from,
    });

    if (!lead) {
      if (config.debug) {
        console.warn(`No active lead found for phone ${from} and business ${business.id}`);
      }
      return res.status(200).send("OK");
    }

    if (isStopKeyword(bodyRaw)) {
      await updateLead(lead.id, {
        status: "stopped",
        last_inbound_text: bodyRaw,
        finished_at: new Date().toISOString(),
      });

      await sendSms({
        from: business.twilio_from_number,
        to: lead.phone,
        body: buildStoppedMessage(business.name),
      });

      return res.status(200).send("OK");
    }

    const numMedia = Number(req.body?.NumMedia || 0);
    const mediaUrls = [];
    for (let i = 0; i < numMedia; i += 1) {
      const mediaUrl = req.body?.[`MediaUrl${i}`];
      if (mediaUrl) mediaUrls.push(String(mediaUrl));
    }

    const step = getStep(lead.current_step);
    if (!step) {
      return res.status(200).send("OK");
    }

    const valid = step.validate({ text: bodyRaw, mediaUrls });
    if (!valid) {
      await sendSms({
        from: business.twilio_from_number,
        to: lead.phone,
        body: `${step.invalidMessage}\n${step.question}`,
      });
      return res.status(200).send("OK");
    }

    const parsed = step.parse({ text: bodyRaw, mediaUrls });
    const nextAnswers = {
      ...(lead.answers || {}),
      ...parsed,
    };

    const currentStep = getStep(lead.current_step);
    const shouldSendUrgentAlert =
      currentStep?.key === "intent" &&
      isUrgentDentalIntent(nextAnswers) &&
      !nextAnswers.urgent_alert_sent;

    if (shouldSendUrgentAlert && business.owner_notify_phone) {
      const ownerPhone = normalizePhone(
        business.owner_notify_phone,
        config.defaultCountryCode,
      );

      const urgentAlert = buildUrgentOwnerAlert(lead, business, nextAnswers);
      await sendSms({
        from: business.twilio_from_number,
        to: ownerPhone,
        body: urgentAlert,
      });

      nextAnswers.urgent_alert_sent = true;
      nextAnswers.urgent_alert_sent_at = new Date().toISOString();
    }

    const isFinalStep = lead.current_step >= FLOW_STEPS.length;

    if (isFinalStep) {
      const completedLead = await updateLead(lead.id, {
        answers: nextAnswers,
        last_inbound_text: bodyRaw,
        current_step: lead.current_step + 1,
        status: "completed",
        finished_at: new Date().toISOString(),
      });

      await sendSms({
        from: business.twilio_from_number,
        to: lead.phone,
        body: buildCompletionMessage({
          bookingLink: business.booking_link,
          businessName: business.name,
        }),
      });

      if (business.owner_notify_phone) {
        const ownerPhone = normalizePhone(business.owner_notify_phone, config.defaultCountryCode);
        const summary = buildOwnerSummary(completedLead, business);
        await sendSms({
          from: business.twilio_from_number,
          to: ownerPhone,
          body: summary,
        });
      }

      return res.status(200).send("OK");
    }

    const nextStepNumber = lead.current_step + 1;
    const nextStep = getStep(nextStepNumber);

    await updateLead(lead.id, {
      answers: nextAnswers,
      last_inbound_text: bodyRaw,
      current_step: nextStepNumber,
    });

    await sendSms({
      from: business.twilio_from_number,
      to: lead.phone,
      body: nextStep.question,
    });

    return res.status(200).send("OK");
  } catch (error) {
    console.error("/api/sms/inbound error", error);
    return res.status(200).send("OK");
  }
});

app.use((req, res, next) => {
  if (req.path.startsWith("/api/")) {
    return next();
  }
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  return res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

app.use((_req, res) => {
  res.status(404).json({ ok: false, error: "Not found" });
});

if (!process.env.VERCEL) {
  app.listen(config.port, () => {
    console.log(`ChairFlow listening on port ${config.port}`);
  });
}

export default app;
