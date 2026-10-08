import { neon } from "@neondatabase/serverless";
import { config } from "./config.js";

// Created on first query, so importing this module never needs DATABASE_URL.
let client = null;
const sql = (strings, ...values) => (client ||= neon(config.databaseUrl))(strings, ...values);

// True for "column/table doesn't exist" — the new code is live but migration
// 012 hasn't been run yet. Paths a missed call depends on fall back on this.
export function isMissingSchema(err) {
  return err?.code === "42703" || err?.code === "42P01"
    || /(column|relation) .* does not exist/i.test(err?.message || "");
}

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
        SELECT * FROM leads WHERE business_id = ${businessId}
        ORDER BY created_at DESC LIMIT 200`
    : sql`
        SELECT * FROM leads WHERE business_id = ${businessId}
          AND created_at > NOW() - ${days + ' days'}::interval
        ORDER BY created_at DESC LIMIT 200`;
}

// Leads created or changed since `since` (the dashboard's 30-second poll).
export async function getLeadsChangedSince(businessId, since) {
  return sql`
    SELECT * FROM leads WHERE business_id = ${businessId}
      AND (created_at > ${since}::timestamptz OR updated_at > ${since}::timestamptz)
    ORDER BY created_at DESC LIMIT 200`;
}

// Search older leads by (part of) a phone number.
export async function searchLeadsByPhone(businessId, digits) {
  const pattern = `%${String(digits).replace(/\D/g, "")}%`;
  return sql`
    SELECT * FROM leads WHERE business_id = ${businessId}
      AND regexp_replace(phone, '\\D', '', 'g') LIKE ${pattern}
    ORDER BY created_at DESC LIMIT 50`;
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

// source: missed_call | sms | webhook | api | test | rebook
export async function createLead({ businessId, name, phone, email, message, source = null }) {
  try {
    const rows = await sql`
      INSERT INTO leads (business_id, name, phone, email, message, status, current_step, answers, source)
      VALUES (${businessId}, ${name || null}, ${phone}, ${email || null}, ${message || null}, 'active', 1, '{}', ${source})
      RETURNING *
    `;
    return rows[0];
  } catch (err) {
    if (!isMissingSchema(err)) throw err;
    const rows = await sql`
      INSERT INTO leads (business_id, name, phone, email, message, status, current_step, answers)
      VALUES (${businessId}, ${name || null}, ${phone}, ${email || null}, ${message || null}, 'active', 1, '{}')
      RETURNING *
    `;
    return rows[0];
  }
}

// True if this phone has sent STOP to this business (per sender, as the Spam
// Act requires). Checked before every outbound SMS to a customer.
export async function hasPhoneOptedOut(businessId, phone) {
  try {
    const rows = await sql`
      SELECT 1 FROM opt_outs WHERE business_id = ${businessId} AND phone = ${phone}
      UNION ALL
      SELECT 1 FROM leads WHERE business_id = ${businessId} AND phone = ${phone} AND status = 'stopped'
      LIMIT 1
    `;
    return rows.length > 0;
  } catch (err) {
    if (!isMissingSchema(err)) throw err;
    const rows = await sql`
      SELECT 1 FROM leads WHERE business_id = ${businessId} AND phone = ${phone} AND status = 'stopped' LIMIT 1
    `;
    return rows.length > 0;
  }
}

export async function recordOptOut(businessId, phone) {
  await sql`
    INSERT INTO opt_outs (business_id, phone) VALUES (${businessId}, ${phone})
    ON CONFLICT DO NOTHING
  `;
}

export async function getOptOuts() {
  return sql`
    SELECT o.phone, o.created_at, b.name AS business_name
    FROM opt_outs o JOIN businesses b ON b.id = o.business_id
    ORDER BY o.created_at DESC`;
}

export async function getLeadById(leadId) {
  const rows = await sql`SELECT * FROM leads WHERE id = ${leadId} LIMIT 1`;
  return rows[0] || null;
}

// The customer's most recent lead at this business, any status.
export async function getLatestLeadByBusinessAndPhone(businessId, phone) {
  const rows = await sql`
    SELECT * FROM leads WHERE business_id = ${businessId} AND phone = ${phone}
    ORDER BY created_at DESC LIMIT 1
  `;
  return rows[0] || null;
}

// Proposed bookings still waiting on the owner, newest first.
export async function getPendingBookings(businessId, days = 14) {
  return sql`
    SELECT * FROM leads
    WHERE business_id = ${businessId} AND booking_status = 'proposed'
      AND created_at > NOW() - ${days + ' days'}::interval
    ORDER BY created_at DESC
  `;
}

export async function hasInboundSince(leadId, since) {
  const rows = await sql`
    SELECT 1 FROM messages WHERE lead_id = ${leadId} AND direction = 'inbound'
      AND created_at > ${since}::timestamptz LIMIT 1
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
  bookingConfirmedAt = null,
} = {}) {
  const answersJson = answers ? JSON.stringify(answers) : undefined;
  if (bookingConfirmedAt) {
    try {
      await sql`UPDATE leads SET booking_confirmed_at = ${bookingConfirmedAt}::timestamptz WHERE id = ${leadId}`;
    } catch (err) {
      if (!isMissingSchema(err)) throw err;
    }
  }
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
  operatingHours = null,
  integrations = null,
  avgJobValue = null,
}) {
  const flowJson = flowConfig ? JSON.stringify(flowConfig) : null;
  const rows = await sql`
    INSERT INTO businesses (name, twilio_from_number, owner_notify_phone, owner_notify_email, booking_link, is_active,
                            industry, flow_config, user_id, operating_hours, integrations, avg_job_value)
    VALUES (${name}, ${twilioFromNumber || null}, ${ownerNotifyPhone || null}, ${ownerNotifyEmail || null}, ${bookingLink || null}, ${isActive},
            ${industry || null}, ${flowJson}::jsonb, ${userId},
            ${operatingHours ? JSON.stringify(operatingHours) : null}::jsonb,
            ${integrations ? JSON.stringify(integrations) : null}::jsonb, ${avgJobValue})
    RETURNING *
  `;
  return rows[0];
}

// settings / review_link (migration 012). Kept apart from updateBusiness so the
// older columns stay writable before the migration runs.
export async function updateBusinessExtras(businessId, { settings, reviewLink } = {}) {
  const rows = await sql`
    UPDATE businesses SET
      settings    = COALESCE(${settings ? JSON.stringify(settings) : null}::jsonb, settings),
      review_link = COALESCE(${reviewLink ?? null}, review_link)
    WHERE id = ${businessId}
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
// outcome_at moves only when the outcome actually changes (invoice basis).
export async function setLeadOutcome(leadId, businessId, outcome, jobValue) {
  try {
    const rows = await sql`
      UPDATE leads SET
        outcome_at = CASE WHEN outcome IS DISTINCT FROM ${outcome} THEN
                       CASE WHEN ${outcome}::text IS NULL THEN NULL ELSE now() END
                     ELSE outcome_at END,
        outcome    = ${outcome},
        job_value  = COALESCE(${jobValue ?? null}, job_value),
        updated_at = now()
      WHERE id = ${leadId} AND business_id = ${businessId}
      RETURNING *
    `;
    return rows[0] || null;
  } catch (err) {
    if (!isMissingSchema(err)) throw err;
    const rows = await sql`
      UPDATE leads SET outcome = ${outcome}, job_value = COALESCE(${jobValue ?? null}, job_value), updated_at = now()
      WHERE id = ${leadId} AND business_id = ${businessId}
      RETURNING *
    `;
    return rows[0] || null;
  }
}

export async function getLeadByIdAndBusiness(leadId, businessId) {
  const rows = await sql`
    SELECT * FROM leads WHERE id = ${leadId} AND business_id = ${businessId} LIMIT 1
  `;
  return rows[0] || null;
}

// ─── Scheduled messages (migration 012) ───

export async function insertScheduledMessage({ businessId, leadId, kind, sendAt, body }) {
  const rows = await sql`
    INSERT INTO scheduled_messages (business_id, lead_id, kind, send_at, body)
    VALUES (${businessId}, ${leadId}, ${kind}, ${sendAt}::timestamptz, ${body})
    RETURNING *
  `;
  return rows[0];
}

export async function cancelScheduledMessages(leadId, kinds) {
  return sql`
    UPDATE scheduled_messages SET cancelled_at = now()
    WHERE lead_id = ${leadId} AND kind = ANY(${kinds})
      AND sent_at IS NULL AND cancelled_at IS NULL
    RETURNING id, kind
  `;
}

export async function getPendingScheduled(leadId) {
  return sql`
    SELECT * FROM scheduled_messages
    WHERE lead_id = ${leadId} AND sent_at IS NULL AND cancelled_at IS NULL
    ORDER BY send_at
  `;
}

// businessId narrows the run to one business (tests); null means all.
export async function getDueScheduledMessages(now, limit = 100, businessId = null) {
  return sql`
    SELECT * FROM scheduled_messages
    WHERE sent_at IS NULL AND cancelled_at IS NULL AND send_at <= ${now}::timestamptz
      AND (${businessId}::uuid IS NULL OR business_id = ${businessId}::uuid)
    ORDER BY send_at LIMIT ${limit}
  `;
}

// Claim a due message by stamping sent_at; returns false if another run got it.
export async function claimScheduledMessage(id) {
  const rows = await sql`
    UPDATE scheduled_messages SET sent_at = now(), attempts = attempts + 1
    WHERE id = ${id} AND sent_at IS NULL AND cancelled_at IS NULL
    RETURNING id
  `;
  return rows.length > 0;
}

// Undo a claim after a failed send; gives up (cancels) after 3 attempts.
export async function releaseScheduledMessage(id, error) {
  await sql`
    UPDATE scheduled_messages SET
      sent_at = NULL,
      last_error = ${String(error).slice(0, 500)},
      cancelled_at = CASE WHEN attempts >= 3 THEN now() ELSE NULL END
    WHERE id = ${id}
  `;
}

export async function cancelScheduledMessage(id, reason) {
  await sql`
    UPDATE scheduled_messages SET cancelled_at = now(), last_error = ${reason}
    WHERE id = ${id} AND sent_at IS NULL
  `;
}

// The latest follow-up of these kinds actually sent to this phone by this
// business in the last `days` days, with its lead — for routing replies to it.
export async function getLatestSentFollowup(businessId, phone, kinds, days) {
  const rows = await sql`
    SELECT s.*, l.phone FROM scheduled_messages s JOIN leads l ON l.id = s.lead_id
    WHERE s.business_id = ${businessId} AND l.phone = ${phone}
      AND s.kind = ANY(${kinds}) AND s.sent_at IS NOT NULL
      AND s.sent_at > NOW() - ${days + ' days'}::interval
    ORDER BY s.sent_at DESC LIMIT 1
  `;
  return rows[0] || null;
}

// ─── Admin / Kris's scripts ───

// Every business (active or not) with this month's lead count.
export async function getBusinessesOverview() {
  return sql`
    SELECT b.*,
      (SELECT COUNT(*)::int FROM leads l WHERE l.business_id = b.id
         AND l.created_at >= date_trunc('month', now())) AS leads_this_month,
      (SELECT MAX(created_at) FROM leads l WHERE l.business_id = b.id) AS last_lead_at
    FROM businesses b
    ORDER BY b.is_active DESC, b.created_at DESC
  `;
}

export async function getRecentLeadsAllBusinesses(limit = 200) {
  return sql`
    SELECT l.*, b.name AS business_name
    FROM leads l JOIN businesses b ON b.id = l.business_id
    ORDER BY l.created_at DESC LIMIT ${limit}
  `;
}

export async function setForwardingAlerted(businessId) {
  await sql`UPDATE businesses SET forwarding_alerted_at = now() WHERE id = ${businessId}`;
}

export async function deactivateBusiness(businessId, graceDays = 30) {
  const rows = await sql`
    UPDATE businesses SET is_active = false, deactivated_at = now(),
      release_number_after = now() + ${graceDays + ' days'}::interval
    WHERE id = ${businessId}
    RETURNING *
  `;
  return rows[0] || null;
}

export async function reactivateBusiness(businessId) {
  const rows = await sql`
    UPDATE businesses SET is_active = true, deactivated_at = NULL, release_number_after = NULL
    WHERE id = ${businessId}
    RETURNING *
  `;
  return rows[0] || null;
}

export async function getNumbersDueForRelease() {
  return sql`
    SELECT * FROM businesses
    WHERE is_active = false AND release_number_after IS NOT NULL
      AND release_number_after <= now() AND twilio_from_number IS NOT NULL
  `;
}

export async function clearTwilioNumber(businessId) {
  await sql`UPDATE businesses SET twilio_from_number = NULL, release_number_after = NULL WHERE id = ${businessId}`;
}

export async function getAppliedMigrations() {
  try {
    return (await sql`SELECT name FROM schema_migrations`).map((r) => r.name);
  } catch (err) {
    if (isMissingSchema(err)) return [];
    throw err;
  }
}

export async function ping() {
  await sql`SELECT 1`;
}

// Raw access for reporting scripts that need one-off queries.
export { sql };
