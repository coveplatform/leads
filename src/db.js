import { neon } from "@neondatabase/serverless";
import { config } from "./config.js";

const sql = neon(config.databaseUrl);

// ─── Users ───
// Owners log in with email + password. Accounts are created by the onboarding
// script; there is no public signup.

export async function createUser({ email, passwordHash, name }) {
  const rows = await sql`
    INSERT INTO users (email, password_hash, name)
    VALUES (${email}, ${passwordHash || null}, ${name || null})
    RETURNING id, email, name, created_at
  `;
  return rows[0];
}

export async function getUserById(id) {
  const rows = await sql`
    SELECT id, email, name, created_at
    FROM users WHERE id = ${id} LIMIT 1
  `;
  return rows[0] || null;
}

// Includes password_hash — for login checks only, never send to the client.
export async function getUserByEmail(email) {
  const rows = await sql`
    SELECT id, email, name, password_hash, created_at
    FROM users WHERE email = ${email} LIMIT 1
  `;
  return rows[0] || null;
}

export async function getUserPasswordHash(userId) {
  const rows = await sql`SELECT password_hash FROM users WHERE id = ${userId} LIMIT 1`;
  return rows[0]?.password_hash || null;
}

export async function updateUser(userId, fields) {
  const rows = await sql`
    UPDATE users SET
      name       = COALESCE(${fields.name ?? null}, name),
      updated_at = now()
    WHERE id = ${userId}
    RETURNING id, email, name
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
  return days == null
    ? sql`
        SELECT id, name, phone, status, current_step, answers, message, outcome, job_value,
               appointment_at, booking_status, created_at, finished_at
        FROM leads WHERE business_id = ${businessId}
        ORDER BY created_at DESC LIMIT 200`
    : sql`
        SELECT id, name, phone, status, current_step, answers, message, outcome, job_value,
               appointment_at, booking_status, created_at, finished_at
        FROM leads WHERE business_id = ${businessId}
          AND created_at > NOW() - ${days + ' days'}::interval
        ORDER BY created_at DESC LIMIT 200`;
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

// ─── Booking writes (migration 009) ───
// One write path for the booking step: stamp the proposed slot and (when
// finalising) the completed status. Every field is COALESCE-guarded so
// callers set only what they need. Lives apart from updateLead so the generic
// lead update path stays independent of the 009 columns.
export async function setLeadBooking(leadId, {
  appointmentAt = null,
  bookingStatus = null,
  answers = null,
  status = null,
  currentStep = null,
  lastInboundText = null,
  finishedAt = null,
} = {}) {
  const answersJson = answers ? JSON.stringify(answers) : undefined;
  const rows = await sql`
    UPDATE leads SET
      appointment_at    = COALESCE(${appointmentAt}::timestamptz, appointment_at),
      booking_status    = COALESCE(${bookingStatus}, booking_status),
      answers           = COALESCE(${answersJson}::jsonb, answers),
      status            = COALESCE(${status}, status),
      current_step      = COALESCE(${currentStep ?? null}, current_step),
      last_inbound_text = COALESCE(${lastInboundText}, last_inbound_text),
      finished_at       = COALESCE(${finishedAt}::timestamptz, finished_at),
      updated_at        = now()
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
      avg_job_value     = COALESCE(${fields.avgJobValue ?? null}, avg_job_value),
      forwarding_verified = COALESCE(${fields.forwardingVerified ?? null}, forwarding_verified)
    WHERE id = ${businessId}
    RETURNING *
  `;
  return rows[0];
}

// ─── Forwarding heartbeat ───
// Called on every real inbound (forwarded) call. Stamps the time and latches
// forwarding_verified — together these let the dashboard show live health.
export async function recordInboundCall(businessId) {
  await sql`
    UPDATE businesses
    SET last_inbound_call_at = now(), forwarding_verified = true
    WHERE id = ${businessId}
  `;
}

export async function getAllBusinesses() {
  const rows = await sql`
    SELECT * FROM businesses
    WHERE is_active = true
    ORDER BY created_at DESC
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

// ─── Inbound SMS idempotency ───
// Claims a Twilio MessageSid. Returns true if it's NEW (safe to process), false
// if already seen (a duplicate/retry that should be ignored). Missing sid → true.
export async function claimMessageSid(sid) {
  if (!sid) return true;
  const rows = await sql`
    INSERT INTO processed_messages (message_sid) VALUES (${sid})
    ON CONFLICT (message_sid) DO NOTHING
    RETURNING message_sid
  `;
  return rows.length > 0;
}

// Releases a claimed sid so a Twilio retry can reprocess it (used when handling
// failed after the claim).
export async function releaseMessageSid(sid) {
  if (!sid) return;
  await sql`DELETE FROM processed_messages WHERE message_sid = ${sid}`;
}

// ─── Generic rate limiting ───
// Records a hit for (bucket, key) and returns true if the key was ALREADY at or
// over `max` within the last `windowSeconds`.
export async function rateLimitExceeded(bucket, key, windowSeconds, max) {
  const rows = await sql`
    SELECT COUNT(*)::int AS cnt FROM rate_limits
    WHERE bucket = ${bucket} AND key = ${key}
      AND created_at > NOW() - make_interval(secs => ${windowSeconds})
  `;
  const count = Number(rows[0]?.cnt || 0);
  await sql`INSERT INTO rate_limits (bucket, key) VALUES (${bucket}, ${key})`;
  return count >= max;
}

// An active lead for this phone at this business created in the last N minutes.
// Scoped per business: the same caller ringing two Cove clients gets two leads.
export async function checkDuplicateLead(businessId, phone, minutesWindow) {
  const rows = await sql`
    SELECT id FROM leads
    WHERE business_id = ${businessId}
      AND phone = ${phone}
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

// ─── Passwords ───

export async function updatePassword(userId, passwordHash) {
  await sql`
    UPDATE users SET password_hash = ${passwordHash}, updated_at = now()
    WHERE id = ${userId}
  `;
}

// ─── Business Activation ───

export async function setBusinessActive(businessId, isActive) {
  await sql`
    UPDATE businesses SET is_active = ${isActive}
    WHERE id = ${businessId}
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

// outcome: 'won' | 'lost' | null (clears). jobValue: numeric or null (leaves unchanged).
export async function setLeadOutcome(leadId, businessId, outcome, jobValue) {
  const rows = await sql`
    UPDATE leads SET
      outcome   = ${outcome},
      job_value = COALESCE(${jobValue ?? null}, job_value),
      updated_at = now()
    WHERE id = ${leadId} AND business_id = ${businessId}
    RETURNING id, outcome, job_value
  `;
  return rows[0] || null;
}

export async function getLeadByIdAndBusiness(leadId, businessId) {
  const rows = await sql`
    SELECT id FROM leads WHERE id = ${leadId} AND business_id = ${businessId} LIMIT 1
  `;
  return rows[0] || null;
}
