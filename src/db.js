import { neon } from "@neondatabase/serverless";
import { config } from "./config.js";

const sql = neon(config.databaseUrl);

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
}) {
  const rows = await sql`
    INSERT INTO businesses (name, twilio_from_number, owner_notify_phone, owner_notify_email, booking_link, is_active)
    VALUES (${name}, ${twilioFromNumber}, ${ownerNotifyPhone || null}, ${ownerNotifyEmail || null}, ${bookingLink || null}, true)
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
