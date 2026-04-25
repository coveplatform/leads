import { neon } from "@neondatabase/serverless";
import { config } from "./config.js";

const sql = neon(config.databaseUrl);

// ─── Users ───

export async function createUser({ email, passwordHash, googleId, name }) {
  const rows = await sql`
    INSERT INTO users (email, password_hash, google_id, name)
    VALUES (${email}, ${passwordHash || null}, ${googleId || null}, ${name || null})
    RETURNING id, email, name, google_id, subscription_status, onboarding_complete, created_at
  `;
  return rows[0];
}

export async function getUserById(id) {
  const rows = await sql`
    SELECT id, email, name, google_id, stripe_customer_id, stripe_subscription_id,
           subscription_status, onboarding_complete, created_at
    FROM users WHERE id = ${id} LIMIT 1
  `;
  return rows[0] || null;
}

export async function getUserByEmail(email) {
  const rows = await sql`
    SELECT * FROM users WHERE email = ${email} LIMIT 1
  `;
  return rows[0] || null;
}

export async function getUserByGoogleId(googleId) {
  const rows = await sql`
    SELECT id, email, name, google_id, stripe_customer_id, stripe_subscription_id,
           subscription_status, onboarding_complete, created_at
    FROM users WHERE google_id = ${googleId} LIMIT 1
  `;
  return rows[0] || null;
}

export async function updateUser(userId, fields) {
  const rows = await sql`
    UPDATE users SET
      name                  = COALESCE(${fields.name ?? null}, name),
      stripe_customer_id    = COALESCE(${fields.stripeCustomerId ?? null}, stripe_customer_id),
      stripe_subscription_id = COALESCE(${fields.stripeSubscriptionId ?? null}, stripe_subscription_id),
      subscription_status   = COALESCE(${fields.subscriptionStatus ?? null}, subscription_status),
      onboarding_complete   = COALESCE(${fields.onboardingComplete ?? null}, onboarding_complete),
      updated_at            = now()
    WHERE id = ${userId}
    RETURNING id, email, name, stripe_customer_id, subscription_status, onboarding_complete
  `;
  return rows[0];
}

export async function getBusinessByUserId(userId) {
  const rows = await sql`
    SELECT * FROM businesses WHERE user_id = ${userId} LIMIT 1
  `;
  return rows[0] || null;
}

export async function getRecentLeadsByBusinessId(businessId, days = 7) {
  const rows = days == null
    ? await sql`
        SELECT id, name, phone, status, current_step, answers, created_at, finished_at
        FROM leads
        WHERE business_id = ${businessId}
        ORDER BY created_at DESC
        LIMIT 200
      `
    : await sql`
        SELECT id, name, phone, status, current_step, answers, created_at, finished_at
        FROM leads
        WHERE business_id = ${businessId}
          AND created_at > NOW() - ${days + ' days'}::interval
        ORDER BY created_at DESC
        LIMIT 200
      `;
  return rows;
}

export async function getBusinessById(id) {
  const rows = await sql`
    SELECT * FROM businesses
    WHERE id = ${id} AND is_active = true
    LIMIT 1
  `;
  return rows[0] || null;
}

export async function createWebsiteInquiry({
  name,
  email,
  phone,
  businessName,
  websiteUrl,
  message,
}) {
  const rows = await sql`
    INSERT INTO website_inquiries (name, email, phone, business_name, website_url, message, status)
    VALUES (${name || null}, ${email || null}, ${phone || null}, ${businessName || null}, ${websiteUrl || null}, ${message || null}, 'new')
    RETURNING id, created_at
  `;
  return rows[0];
}

export async function getBusinessByTwilioNumber(twilioTo) {
  const rows = await sql`
    SELECT * FROM businesses
    WHERE twilio_from_number = ${twilioTo} AND is_active = true
    LIMIT 1
  `;
  return rows[0] || null;
}

export async function createLead({ businessId, name, phone, email, message }) {
  const rows = await sql`
    INSERT INTO leads (business_id, name, phone, email, message, status, current_step, answers)
    VALUES (${businessId}, ${name || null}, ${phone}, ${email || null}, ${message || null}, 'active', 1, '{}')
    RETURNING *
  `;
  return rows[0];
}

// Returns true if this phone has ever sent STOP to this business.
// Must be checked before sending any outbound SMS to a number.
export async function hasPhoneOptedOut(businessId, phone) {
  const rows = await sql`
    SELECT 1 FROM leads
    WHERE business_id = ${businessId}
      AND phone = ${phone}
      AND status = 'stopped'
    LIMIT 1
  `;
  return rows.length > 0;
}

export async function getLatestActiveLeadByBusinessAndPhone({ businessId, phone }) {
  const rows = await sql`
    SELECT * FROM leads
    WHERE business_id = ${businessId}
      AND phone = ${phone}
      AND status = 'active'
    ORDER BY created_at DESC
    LIMIT 1
  `;
  return rows[0] || null;
}

export async function updateLead(leadId, fields) {
  const answers = fields.answers ? JSON.stringify(fields.answers) : undefined;
  const rows = await sql`
    UPDATE leads SET
      answers       = COALESCE(${answers}::jsonb, answers),
      current_step  = COALESCE(${fields.current_step ?? null}, current_step),
      status        = COALESCE(${fields.status ?? null}, status),
      last_inbound_text = COALESCE(${fields.last_inbound_text ?? null}, last_inbound_text),
      finished_at   = COALESCE(${fields.finished_at ?? null}, finished_at),
      updated_at    = now()
    WHERE id = ${leadId}
    RETURNING *
  `;
  return rows[0];
}

export async function createBusiness({
  name,
  twilioFromNumber,
  ownerNotifyPhone,
  ownerNotifyEmail,
  bookingLink,
  industry,
  flowConfig,
  isActive = true,
  userId = null,
}) {
  const flowJson = flowConfig ? JSON.stringify(flowConfig) : null;
  const rows = await sql`
    INSERT INTO businesses (name, twilio_from_number, owner_notify_phone, owner_notify_email, booking_link, is_active, industry, flow_config, user_id)
    VALUES (${name}, ${twilioFromNumber || null}, ${ownerNotifyPhone || null}, ${ownerNotifyEmail || null}, ${bookingLink || null}, ${isActive}, ${industry || null}, ${flowJson}::jsonb, ${userId})
    RETURNING *
  `;
  return rows[0];
}

export async function updateBusiness(businessId, fields) {
  const flowJson = fields.flowConfig ? JSON.stringify(fields.flowConfig) : undefined;
  const rows = await sql`
    UPDATE businesses SET
      name              = COALESCE(${fields.name ?? null}, name),
      owner_notify_phone = COALESCE(${fields.ownerNotifyPhone ?? null}, owner_notify_phone),
      owner_notify_email = COALESCE(${fields.ownerNotifyEmail ?? null}, owner_notify_email),
      booking_link      = COALESCE(${fields.bookingLink ?? null}, booking_link),
      industry          = COALESCE(${fields.industry ?? null}, industry),
      flow_config       = COALESCE(${flowJson ?? null}::jsonb, flow_config),
      operating_hours   = COALESCE(${fields.operatingHours ? JSON.stringify(fields.operatingHours) : null}::jsonb, operating_hours),
      integrations      = COALESCE(${fields.integrations ? JSON.stringify(fields.integrations) : null}::jsonb, integrations),
      user_id           = COALESCE(${fields.userId ?? null}, user_id),
      is_active         = COALESCE(${fields.isActive ?? null}, is_active),
      forwarding_verified = COALESCE(${fields.forwardingVerified ?? null}, forwarding_verified)
    WHERE id = ${businessId}
    RETURNING *
  `;
  return rows[0];
}

export async function getAllBusinesses() {
  const rows = await sql`
    SELECT * FROM businesses
    WHERE is_active = true
    ORDER BY created_at DESC
  `;
  return rows;
}

export async function getSignupFunnel() {
  const rows = await sql`
    SELECT
      u.id           AS user_id,
      u.email,
      u.name,
      u.subscription_status,
      u.onboarding_complete,
      u.created_at   AS signed_up_at,
      b.id           AS business_id,
      b.name         AS business_name,
      b.twilio_from_number,
      b.is_active,
      b.forwarding_verified,
      COUNT(l.id)::int AS lead_count
    FROM users u
    LEFT JOIN businesses b ON b.user_id = u.id
    LEFT JOIN leads l ON l.business_id = b.id
    GROUP BY u.id, u.email, u.name, u.subscription_status, u.onboarding_complete, u.created_at,
             b.id, b.name, b.twilio_from_number, b.is_active, b.forwarding_verified
    ORDER BY u.created_at DESC
  `;
  return rows;
}

export async function getAllLeadsWithBusiness() {
  const rows = await sql`
    SELECT 
      l.*,
      b.name as business_name,
      b.twilio_from_number
    FROM leads l
    JOIN businesses b ON l.business_id = b.id
    ORDER BY l.created_at DESC
  `;
  return rows;
}

export async function checkDemoRateLimit(phone) {
  const rows = await sql`
    SELECT COUNT(*) as cnt FROM demo_rate_limits
    WHERE phone = ${phone} AND sent_at > NOW() - INTERVAL '1 hour'
  `;
  return Number(rows[0]?.cnt || 0);
}

export async function recordDemoSend(phone) {
  await sql`INSERT INTO demo_rate_limits (phone) VALUES (${phone})`;
}

export async function checkDuplicateLead(phone, minutesWindow) {
  const rows = await sql`
    SELECT id FROM leads
    WHERE phone = ${phone}
      AND status = 'active'
      AND created_at > NOW() - ${minutesWindow + ' minutes'}::interval
    LIMIT 1
  `;
  return rows[0] || null;
}

export async function saveMessage({ leadId, direction, body }) {
  try {
    await sql`
      INSERT INTO messages (lead_id, direction, body)
      VALUES (${leadId}, ${direction}, ${body})
    `;
  } catch (err) {
    console.error("saveMessage error:", err);
  }
}

export async function getMessagesByLeadId(leadId) {
  const rows = await sql`
    SELECT id, direction, body, created_at
    FROM messages
    WHERE lead_id = ${leadId}
    ORDER BY created_at ASC
  `;
  return rows;
}

// ─── Password Reset ───

export async function setPasswordResetToken(userId, token, expiresAt) {
  await sql`
    UPDATE users
    SET password_reset_token = ${token}, password_reset_expires = ${expiresAt}, updated_at = now()
    WHERE id = ${userId}
  `;
}

export async function getUserByResetToken(token) {
  const rows = await sql`
    SELECT id, email, name, password_reset_expires
    FROM users
    WHERE password_reset_token = ${token}
      AND password_reset_expires > now()
    LIMIT 1
  `;
  return rows[0] || null;
}

export async function clearPasswordResetToken(userId) {
  await sql`
    UPDATE users
    SET password_reset_token = NULL, password_reset_expires = NULL, updated_at = now()
    WHERE id = ${userId}
  `;
}

export async function updatePassword(userId, passwordHash) {
  await sql`
    UPDATE users SET password_hash = ${passwordHash}, updated_at = now()
    WHERE id = ${userId}
  `;
}

// ─── Google OAuth ───

export async function linkGoogleAccount(userId, googleId) {
  await sql`
    UPDATE users SET google_id = ${googleId}, updated_at = now()
    WHERE id = ${userId}
  `;
}

// ─── Stripe / Subscription ───

export async function getUserByStripeCustomerId(stripeCustomerId) {
  const rows = await sql`
    SELECT * FROM users WHERE stripe_customer_id = ${stripeCustomerId} LIMIT 1
  `;
  return rows[0] || null;
}

export async function activateUserSubscription(userId, subscriptionId) {
  await sql`
    UPDATE users SET
      stripe_subscription_id = ${subscriptionId},
      subscription_status    = 'active',
      onboarding_complete    = true,
      trial_started_at       = COALESCE(trial_started_at, now()),
      updated_at             = now()
    WHERE id = ${userId}
  `;
}

export async function syncUserSubscriptionStatus(stripeCustomerId, subscriptionId, status) {
  await sql`
    UPDATE users SET
      stripe_subscription_id = ${subscriptionId},
      subscription_status    = ${status},
      updated_at             = now()
    WHERE stripe_customer_id = ${stripeCustomerId}
  `;
}

// ─── Trial Emails ───

export async function getUserWithTrialInfo(userId) {
  const rows = await sql`
    SELECT id, email, name, trial_started_at, trial_emails_sent
    FROM users WHERE id = ${userId} LIMIT 1
  `;
  return rows[0] || null;
}

export async function markTrialEmailSent(userId, bit) {
  await sql`
    UPDATE users
    SET trial_emails_sent = COALESCE(trial_emails_sent, 0) | ${bit}
    WHERE id = ${userId}
  `;
}

// ─── Business Activation ───

export async function setBusinessActive(businessId, isActive) {
  await sql`
    UPDATE businesses SET is_active = ${isActive}, updated_at = now()
    WHERE id = ${businessId}
  `;
}

export async function setBusinessActiveByUserId(userId, isActive) {
  await sql`
    UPDATE businesses SET is_active = ${isActive}, updated_at = now()
    WHERE user_id = ${userId}
  `;
}

// ─── Onboarding ───

export async function resetOnboarding(userId) {
  await sql`
    UPDATE users SET onboarding_complete = false, updated_at = now()
    WHERE id = ${userId}
  `;
  await sql`
    UPDATE businesses SET twilio_from_number = null, is_active = false
    WHERE user_id = ${userId}
  `;
}

// ─── Twilio Provisioning ───

export async function getBusinessNameById(businessId) {
  const rows = await sql`
    SELECT name FROM businesses WHERE id = ${businessId} LIMIT 1
  `;
  return rows[0]?.name || null;
}

export async function saveTwilioNumber(businessId, phoneNumber) {
  await sql`
    UPDATE businesses SET twilio_from_number = ${phoneNumber} WHERE id = ${businessId}
  `;
}

// ─── Lead Actions ───

export async function markLeadCalled(leadId, businessId) {
  const rows = await sql`
    SELECT id, answers FROM leads
    WHERE id = ${leadId} AND business_id = ${businessId}
    LIMIT 1
  `;
  if (!rows.length) return null;
  const answers = {
    ...(rows[0].answers || {}),
    _called_back: true,
    _called_back_at: new Date().toISOString(),
  };
  await sql`
    UPDATE leads SET answers = ${JSON.stringify(answers)}::jsonb WHERE id = ${rows[0].id}
  `;
  return true;
}

export async function getLeadByIdAndBusiness(leadId, businessId) {
  const rows = await sql`
    SELECT id FROM leads WHERE id = ${leadId} AND business_id = ${businessId} LIMIT 1
  `;
  return rows[0] || null;
}
