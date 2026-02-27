import express from "express";
import cookieParser from "cookie-parser";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import {
  hashPassword,
  verifyPassword,
  signToken,
  setAuthCookie,
  clearAuthCookie,
  requireAuth,
  requireAuthRedirect,
  redirectIfAuthed,
  buildGoogleAuthUrl,
  exchangeGoogleCode,
  getGoogleUserInfo,
} from "./auth.js";
import {
  createStripeCustomer,
  createCheckoutSession,
  createBillingPortalSession,
  constructWebhookEvent,
  isStripeConfigured,
} from "./stripe.js";
import {
  getFlowConfig,
  getFlowStep,
  validateReply,
  parseReply,
  isUrgentAnswer,
  buildIntro,
  buildCompletion,
  buildSummary,
  buildUrgentAlert,
  isStopKeyword,
  buildStoppedMessage,
  getIndustryList,
  INDUSTRY_TEMPLATES,
} from "./flow-engine.js";
import {
  generateFlowForIndustry,
  parseNaturalLanguageReply,
  isAIConfigured,
} from "./ai.js";
import {
  createWebsiteInquiry,
  createLead,
  getBusinessById,
  getBusinessByTwilioNumber,
  getLatestActiveLeadByBusinessAndPhone,
  updateLead,
  createBusiness,
  updateBusiness,
  getAllBusinesses,
  getAllLeadsWithBusiness,
  checkDemoRateLimit,
  recordDemoSend,
  checkDuplicateLead,
  saveMessage,
  getMessagesByLeadId,
  createUser,
  getUserById,
  getUserByEmail,
  getUserByGoogleId,
  updateUser,
  getBusinessByUserId,
  getRecentLeadsByBusinessId,
} from "./db.js";
import {
  isWithinOperatingHours,
  buildAfterHoursMessage,
  sendLeadNotifications,
  shouldNudge,
  buildNudgeMessage,
  getIntegrationConfig,
} from "./integrations.js";
import { normalizePhone } from "./phone.js";
import { sendSms } from "./sms.js";
import twilio from "twilio";

const app = express();

// ─── Stripe webhook must receive raw body — register before json parser ───
app.post(
  "/api/billing/webhook",
  express.raw({ type: "application/json" }),
  handleStripeWebhook,
);

// ─── Middleware ───
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "..", "public");
app.use(express.static(publicDir));

// ─── Page routes ───

app.get("/login", redirectIfAuthed, (_req, res) => {
  res.sendFile(path.join(publicDir, "login.html"));
});

app.get("/onboarding", requireAuthRedirect, (_req, res) => {
  res.sendFile(path.join(publicDir, "onboarding.html"));
});

app.get("/dashboard", (_req, res) => {
  res.sendFile(path.join(publicDir, "dashboard.html"));
});

// ─── Health ───

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "cove", timestamp: new Date().toISOString() });
});

// ─── Auth ───

app.post("/api/auth/signup", async (req, res) => {
  try {
    const { name, email, password } = req.body || {};
    if (!name || !email || !password) {
      return res.status(400).json({ ok: false, error: "Name, email and password are required" });
    }
    if (password.length < 8) {
      return res.status(400).json({ ok: false, error: "Password must be at least 8 characters" });
    }

    const existing = await getUserByEmail(email.toLowerCase().trim());
    if (existing) {
      return res.status(409).json({ ok: false, error: "An account with this email already exists" });
    }

    const passwordHash = await hashPassword(password);
    const user = await createUser({
      email: email.toLowerCase().trim(),
      passwordHash,
      name: name.trim(),
    });

    const token = signToken(user.id);
    setAuthCookie(res, token);

    return res.status(201).json({ ok: true, user: { id: user.id, email: user.email, name: user.name } });
  } catch (err) {
    console.error("Signup error:", err);
    return res.status(500).json({ ok: false, error: "Could not create account" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ ok: false, error: "Email and password are required" });
    }

    const user = await getUserByEmail(email.toLowerCase().trim());
    if (!user || !user.password_hash) {
      return res.status(401).json({ ok: false, error: "Invalid email or password" });
    }

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ ok: false, error: "Invalid email or password" });
    }

    const token = signToken(user.id);
    setAuthCookie(res, token);

    return res.json({ ok: true, user: { id: user.id, email: user.email, name: user.name } });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ ok: false, error: "Could not sign in" });
  }
});

app.get("/api/auth/google", (req, res) => {
  if (!config.google.clientId) {
    return res.status(503).json({ ok: false, error: "Google login not configured" });
  }
  const url = buildGoogleAuthUrl(config.baseUrl);
  res.redirect(url);
});

app.get("/api/auth/google/callback", async (req, res) => {
  try {
    const { code, error } = req.query;
    if (error || !code) return res.redirect("/login?error=google_denied");

    const tokens = await exchangeGoogleCode(String(code), config.baseUrl);
    const profile = await getGoogleUserInfo(tokens.access_token);

    if (!profile.email) return res.redirect("/login?error=no_email");

    let user = await getUserByGoogleId(profile.sub);

    if (!user) {
      user = await getUserByEmail(profile.email.toLowerCase());
      if (user) {
        // Link Google to existing email account
        await updateUser(user.id, {});
      } else {
        user = await createUser({
          email: profile.email.toLowerCase(),
          name: profile.name || profile.email.split("@")[0],
          googleId: profile.sub,
        });
      }
    }

    const token = signToken(user.id);
    setAuthCookie(res, token);

    const business = await getBusinessByUserId(user.id);
    if (!business || !user.onboarding_complete) {
      return res.redirect("/onboarding");
    }
    return res.redirect("/dashboard");
  } catch (err) {
    console.error("Google callback error:", err);
    return res.redirect("/login?error=google_failed");
  }
});

app.post("/api/auth/logout", (req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

app.get("/api/auth/me", requireAuth, async (req, res) => {
  try {
    const user = await getUserById(req.userId);
    if (!user) {
      clearAuthCookie(res);
      return res.status(404).json({ ok: false, error: "User not found" });
    }
    const business = await getBusinessByUserId(req.userId);
    return res.json({ ok: true, user, business: business || null });
  } catch (err) {
    console.error("Get me error:", err);
    return res.status(500).json({ ok: false, error: "Could not fetch user" });
  }
});

// ─── Manual number provisioning (if Stripe webhook missed) ───
app.post("/api/auth/provision-number", requireAuth, async (req, res) => {
  try {
    const business = await getBusinessByUserId(req.userId);
    if (!business) return res.status(404).json({ ok: false, error: "No business found" });
    if (business.twilio_from_number) return res.json({ ok: true, number: business.twilio_from_number, already: true });
    const number = await provisionTwilioNumber(business.id);
    if (!number) return res.status(500).json({ ok: false, error: "Could not provision a number — Twilio may be unavailable or no AU numbers available. Contact support." });
    const { neon } = await import("@neondatabase/serverless");
    const sql = neon(config.databaseUrl);
    await sql`UPDATE businesses SET is_active = true WHERE id = ${business.id}`;
    return res.json({ ok: true, number });
  } catch (err) {
    console.error("Provision number error:", err);
    return res.status(500).json({ ok: false, error: err.message || "Could not provision number" });
  }
});

// ─── Reset onboarding ───
app.post("/api/auth/reset-onboarding", requireAuth, async (req, res) => {
  try {
    const { neon } = await import("@neondatabase/serverless");
    const sql = neon(config.databaseUrl);
    await sql`UPDATE users SET onboarding_complete = false, updated_at = now() WHERE id = ${req.userId}`;
    await sql`UPDATE businesses SET twilio_from_number = null, is_active = false WHERE user_id = ${req.userId}`;
    return res.json({ ok: true });
  } catch (err) {
    console.error("Reset onboarding error:", err);
    return res.status(500).json({ ok: false, error: "Could not reset" });
  }
});

// ─── Onboarding ───

app.post("/api/onboarding/generate-flow", requireAuth, async (req, res) => {
  try {
    const { businessName, description } = req.body || {};
    if (!businessName || !description) {
      return res.status(400).json({ ok: false, error: "businessName and description are required" });
    }

    if (!isAIConfigured()) {
      return res.status(503).json({ ok: false, error: "AI not configured. Set OPENAI_API_KEY." });
    }

    const flow = await generateFlowForIndustry(
      "general service business",
      businessName,
      description,
    );

    return res.json({ ok: true, flow });
  } catch (err) {
    console.error("Generate flow error:", err);
    return res.status(500).json({ ok: false, error: err.message || "Could not generate flow" });
  }
});

app.post("/api/onboarding/sample-reply", requireAuth, async (req, res) => {
  try {
    const { question, isFree, options, businessName } = req.body || {};
    if (!question) return res.json({ ok: true, reply: "Yes, that works for me" });

    if (!isAIConfigured()) {
      // Fallback without AI
      return res.json({ ok: true, reply: isFree ? "My hot water system stopped working" : (options?.[0] ? `${options[0].value}) ${options[0].label}` : "A") });
    }

    const prompt = isFree
      ? `You are a customer receiving this SMS question from a service business called "${businessName || "the business"}": "${question}"\n\nReply naturally in 1 short sentence as a real customer would via SMS. Be specific and realistic. No quotes, no labels, just the reply text.`
      : `You are a customer receiving this SMS question: "${question}"\n\nThe options are: ${options?.map(o => `${o.value}) ${o.label}`).join(", ")}\n\nReply with just the letter and option label, e.g. "A) Emergency". Pick the most realistic option. No extra text.`;

    const OpenAI = (await import("openai")).default;
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const chat = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 60,
      temperature: 0.8,
    });
    const reply = chat.choices[0]?.message?.content?.trim() || "Yes, that works";
    return res.json({ ok: true, reply });
  } catch (err) {
    console.error("Sample reply error:", err);
    return res.json({ ok: true, reply: "Yes, that works for me" });
  }
});

app.post("/api/onboarding/save", requireAuth, async (req, res) => {
  try {
    const {
      businessName,
      flowConfig,
      notifyPhone,
      notifyEmail,
      bookingLink,
    } = req.body || {};

    if (!businessName || !notifyPhone) {
      return res.status(400).json({ ok: false, error: "Business name and notification phone are required" });
    }

    const normalizedPhone = normalizePhone(notifyPhone, config.defaultCountryCode);
    if (!normalizedPhone) {
      return res.status(400).json({ ok: false, error: "Invalid phone number" });
    }

    let business = await getBusinessByUserId(req.userId);

    if (business) {
      business = await updateBusiness(business.id, {
        name: businessName,
        ownerNotifyPhone: normalizedPhone,
        ownerNotifyEmail: notifyEmail || null,
        bookingLink: bookingLink || null,
        flowConfig: flowConfig || null,
      });
    } else {
      business = await createBusiness({
        name: businessName,
        twilioFromNumber: null, // provisioned after payment
        ownerNotifyPhone: normalizedPhone,
        ownerNotifyEmail: notifyEmail || null,
        bookingLink: bookingLink || null,
        flowConfig: flowConfig || null,
        industry: "general",
        isActive: false,
        userId: req.userId,
      });
    }

    return res.json({ ok: true, businessId: business.id });
  } catch (err) {
    console.error("Onboarding save error:", err);
    return res.status(500).json({ ok: false, error: "Could not save business" });
  }
});

// ─── My business (dashboard) ───

app.get("/api/me/business", requireAuth, async (req, res) => {
  try {
    const business = await getBusinessByUserId(req.userId);
    const user = await getUserById(req.userId);
    return res.json({ ok: true, business: business || null, user });
  } catch (err) {
    console.error("Get business error:", err);
    return res.status(500).json({ ok: false, error: "Could not fetch business" });
  }
});

app.get("/api/me/leads", requireAuth, async (req, res) => {
  try {
    const business = await getBusinessByUserId(req.userId);
    if (!business) return res.json({ ok: true, leads: [] });
    const leads = await getRecentLeadsByBusinessId(business.id, 7);
    return res.json({ ok: true, leads });
  } catch (err) {
    console.error("Get leads error:", err);
    return res.status(500).json({ ok: false, error: "Could not fetch leads" });
  }
});

app.get("/api/me/leads/:leadId/messages", requireAuth, async (req, res) => {
  try {
    const business = await getBusinessByUserId(req.userId);
    if (!business) return res.status(404).json({ ok: false, error: "No business" });
    const messages = await getMessagesByLeadId(req.params.leadId);
    return res.json({ ok: true, messages });
  } catch (err) {
    console.error("Get messages error:", err);
    return res.status(500).json({ ok: false, error: "Could not fetch messages" });
  }
});

app.put("/api/me/business", requireAuth, async (req, res) => {
  try {
    const business = await getBusinessByUserId(req.userId);
    if (!business) return res.status(404).json({ ok: false, error: "No business found" });

    const { name, bookingLink } = req.body || {};
    const updates = {};
    if (name !== undefined) updates.name = name || business.name;
    if (bookingLink !== undefined) updates.bookingLink = bookingLink || null;

    await updateBusiness(business.id, updates);
    return res.json({ ok: true });
  } catch (err) {
    console.error("Update business error:", err);
    return res.status(500).json({ ok: false, error: "Could not update business" });
  }
});

app.put("/api/me/flow", requireAuth, async (req, res) => {
  try {
    const business = await getBusinessByUserId(req.userId);
    if (!business) return res.status(404).json({ ok: false, error: "No business found" });

    const { flowConfig } = req.body || {};
    if (!flowConfig) return res.status(400).json({ ok: false, error: "flowConfig is required" });

    await updateBusiness(business.id, { flowConfig });
    return res.json({ ok: true });
  } catch (err) {
    console.error("Update flow error:", err);
    return res.status(500).json({ ok: false, error: "Could not update flow" });
  }
});

app.put("/api/me/notifications", requireAuth, async (req, res) => {
  try {
    const business = await getBusinessByUserId(req.userId);
    if (!business) return res.status(404).json({ ok: false, error: "No business found" });

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
      const currentIntegrations = getIntegrationConfig(business);
      updates.integrations = { ...currentIntegrations, completion_webhook_url: webhookUrl || null };
    }

    await updateBusiness(business.id, updates);
    return res.json({ ok: true });
  } catch (err) {
    console.error("Update notifications error:", err);
    return res.status(500).json({ ok: false, error: "Could not update settings" });
  }
});

app.post("/api/me/regenerate-flow", requireAuth, async (req, res) => {
  try {
    const business = await getBusinessByUserId(req.userId);
    if (!business) return res.status(404).json({ ok: false, error: "No business found" });

    const { description } = req.body || {};
    if (!isAIConfigured()) return res.status(503).json({ ok: false, error: "AI not configured" });

    const flow = await generateFlowForIndustry("general service business", business.name, description || "");
    return res.json({ ok: true, flow });
  } catch (err) {
    console.error("Regenerate flow error:", err);
    return res.status(500).json({ ok: false, error: "Could not regenerate flow" });
  }
});

// ─── Config ───
app.get("/api/config/stripe-mode", (req, res) => {
  res.json({ stripeEnabled: isStripeConfigured() });
});

// ─── Billing ───

app.post("/api/billing/checkout", requireAuth, async (req, res) => {
  try {
    // Dev mode: if Stripe not configured, auto-activate and provision number
    if (!isStripeConfigured()) {
      const business = await getBusinessByUserId(req.userId);
      let hasNumber = business?.twilio_from_number;
      if (business) {
        await updateBusiness(business.id, { isActive: true });
        if (!hasNumber) {
          hasNumber = await provisionTwilioNumber(business.id);
        }
      }
      await updateUser(req.userId, { onboardingComplete: true, subscriptionStatus: "active" });
      const dest = hasNumber ? `${config.baseUrl.trim()}/onboarding?step=complete` : `${config.baseUrl.trim()}/dashboard`;
      return res.json({ ok: true, url: dest });
    }

    const user = await getUserById(req.userId);
    if (!user) return res.status(404).json({ ok: false, error: "User not found" });

    let customerId = user.stripe_customer_id;

    if (!customerId) {
      const customer = await createStripeCustomer({ email: user.email, name: user.name });
      customerId = customer.id;
      await updateUser(req.userId, { stripeCustomerId: customerId });
    }

    const session = await createCheckoutSession({
      customerId,
      successUrl: `${config.baseUrl}/onboarding?step=complete&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${config.baseUrl}/onboarding?step=billing&cancelled=1`,
    });

    return res.json({ ok: true, url: session.url });
  } catch (err) {
    console.error("Checkout error:", err);
    return res.status(500).json({ ok: false, error: "Could not create checkout session" });
  }
});

app.get("/api/billing/portal", requireAuth, async (req, res) => {
  try {
    if (!isStripeConfigured()) {
      return res.status(503).json({ ok: false, error: "Billing not configured" });
    }

    const user = await getUserById(req.userId);
    if (!user?.stripe_customer_id) {
      return res.status(400).json({ ok: false, error: "No billing account found" });
    }

    const session = await createBillingPortalSession({
      customerId: user.stripe_customer_id,
      returnUrl: `${config.baseUrl}/dashboard`,
    });

    return res.json({ ok: true, url: session.url });
  } catch (err) {
    console.error("Billing portal error:", err);
    return res.status(500).json({ ok: false, error: "Could not open billing portal" });
  }
});

// ─── Stripe Webhook (raw body, registered before json middleware) ───

async function handleStripeWebhook(req, res) {
  const sig = req.headers["stripe-signature"];
  if (!sig || !config.stripe.webhookSecret) {
    return res.status(400).json({ error: "Missing stripe signature or webhook secret" });
  }

  let event;
  try {
    event = constructWebhookEvent(req.body, sig);
  } catch (err) {
    console.error("Stripe webhook signature error:", err.message);
    return res.status(400).json({ error: `Webhook error: ${err.message}` });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        if (session.mode === "subscription" && session.subscription) {
          await activateSubscription(session.customer, session.subscription);
        }
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object;
        await syncSubscriptionStatus(sub.customer, sub.id, sub.status);
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object;
        await syncSubscriptionStatus(invoice.customer, invoice.subscription, "past_due");
        break;
      }
    }
  } catch (err) {
    console.error("Stripe webhook processing error:", err);
  }

  return res.json({ received: true });
}

async function activateSubscription(stripeCustomerId, subscriptionId) {
  const { neon } = await import("@neondatabase/serverless");
  const sql = neon(config.databaseUrl);

  const users = await sql`
    SELECT * FROM users WHERE stripe_customer_id = ${stripeCustomerId} LIMIT 1
  `;
  const user = users[0];
  if (!user) return;

  await sql`
    UPDATE users SET
      stripe_subscription_id = ${subscriptionId},
      subscription_status = 'active',
      onboarding_complete = true,
      updated_at = now()
    WHERE id = ${user.id}
  `;

  // Provision Twilio number if not already done
  const businesses = await sql`SELECT * FROM businesses WHERE user_id = ${user.id} LIMIT 1`;
  const business = businesses[0];
  if (business && !business.twilio_from_number) {
    await provisionTwilioNumber(business.id);
  }
  if (business && !business.is_active) {
    await sql`UPDATE businesses SET is_active = true WHERE id = ${business.id}`;
  }
}

async function syncSubscriptionStatus(stripeCustomerId, subscriptionId, status) {
  const { neon } = await import("@neondatabase/serverless");
  const sql = neon(config.databaseUrl);
  await sql`
    UPDATE users SET
      stripe_subscription_id = ${subscriptionId},
      subscription_status = ${status},
      updated_at = now()
    WHERE stripe_customer_id = ${stripeCustomerId}
  `;
}

async function provisionTwilioNumber(businessId) {
  if (!config.twilio.accountSid || !config.twilio.authToken) return null;

  try {
    const client = twilio(config.twilio.accountSid, config.twilio.authToken);
    const rawBase = (config.baseUrl || "").trim();
    const baseUrl = (rawBase.startsWith("http://localhost") || rawBase.startsWith("http://127"))
      ? (process.env.PRODUCTION_URL || "https://leads-rho-six.vercel.app").trim()
      : rawBase;
    const webhookUrl = `${baseUrl}/api/sms/inbound`;

    const addressSid = process.env.TWILIO_ADDRESS_SID || null;
    const bundleSid  = process.env.TWILIO_BUNDLE_SID  || null;

    // Try AU mobile first (requires approved regulatory bundle), then AU local, then US local
    let phoneNumber = null;
    for (const [country, type] of [["AU", "mobile"], ["AU", "local"], ["US", "local"]]) {
      try {
        const list = await client.availablePhoneNumbers(country)[type].list({ smsEnabled: true, limit: 20 });
        if (!list.length) { console.warn(`No ${country} ${type} numbers available`); continue; }

        // For AU mobile we need an approved bundle — skip if missing
        if (country === "AU" && type === "mobile" && !bundleSid) {
          console.warn("Skipping AU mobile — TWILIO_BUNDLE_SID not set");
          continue;
        }

        const pick = list.find(n => !n.beta) || list[0];
        phoneNumber = pick.phoneNumber;
        console.log(`Provisioning ${country} ${type}: ${phoneNumber}`);
        break;
      } catch (e) { console.warn(`No ${country} ${type} numbers:`, e.message); }
    }

    if (!phoneNumber) {
      console.warn("No phone numbers available for provisioning");
      return null;
    }

    const voiceUrl = `${baseUrl}/api/voice/inbound`;
    const createParams = {
      phoneNumber,
      smsUrl: webhookUrl,
      smsMethod: "POST",
      voiceUrl,
      voiceMethod: "POST",
    };
    if (phoneNumber.startsWith("+61") && bundleSid) {
      createParams.bundleSid  = bundleSid;
      if (addressSid) createParams.addressSid = addressSid;
    }

    const purchased = await client.incomingPhoneNumbers.create(createParams);

    const { neon } = await import("@neondatabase/serverless");
    const sql = neon(config.databaseUrl);
    await sql`
      UPDATE businesses
      SET twilio_from_number = ${purchased.phoneNumber}
      WHERE id = ${businessId}
    `;

    return purchased.phoneNumber;
  } catch (err) {
    console.error("Twilio provisioning error:", err);
    return null;
  }
}

// ─── Public lead API ───

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

    const existingLead = await checkDuplicateLead(normalizedPhone, 30);
    if (existingLead) {
      return res.json({ ok: true, leadId: existingLead.id, message: "Lead already active" });
    }

    const lead = await createLead({ businessId, name, phone: normalizedPhone, email, message });
    const flowConfig = getFlowConfig(business);

    if (!isWithinOperatingHours(business)) {
      await sendSms({ from: business.twilio_from_number, to: normalizedPhone, body: buildAfterHoursMessage(business) });
      return res.json({ ok: true, leadId: lead.id, step: lead.current_step, after_hours: true });
    }

    const firstMessage = buildIntro(flowConfig, name, business.name);
    await sendSms({ from: business.twilio_from_number, to: normalizedPhone, body: firstMessage });

    return res.json({ ok: true, leadId: lead.id, step: lead.current_step, message: "Lead created and first SMS sent" });
  } catch (error) {
    console.error("/api/lead error", error);
    return res.status(500).json({ ok: false, error: "Internal server error" });
  }
});

// ─── Website inquiry ───

app.post("/api/website-inquiry", async (req, res) => {
  try {
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

    const ownerPhone = process.env.OWNER_NOTIFY_PHONE;
    const smsFrom = process.env.DEMO_TWILIO_NUMBER;
    if (ownerPhone && smsFrom && config.twilio.accountSid) {
      const normalized = normalizePhone(ownerPhone, config.defaultCountryCode);
      if (normalized) {
        sendSms({
          from: smsFrom,
          to: normalized,
          body: `New Cove enquiry\nFrom: ${name}\nEmail: ${email}\nPhone: ${phone || "—"}\nBusiness: ${businessName}\n${websiteUrl ? `Website: ${websiteUrl}` : ""}`,
        }).catch((err) => console.error("Inquiry SMS error:", err));
      }
    }

    return res.status(201).json({ ok: true, inquiryId: inquiry.id });
  } catch (error) {
    console.error("/api/website-inquiry error", error);
    return res.status(500).json({ ok: false, error: "Internal server error" });
  }
});

// ─── Inbound Voice (missed call → trigger SMS flow) ───

app.post("/api/voice/inbound", async (req, res) => {
  try {
    const fromRaw = String(req.body?.From || "");
    const toRaw   = String(req.body?.To   || "");

    const from = normalizePhone(fromRaw, config.defaultCountryCode);
    const to   = normalizePhone(toRaw,   config.defaultCountryCode);

    console.log(`[voice/inbound] from=${from} to=${to}`);

    // Always respond with TwiML — Twilio requires a valid XML response
    res.set("Content-Type", "text/xml");

    if (!from || !to) {
      console.log("[voice/inbound] invalid from/to, skipping");
      return res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Olivia" language="en-AU">Thanks for calling. We will send you a text message shortly.</Say></Response>`);
    }

    const business = await getBusinessByTwilioNumber(to);
    if (!business) {
      console.log(`[voice/inbound] no active business found for ${to}`);
      return res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Olivia" language="en-AU">Thanks for calling. We will send you a text message shortly.</Say></Response>`);
    }

    console.log(`[voice/inbound] business=${business.name} id=${business.id}`);

    // Do SMS work before responding — serverless kills background async after res.send()
    try {
      const existing = await checkDuplicateLead(from, 30);
      if (existing) {
        console.log(`[voice/inbound] duplicate lead for ${from}, skipping`);
      } else {
        const lead = await createLead({
          businessId: business.id,
          name: null,
          phone: from,
          email: null,
          message: "Missed call",
        });

        await saveMessage({ leadId: lead.id, direction: "system", body: "📞 Missed call" });

        const flowConfig = getFlowConfig(business);

        if (!isWithinOperatingHours(business)) {
          console.log(`[voice/inbound] outside operating hours, sending after-hours SMS to ${from}`);
          const body = buildAfterHoursMessage(business);
          await sendSms({ from: business.twilio_from_number, to: from, body });
          await saveMessage({ leadId: lead.id, direction: "outbound", body });
        } else {
          const firstMessage = buildIntro(flowConfig, null, business.name);
          console.log(`[voice/inbound] sending first SMS to ${from}`);
          await sendSms({ from: business.twilio_from_number, to: from, body: firstMessage });
          await saveMessage({ leadId: lead.id, direction: "outbound", body: firstMessage });
          console.log(`[voice/inbound] SMS sent to ${from}`);
        }
      }
    } catch (err) {
      console.error("[voice/inbound] SMS flow error:", err);
    }

    return res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Olivia" language="en-AU">Thanks for calling. We will send you a text message shortly.</Say></Response>`);
  } catch (err) {
    console.error("[voice/inbound] error:", err);
    res.set("Content-Type", "text/xml");
    return res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Olivia" language="en-AU">Thanks for calling. We will send you a text message shortly.</Say></Response>`);
  }
});

// ─── Inbound SMS ───

app.post("/api/sms/inbound", async (req, res) => {
  try {
    const fromRaw = String(req.body?.From || "");
    const toRaw = String(req.body?.To || "");
    const bodyRaw = String(req.body?.Body || "").trim();

    const from = normalizePhone(fromRaw, config.defaultCountryCode);
    const to = normalizePhone(toRaw, config.defaultCountryCode);

    if (!from || !to) return res.status(400).send("Invalid Twilio payload");

    const business = await getBusinessByTwilioNumber(to);
    if (!business) return res.status(200).send("OK");

    const lead = await getLatestActiveLeadByBusinessAndPhone({ businessId: business.id, phone: from });
    if (!lead) return res.status(200).send("OK");

    // Record inbound message
    await saveMessage({ leadId: lead.id, direction: "inbound", body: bodyRaw });

    if (isStopKeyword(bodyRaw)) {
      await updateLead(lead.id, { status: "stopped", last_inbound_text: bodyRaw, finished_at: new Date().toISOString() });
      const stopBody = buildStoppedMessage(business.name);
      await sendSms({ from: business.twilio_from_number, to: lead.phone, body: stopBody });
      await saveMessage({ leadId: lead.id, direction: "outbound", body: stopBody });
      return res.status(200).send("OK");
    }

    const flowConfig = getFlowConfig(business);
    const step = getFlowStep(flowConfig, lead.current_step);
    if (!step) return res.status(200).send("OK");

    let valid = validateReply(step, bodyRaw);
    let effectiveReply = null;

    if (!valid && isAIConfigured() && !step.free_text) {
      try {
        const aiParsed = await parseNaturalLanguageReply(step, bodyRaw);
        if (aiParsed) { valid = true; effectiveReply = aiParsed; }
      } catch { /* fall through */ }
    }

    if (!valid) {
      const invalidMsg = step.invalid_text ? `${step.invalid_text}\n${step.question}` : step.question;
      await sendSms({ from: business.twilio_from_number, to: lead.phone, body: invalidMsg });
      await saveMessage({ leadId: lead.id, direction: "outbound", body: invalidMsg });
      return res.status(200).send("OK");
    }

    const replyText = typeof effectiveReply === "string" ? effectiveReply : bodyRaw;
    const parsed = parseReply(step, replyText);
    const nextAnswers = { ...(lead.answers || {}), ...parsed };

    if (isUrgentAnswer(step, replyText) && !nextAnswers.urgent_alert_sent && business.owner_notify_phone) {
      const ownerPhone = normalizePhone(business.owner_notify_phone, config.defaultCountryCode);
      const answerLabel = parsed[`${step.key}_label`] || bodyRaw;
      await sendSms({
        from: business.twilio_from_number,
        to: ownerPhone,
        body: buildUrgentAlert(lead, business, step.key, answerLabel),
      });
      nextAnswers.urgent_alert_sent = true;
    }

    const isFinalStep = lead.current_step >= flowConfig.steps.length;

    if (isFinalStep) {
      const completedLead = await updateLead(lead.id, {
        answers: nextAnswers,
        last_inbound_text: bodyRaw,
        current_step: lead.current_step + 1,
        status: "completed",
        finished_at: new Date().toISOString(),
      });

      const completionBody = buildCompletion(flowConfig, business);
      await sendSms({ from: business.twilio_from_number, to: lead.phone, body: completionBody });
      await saveMessage({ leadId: lead.id, direction: "outbound", body: completionBody });

      const summary = buildSummary(completedLead, business, flowConfig);
      await sendLeadNotifications({
        business, lead: completedLead, flowConfig, summary,
        sendSmsFn: sendSms, normalizePhoneFn: normalizePhone, defaultCountryCode: config.defaultCountryCode,
      });

      return res.status(200).send("OK");
    }

    const nextStepNumber = lead.current_step + 1;
    const nextStep = getFlowStep(flowConfig, nextStepNumber);

    await updateLead(lead.id, { answers: nextAnswers, last_inbound_text: bodyRaw, current_step: nextStepNumber });
    await sendSms({ from: business.twilio_from_number, to: lead.phone, body: nextStep.question });
    await saveMessage({ leadId: lead.id, direction: "outbound", body: nextStep.question });

    return res.status(200).send("OK");
  } catch (error) {
    console.error("/api/sms/inbound error", error);
    return res.status(200).send("OK");
  }
});

// ─── Demo ───

app.post("/api/demo", async (req, res) => {
  try {
    const { phone } = req.body || {};
    if (!phone) return res.status(400).json({ ok: false, error: "Phone number is required" });

    const normalizedPhone = normalizePhone(phone, config.defaultCountryCode);
    if (!normalizedPhone) return res.status(400).json({ ok: false, error: "Invalid phone format. Use +61... format." });

    const demoFromNumber = process.env.DEMO_TWILIO_NUMBER;
    if (!demoFromNumber) {
      return res.status(503).json({ ok: false, error: "Demo is temporarily unavailable." });
    }

    if (!config.twilio.accountSid || !config.twilio.authToken) {
      return res.status(500).json({ ok: false, error: "SMS service not configured" });
    }

    try {
      const recentCount = await checkDemoRateLimit(normalizedPhone);
      if (recentCount >= 2) return res.status(429).json({ ok: false, error: "Too many demo requests. Try again later." });
    } catch { /* rate limit table might not exist */ }

    const normalizedDemoNumber = normalizePhone(demoFromNumber, config.defaultCountryCode);
    let demoBusiness = await getBusinessByTwilioNumber(normalizedDemoNumber);

    if (!demoBusiness) {
      demoBusiness = await createBusiness({
        name: "Cove Demo",
        twilioFromNumber: normalizedDemoNumber,
        ownerNotifyPhone: normalizedPhone,
        industry: "dental",
      });
    } else {
      // Point the owner notification back to whoever is currently demoing
      await updateBusiness(demoBusiness.id, { ownerNotifyPhone: normalizedPhone });
      demoBusiness.owner_notify_phone = normalizedPhone;
    }

    const lead = await createLead({
      businessId: demoBusiness.id,
      name: "Demo User",
      phone: normalizedPhone,
      message: "Demo request from website",
    });

    const flowConfig = getFlowConfig(demoBusiness);
    const demoMessage = `Hi! This is a Cove demo. You'll get the exact SMS your leads receive.\n\n${flowConfig.steps[0].question}`;

    await sendSms({ from: demoFromNumber, to: normalizedPhone, body: demoMessage });

    try { await recordDemoSend(normalizedPhone); } catch { /* table might not exist */ }

    return res.json({ ok: true, message: "Demo SMS sent successfully" });
  } catch (error) {
    console.error("/api/demo error", error);
    return res.status(500).json({ ok: false, error: "Could not send demo. Please contact us directly." });
  }
});

// ─── Test SMS (from call forwarding setup page) ───
app.post("/api/demo/send", requireAuth, async (req, res) => {
  try {
    const { phone, message } = req.body || {};
    if (!phone) return res.status(400).json({ ok: false, error: "Phone number required" });
    const normalizedPhone = normalizePhone(phone, config.defaultCountryCode);
    if (!normalizedPhone) return res.status(400).json({ ok: false, error: "Invalid phone number" });
    const business = await getBusinessByUserId(req.userId);
    const fromNumber = business?.twilio_from_number || process.env.DEMO_TWILIO_NUMBER;
    if (!fromNumber) return res.status(503).json({ ok: false, error: "No number configured yet" });
    await sendSms({ from: fromNumber, to: normalizedPhone, body: message || "✅ Cove test — your setup is working!" });
    return res.json({ ok: true });
  } catch (err) {
    console.error("Test SMS error:", err);
    return res.status(500).json({ ok: false, error: "Could not send SMS" });
  }
});

// ─── Webhooks ───

app.post("/api/webhook/podium/:businessId", async (req, res) => {
  try {
    const business = await getBusinessById(req.params.businessId);
    if (!business) return res.status(404).json({ ok: false, error: "Business not found" });

    const { customerName, customer_name, name, customerPhone, customer_phone, phone, customerMessage, customer_message, message, customerEmail, customer_email, email } = req.body || {};
    const customerPhoneRaw = customerPhone || customer_phone || phone || null;
    if (!customerPhoneRaw) return res.status(400).json({ ok: false, error: "Phone number is required" });

    const normalizedPhone = normalizePhone(customerPhoneRaw, config.defaultCountryCode);
    if (!normalizedPhone) return res.status(400).json({ ok: false, error: "Invalid phone format" });

    const existingLead = await checkDuplicateLead(normalizedPhone, 30);
    if (existingLead) return res.json({ ok: true, leadId: existingLead.id });

    const lead = await createLead({
      businessId: business.id,
      name: customerName || customer_name || name || null,
      phone: normalizedPhone,
      email: customerEmail || customer_email || email || null,
      message: `[Podium] ${customerMessage || customer_message || message || ""}`.trim(),
    });

    const flowConfig = getFlowConfig(business);
    if (!isWithinOperatingHours(business)) {
      await sendSms({ from: business.twilio_from_number, to: normalizedPhone, body: buildAfterHoursMessage(business) });
      return res.json({ ok: true, leadId: lead.id });
    }

    await sendSms({ from: business.twilio_from_number, to: normalizedPhone, body: buildIntro(flowConfig, lead.name, business.name) });
    return res.json({ ok: true, leadId: lead.id });
  } catch (error) {
    console.error("Podium webhook error:", error);
    return res.status(500).json({ ok: false, error: "Internal server error" });
  }
});

app.post("/api/webhook/generic/:businessId", async (req, res) => {
  try {
    const business = await getBusinessById(req.params.businessId);
    if (!business) return res.status(404).json({ ok: false, error: "Business not found" });

    const { name, phone, email, message, source } = req.body || {};
    if (!phone) return res.status(400).json({ ok: false, error: "phone is required" });

    const normalizedPhone = normalizePhone(phone, config.defaultCountryCode);
    if (!normalizedPhone) return res.status(400).json({ ok: false, error: "Invalid phone format" });

    const existingLead = await checkDuplicateLead(normalizedPhone, 30);
    if (existingLead) return res.json({ ok: true, leadId: existingLead.id });

    const lead = await createLead({
      businessId: business.id,
      name: name || null,
      phone: normalizedPhone,
      email: email || null,
      message: source ? `[${source}] ${message || ""}` : message || null,
    });

    const flowConfig = getFlowConfig(business);
    if (!isWithinOperatingHours(business)) {
      await sendSms({ from: business.twilio_from_number, to: normalizedPhone, body: buildAfterHoursMessage(business) });
      return res.json({ ok: true, leadId: lead.id });
    }

    await sendSms({ from: business.twilio_from_number, to: normalizedPhone, body: buildIntro(flowConfig, name, business.name) });
    return res.json({ ok: true, leadId: lead.id });
  } catch (error) {
    console.error("Generic webhook error:", error);
    return res.status(500).json({ ok: false, error: "Internal server error" });
  }
});

// ─── Admin (your internal panel — kept separate from customer routes) ───

app.post("/api/admin/auth", async (req, res) => {
  const { password } = req.body || {};
  const adminPassword = process.env.ADMIN_PASSWORD || "cove2024";
  if (password === adminPassword) return res.json({ ok: true });
  return res.status(401).json({ ok: false, error: "Invalid password" });
});

app.get("/api/admin/businesses", async (req, res) => {
  try {
    const businesses = await getAllBusinesses();
    return res.json({ ok: true, businesses, count: businesses.length });
  } catch (error) {
    return res.status(500).json({ ok: false, error: "Internal server error" });
  }
});

app.get("/api/admin/leads", async (req, res) => {
  try {
    const leads = await getAllLeadsWithBusiness();
    return res.json({ ok: true, leads, count: leads.length });
  } catch (error) {
    return res.status(500).json({ ok: false, error: "Internal server error" });
  }
});

app.post("/api/admin/nudge", async (req, res) => {
  try {
    const businesses = await getAllBusinesses();
    let nudged = 0;
    for (const business of businesses) {
      const integrations = getIntegrationConfig(business);
      if (!integrations.nudge_after_minutes) continue;
      if (!isWithinOperatingHours(business)) continue;
      const leads = await getAllLeadsWithBusiness();
      const activeLeads = leads.filter((l) => l.business_id === business.id && l.status === "active");
      for (const lead of activeLeads) {
        if (!shouldNudge(lead, business)) continue;
        const flowConfig = getFlowConfig(business);
        await sendSms({ from: business.twilio_from_number, to: lead.phone, body: buildNudgeMessage(business, lead, flowConfig) });
        await updateLead(lead.id, { answers: { ...(lead.answers || {}), _nudge_sent: true } });
        nudged++;
      }
    }
    return res.json({ ok: true, nudged });
  } catch (error) {
    return res.status(500).json({ ok: false, error: "Internal server error" });
  }
});

// ─── SPA fallback ───

app.use((req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  res.sendFile(path.join(publicDir, "index.html"));
});

app.use((_req, res) => {
  res.status(404).json({ ok: false, error: "Not found" });
});

if (!process.env.VERCEL) {
  app.listen(config.port, () => {
    console.log(`Cove listening on port ${config.port}`);
  });
}

export default app;
