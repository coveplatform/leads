import express from "express";
import cookieParser from "cookie-parser";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
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
  buildExitSummary,
  isStopKeyword,
  buildStoppedMessage,
  getIndustryList,
  INDUSTRY_TEMPLATES,
} from "./flow-engine.js";
import {
  generateFlowForIndustry,
  parseNaturalLanguageReply,
  condenseFreeTextAnswers,
  isAIConfigured,
} from "./ai.js";
import {
  detectSpecialIntent,
  isMeaninglessReply,
  extractLeadingOption,
  getRetryCount,
  incrementRetryAnswers,
  MAX_RETRIES_MULTIPLE_CHOICE,
  MAX_RETRIES_FREE_TEXT,
} from "./reply-processor.js";
import {
  createWebsiteInquiry,
  createLead,
  getBusinessById,
  getBusinessByTwilioNumber,
  getLatestActiveLeadByBusinessAndPhone,
  hasPhoneOptedOut,
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
  setPasswordResetToken,
  getUserByResetToken,
  clearPasswordResetToken,
  updatePassword,
} from "./db.js";
import {
  isWithinOperatingHours,
  buildAfterHoursMessage,
  sendLeadNotifications,
  shouldNudge,
  buildNudgeMessage,
  getIntegrationConfig,
  sendEmailViaResend,
} from "./integrations.js";
import { normalizePhone } from "./phone.js";
import { sendSms } from "./sms.js";
import { day1Email, day4Email, day11Email } from "./trial-emails.js";
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

app.get("/privacy", (_req, res) => {
  res.sendFile(path.join(publicDir, "privacy.html"));
});

app.get("/terms", (_req, res) => {
  res.sendFile(path.join(publicDir, "terms.html"));
});

app.get("/reset-password", (_req, res) => {
  res.sendFile(path.join(publicDir, "reset-password.html"));
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

app.post("/api/auth/forgot-password", async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ ok: false, error: "Email is required" });

    const user = await getUserByEmail(email.toLowerCase().trim());
    // Always return success — don't reveal whether the email exists
    if (!user || !user.password_hash) return res.json({ ok: true });

    const token = randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour
    await setPasswordResetToken(user.id, token, expires);

    const resetUrl = `${config.baseUrl}/reset-password?token=${token}`;
    await sendEmailViaResend({
      to: user.email,
      subject: "Reset your Cove password",
      html: `<p>Hi ${user.name || "there"},</p>
<p>You requested a password reset for your Cove account. Click the button below to set a new password:</p>
<p style="margin:24px 0"><a href="${resetUrl}" style="background:#e8540a;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;font-family:sans-serif;display:inline-block">Reset password</a></p>
<p style="color:#888;font-size:13px">This link expires in 1 hour. If you didn't request this, you can ignore this email.</p>
<p style="color:#888;font-size:13px">— The Cove team</p>`,
      text: `Reset your Cove password:\n\n${resetUrl}\n\nThis link expires in 1 hour.`,
    });

    return res.json({ ok: true });
  } catch (err) {
    console.error("Forgot password error:", err);
    return res.json({ ok: true }); // Don't expose errors
  }
});

app.post("/api/auth/reset-password", async (req, res) => {
  try {
    const { token, password } = req.body || {};
    if (!token || !password) {
      return res.status(400).json({ ok: false, error: "Token and password are required" });
    }
    if (password.length < 8) {
      return res.status(400).json({ ok: false, error: "Password must be at least 8 characters" });
    }

    const user = await getUserByResetToken(token);
    if (!user) {
      return res.status(400).json({ ok: false, error: "This reset link has expired or is invalid. Please request a new one." });
    }

    const passwordHash = await hashPassword(password);
    await updatePassword(user.id, passwordHash);
    await clearPasswordResetToken(user.id);

    return res.json({ ok: true });
  } catch (err) {
    console.error("Reset password error:", err);
    return res.status(500).json({ ok: false, error: "Could not reset password. Please try again." });
  }
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

// ─── Update profile ───
app.patch("/api/auth/update-profile", requireAuth, async (req, res) => {
  try {
    const { name, currentPassword, newPassword } = req.body;
    const user = await getUserById(req.userId);
    if (!user) return res.status(404).json({ ok: false, error: "User not found" });

    if (newPassword) {
      if (!currentPassword) return res.status(400).json({ ok: false, error: "Current password required." });
      if (user.password_hash) {
        const valid = await verifyPassword(currentPassword, user.password_hash);
        if (!valid) return res.status(400).json({ ok: false, error: "Current password is incorrect." });
      }
      if (newPassword.length < 8) return res.status(400).json({ ok: false, error: "Password must be at least 8 characters." });
      const { neon } = await import("@neondatabase/serverless");
      const sql = neon(config.databaseUrl);
      const hash = await hashPassword(newPassword);
      await sql`UPDATE users SET password_hash = ${hash}, updated_at = now() WHERE id = ${req.userId}`;
    }

    const updated = await updateUser(req.userId, { name: name || user.name });
    return res.json({ ok: true, user: updated });
  } catch (err) {
    console.error("Update profile error:", err);
    return res.status(500).json({ ok: false, error: "Could not update profile." });
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

// ─── Trial email check (called from dashboard on load) ───
app.post("/api/trial/check", requireAuth, async (req, res) => {
  try {
    const { neon } = await import("@neondatabase/serverless");
    const sql = neon(config.databaseUrl);

    const users = await sql`SELECT * FROM users WHERE id = ${req.userId} LIMIT 1`;
    const user = users[0];
    if (!user || !user.trial_started_at) return res.json({ ok: true, sent: [] });

    const daysSince = (Date.now() - new Date(user.trial_started_at).getTime()) / 86400000;
    const sent = user.trial_emails_sent || 0;
    const dispatched = [];

    const business = await getBusinessByUserId(req.userId);
    const leads = business ? await getRecentLeadsByBusinessId(business.id, 30) : [];
    const leadCount = leads.filter(l => l.status === "completed").length;

    // Day 4 email (bit 1 = 2)
    if (daysSince >= 3 && !(sent & 2) && leadCount === 0) {
      const { subject, html, text } = day4Email({ name: user.name, bizName: business?.name });
      await sendEmailViaResend({ to: user.email, subject, html, text });
      await sql`UPDATE users SET trial_emails_sent = COALESCE(trial_emails_sent, 0) | 2 WHERE id = ${user.id}`;
      dispatched.push("day4");
    }

    // Day 11 email (bit 2 = 4)
    if (daysSince >= 10 && !(sent & 4)) {
      const { subject, html, text } = day11Email({ name: user.name, bizName: business?.name, leadCount });
      await sendEmailViaResend({ to: user.email, subject, html, text });
      await sql`UPDATE users SET trial_emails_sent = COALESCE(trial_emails_sent, 0) | 4 WHERE id = ${user.id}`;
      dispatched.push("day11");
    }

    return res.json({ ok: true, sent: dispatched });
  } catch (err) {
    console.error("Trial check error:", err);
    return res.json({ ok: true, sent: [] }); // silent fail — never block dashboard load
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
    // Dev mode: if Stripe not configured, auto-activate (number provisioned later at call forwarding step)
    if (!isStripeConfigured()) {
      const business = await getBusinessByUserId(req.userId);
      if (business) {
        await updateBusiness(business.id, { isActive: true });
      }
      await updateUser(req.userId, { onboardingComplete: true, subscriptionStatus: "active" });
      return res.json({ ok: true, url: `${config.baseUrl.trim()}/onboarding?step=complete` });
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
      trial_started_at = COALESCE(trial_started_at, now()),
      updated_at = now()
    WHERE id = ${user.id}
  `;

  // Send day 1 activation email (call forwarding nudge)
  try {
    const businesses = await sql`SELECT * FROM businesses WHERE user_id = ${user.id} LIMIT 1`;
    const biz = businesses[0];
    const { subject, html, text } = day1Email({
      name: user.name,
      bizName: biz?.name,
      coveNumber: biz?.twilio_from_number,
    });
    sendEmailViaResend({ to: user.email, subject, html, text }).catch(() => {});
    await sql`UPDATE users SET trial_emails_sent = COALESCE(trial_emails_sent, 0) | 1 WHERE id = ${user.id}`;
  } catch (e) {
    console.error("Day 1 trial email error:", e);
  }

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

    // Always use the production URL for webhooks, even when running locally
    const rawBase = (config.baseUrl || "").trim();
    const baseUrl = (rawBase.startsWith("http://localhost") || rawBase.startsWith("http://127"))
      ? (process.env.PRODUCTION_URL || "https://usecove.app").trim()
      : rawBase;

    const smsUrl   = `${baseUrl}/api/sms/inbound`;
    const voiceUrl = `${baseUrl}/api/voice/inbound`;

    const addressSid         = process.env.TWILIO_ADDRESS_SID          || null;
    const bundleSid          = process.env.TWILIO_BUNDLE_SID           || null;
    const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID || null;

    // Try AU mobile first (needs regulatory bundle), then AU local
    let phoneNumber = null;
    for (const [country, type] of [["AU", "mobile"], ["AU", "local"]]) {
      try {
        if (country === "AU" && type === "mobile" && !bundleSid) {
          console.warn("[provision] Skipping AU mobile — TWILIO_BUNDLE_SID not set");
          continue;
        }
        const list = await client.availablePhoneNumbers(country)[type].list({ smsEnabled: true, limit: 20 });
        if (!list.length) { console.warn(`[provision] No ${country} ${type} numbers available`); continue; }
        const pick = list.find(n => !n.beta) || list[0];
        phoneNumber = pick.phoneNumber;
        console.log(`[provision] Selected ${country} ${type}: ${phoneNumber}`);
        break;
      } catch (e) { console.warn(`[provision] ${country} ${type} search failed:`, e.message); }
    }

    if (!phoneNumber) {
      console.error("[provision] No AU numbers available");
      return null;
    }

    // Purchase the number with voice + SMS webhooks
    const createParams = {
      phoneNumber,
      smsUrl,
      smsMethod: "POST",
      voiceUrl,
      voiceMethod: "POST",
    };
    if (bundleSid)  createParams.bundleSid  = bundleSid;
    if (addressSid) createParams.addressSid = addressSid;

    const purchased = await client.incomingPhoneNumbers.create(createParams);
    console.log(`[provision] Purchased ${purchased.phoneNumber} (SID: ${purchased.sid})`);

    // Add to Messaging Service Sender Pool for compliance + opt-out management
    if (messagingServiceSid) {
      try {
        await client.messaging.v1.services(messagingServiceSid)
          .phoneNumbers
          .create({ phoneNumberSid: purchased.sid });
        console.log(`[provision] Added to Messaging Service ${messagingServiceSid}`);
      } catch (e) {
        console.warn("[provision] Could not add to Messaging Service:", e.message);
      }
    }

    // Save to DB
    const { neon } = await import("@neondatabase/serverless");
    const sql = neon(config.databaseUrl);
    await sql`UPDATE businesses SET twilio_from_number = ${purchased.phoneNumber} WHERE id = ${businessId}`;

    return purchased.phoneNumber;
  } catch (err) {
    console.error("[provision] Twilio provisioning error:", err);
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

    const optedOut = await hasPhoneOptedOut(businessId, normalizedPhone);
    if (optedOut) {
      return res.status(403).json({ ok: false, error: "This number has opted out of SMS messages from this business" });
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

    // Email notification to hello@usecove.app
    sendEmailViaResend({
      to: "hello@usecove.app",
      subject: `New enquiry from ${name} — ${businessName}`,
      text: [
        `Name: ${name}`,
        `Email: ${email}`,
        `Phone: ${phone || "—"}`,
        `Business: ${businessName}`,
        websiteUrl ? `Website: ${websiteUrl}` : null,
        message ? `\nMessage: ${message}` : null,
      ].filter(Boolean).join("\n"),
    }).catch((err) => console.error("Inquiry email error:", err));

    // SMS backup notification
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
    const fromRaw         = String(req.body?.From          || "");
    const toRaw           = String(req.body?.To            || "");
    const forwardedFromRaw= String(req.body?.ForwardedFrom || "");

    const from          = normalizePhone(fromRaw,          config.defaultCountryCode);
    const to            = normalizePhone(toRaw,            config.defaultCountryCode);
    const forwardedFrom = forwardedFromRaw ? normalizePhone(forwardedFromRaw, config.defaultCountryCode) : null;

    console.log(`[voice/inbound] from=${from} to=${to} forwardedFrom=${forwardedFrom}`);

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

    // ── Forwarding detection ──
    // If ForwardedFrom matches the owner's registered number, forwarding is confirmed.
    // Mark the business as verified (fire-and-forget is fine here).
    if (forwardedFrom && !business.forwarding_verified) {
      const ownerPhone = business.owner_notify_phone
        ? normalizePhone(business.owner_notify_phone, config.defaultCountryCode)
        : null;
      if (ownerPhone && forwardedFrom === ownerPhone) {
        console.log(`[voice/inbound] forwarding verified for business ${business.id}`);
        updateBusiness(business.id, { forwardingVerified: true }).catch(err =>
          console.error("[voice/inbound] forwarding verify update error:", err)
        );
        business.forwarding_verified = true;
      }
    }

    // ── Test call detection ──
    // When Cove places a test call (from the Twilio number to the owner's phone),
    // if the owner doesn't answer it gets forwarded back here. Detect by:
    // ForwardedFrom = owner's number AND From = our own Twilio number (calling itself).
    const isTestCall = forwardedFrom &&
      from === normalizePhone(business.twilio_from_number, config.defaultCountryCode);
    if (isTestCall) {
      console.log(`[voice/inbound] test call — skipping lead creation for business ${business.id}`);
      return res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`);
    }

    // Do SMS work before responding — serverless kills background async after res.send()
    try {
      const optedOut = await hasPhoneOptedOut(business.id, from);
      if (optedOut) {
        console.log(`[voice/inbound] ${from} has opted out, skipping SMS`);
      } else {
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
      } // end opted-out else
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

// ─── Forwarding verification: start test call ───

app.post("/api/me/verify-forwarding/start", requireAuth, async (req, res) => {
  try {
    if (!config.twilio.accountSid || !config.twilio.authToken) {
      return res.status(503).json({ ok: false, error: "Twilio not configured" });
    }
    const business = await getBusinessByUserId(req.userId);
    if (!business) return res.status(404).json({ ok: false, error: "No business found" });
    if (!business.owner_notify_phone) {
      return res.status(400).json({ ok: false, error: "No phone number on file — add one in Settings first" });
    }
    if (!business.twilio_from_number) {
      return res.status(400).json({ ok: false, error: "Cove number not provisioned yet" });
    }

    const client = twilio(config.twilio.accountSid, config.twilio.authToken);
    // Pass twiml inline so Twilio doesn't need to fetch a URL — avoids any localhost/deployment issues
    await client.calls.create({
      to:      business.owner_notify_phone,
      from:    business.twilio_from_number,
      twiml:   '<Response><Say voice="Polly.Olivia" language="en-AU">This is a Cove forwarding test. You can hang up — no need to answer next time.</Say><Hangup/></Response>',
      timeout: 20, // ring 20s then hang up so carrier forwarding kicks in
    });

    console.log(`[verify-forwarding] test call placed to ${business.owner_notify_phone} for business ${business.id}`);
    return res.json({ ok: true });
  } catch (err) {
    console.error("[verify-forwarding/start] error:", err);
    return res.status(500).json({ ok: false, error: "Could not place test call — " + (err.message || "unknown error") });
  }
});

// ─── Forwarding verification: check status ───

app.get("/api/me/forwarding-status", requireAuth, async (req, res) => {
  try {
    const business = await getBusinessByUserId(req.userId);
    if (!business) return res.status(404).json({ ok: false, error: "No business found" });
    return res.json({ ok: true, forwarding_verified: !!business.forwarding_verified });
  } catch (err) {
    console.error("[forwarding-status] error:", err);
    return res.status(500).json({ ok: false, error: "Could not check status" });
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

    // ─── STOP keyword ───
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

    // ─── Helper: graceful exit (skip remaining questions, notify owner) ───
    const gracefulExit = async (reason) => {
      const msg = `No worries — someone from ${business.name || "the team"} will call you back shortly.`;
      await sendSms({ from: business.twilio_from_number, to: lead.phone, body: msg });
      await saveMessage({ leadId: lead.id, direction: "outbound", body: msg });

      if (business.owner_notify_phone) {
        const ownerPhone = normalizePhone(business.owner_notify_phone, config.defaultCountryCode);
        const alert = buildExitSummary(lead, business, bodyRaw, reason);
        await sendSms({ from: business.twilio_from_number, to: ownerPhone, body: alert });
      }

      await updateLead(lead.id, {
        status: "completed",
        last_inbound_text: bodyRaw,
        finished_at: new Date().toISOString(),
        answers: { ...(lead.answers || {}), _exit_reason: reason, _last_attempt: bodyRaw },
      });
    };

    // ─── Pre-processor: special intent detection ───
    const intent = detectSpecialIntent(bodyRaw);

    if (intent === "call_me") {
      await gracefulExit("call_requested");
      return res.status(200).send("OK");
    }

    if (intent === "confused") {
      const clarify = `This is ${business.name || "a local business"} — you missed a call from us earlier. We're just checking in.\n\n${step.question}`;
      await sendSms({ from: business.twilio_from_number, to: lead.phone, body: clarify });
      await saveMessage({ leadId: lead.id, direction: "outbound", body: clarify });
      return res.status(200).send("OK");
    }

    if (intent === "price_question") {
      const deflect = `Great question — we'll cover that when we call you. First:\n\n${step.question}`;
      await sendSms({ from: business.twilio_from_number, to: lead.phone, body: deflect });
      await saveMessage({ leadId: lead.id, direction: "outbound", body: deflect });
      return res.status(200).send("OK");
    }

    // ─── Validate reply ───
    let valid = validateReply(step, bodyRaw);
    let effectiveReply = null;

    // For A/B/C: try extracting a leading option letter before giving up
    // e.g. "A please", "B - it's urgent", "1) yes"
    if (!valid && !step.free_text && step.options?.length) {
      const leading = extractLeadingOption(bodyRaw, step.options.map((o) => o.value));
      if (leading) {
        valid = true;
        effectiveReply = leading;
      }
    }

    // AI fallback for A/B/C — last resort before retry logic
    if (!valid && isAIConfigured() && !step.free_text) {
      try {
        const aiParsed = await parseNaturalLanguageReply(step, bodyRaw);
        if (aiParsed) { valid = true; effectiveReply = aiParsed; }
      } catch { /* fall through */ }
    }

    // For free text: check if the reply is meaningful enough
    if (valid && step.free_text && isMeaninglessReply(bodyRaw)) {
      const retryCount = getRetryCount(lead.answers, lead.current_step);
      if (retryCount < MAX_RETRIES_FREE_TEXT) {
        // Prompt once for a better answer
        const updatedAnswers = incrementRetryAnswers(lead.answers, lead.current_step);
        await updateLead(lead.id, { answers: updatedAnswers });
        const nudge = `Just a quick description is fine — what do you need help with?`;
        await sendSms({ from: business.twilio_from_number, to: lead.phone, body: nudge });
        await saveMessage({ leadId: lead.id, direction: "outbound", body: nudge });
        return res.status(200).send("OK");
      }
      // retryCount >= MAX_RETRIES_FREE_TEXT: accept whatever they sent and continue
    }

    // For A/B/C: retry or graceful exit after too many failures
    if (!valid) {
      const retryCount = getRetryCount(lead.answers, lead.current_step);

      if (retryCount >= MAX_RETRIES_MULTIPLE_CHOICE) {
        await gracefulExit("max_retries");
        return res.status(200).send("OK");
      }

      const updatedAnswers = incrementRetryAnswers(lead.answers, lead.current_step);
      await updateLead(lead.id, { answers: updatedAnswers });

      const invalidMsg = step.invalid_text
        ? `${step.invalid_text}\n\n${step.question}`
        : step.question;
      await sendSms({ from: business.twilio_from_number, to: lead.phone, body: invalidMsg });
      await saveMessage({ leadId: lead.id, direction: "outbound", body: invalidMsg });
      return res.status(200).send("OK");
    }

    // ─── Valid reply — parse and advance ───
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
      // Condense long free text answers for the owner summary
      let finalAnswers = nextAnswers;
      if (isAIConfigured()) {
        try { finalAnswers = await condenseFreeTextAnswers(flowConfig, nextAnswers); } catch { /* keep originals */ }
      }

      const completedLead = await updateLead(lead.id, {
        answers: finalAnswers,
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
    if (!config.twilio.accountSid || !config.twilio.authToken) {
      return res.status(503).json({ ok: false, error: "SMS not available — Twilio not configured in dev mode." });
    }
    const business = await getBusinessByUserId(req.userId);
    const fromNumber = business?.twilio_from_number || process.env.DEMO_TWILIO_NUMBER;
    if (!fromNumber) return res.status(503).json({ ok: false, error: "No number configured yet" });
    await sendSms({ from: fromNumber, to: normalizedPhone, body: message || "✅ Cove test — your setup is working!" });
    return res.json({ ok: true });
  } catch (err) {
    console.error("Test SMS error:", err);
    return res.status(500).json({ ok: false, error: "Could not send SMS — " + (err.message || "unknown error") });
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
