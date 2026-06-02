// End-to-end SMS sim for the booking + quote flow.
// Drives the REAL /api/sms/inbound handler through triage → quote → booking and
// asserts appointment_at / booking_status / quote are stored and the right SMS
// went out. Uses SMS_DRY_RUN so no Twilio messages are sent.
//
// Requires a real Neon DATABASE_URL (e.g. from .env). Skips cleanly otherwise.
//   SMS_DRY_RUN=1 node scripts/test-inbound-e2e.mjs

import "dotenv/config";

const DB = process.env.DATABASE_URL || "";
if (!DB || /localhost|127\.0\.0\.1|u:p@/.test(DB)) {
  console.log("⏭  Skipped: set DATABASE_URL to a real Neon database to run the inbound E2E.");
  process.exit(0);
}

// Must be set before importing the app / sms layer.
process.env.VERCEL = "1";        // don't auto-listen on import
process.env.SMS_DRY_RUN = "1";   // never hit Twilio
delete process.env.TWILIO_AUTH_TOKEN; // skip signature validation for mock posts

const assert = (await import("node:assert/strict")).default;
const { neon } = await import("@neondatabase/serverless");
const { normalizePhone } = await import("../src/phone.js");
const { INDUSTRY_TEMPLATES } = await import("../src/flow-engine.js");
const { createBusiness, updateBusiness, createLead } = await import("../src/db.js");
const app = (await import("../src/server.js")).default;

const sql = neon(DB);
const stamp = Date.now().toString().slice(-7);
const BIZ_NUMBER = normalizePhone(`+614${stamp}1`, "+61");
const CALLER = normalizePhone(`+614${stamp}2`, "+61");
const OWNER = normalizePhone(`+614${stamp}3`, "+61");

let server, base, businessId;

async function postInbound(body) {
  const r = await fetch(`${base}/api/sms/inbound`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ From: CALLER, To: BIZ_NUMBER, Body: body }),
  });
  if (r.status !== 200) throw new Error(`inbound returned ${r.status}`);
}

async function latestLead() {
  const rows = await sql`SELECT * FROM leads WHERE business_id = ${businessId} ORDER BY created_at DESC LIMIT 1`;
  return rows[0];
}

try {
  await new Promise((res) => { server = app.listen(0, res); });
  base = `http://127.0.0.1:${server.address().port}`;

  // HVAC business with booking + the matrix quote toggle on, always-open hours.
  const flowConfig = {
    ...INDUSTRY_TEMPLATES.hvac,
    booking: { enabled: true, slots: 2, prompt: "Grab the first inspection slot?" },
    quote_spec: { enabled: true, trade: "hvac" },
  };
  const business = await createBusiness({
    name: "E2E Test HVAC", twilioFromNumber: BIZ_NUMBER, ownerNotifyPhone: OWNER,
    industry: "hvac", flowConfig, isActive: true,
  });
  businessId = business.id;
  await updateBusiness(businessId, {
    avgJobValue: 500,
    operatingHours: { enabled: false, timezone: "Australia/Sydney", open_hour: 0, close_hour: 24, closed_days: [] },
  });

  // Missed call → lead at step 1 (the triage question was "sent").
  await createLead({ businessId, phone: CALLER, message: "Missed call" });

  // 1) Triage answer "1" (not working) → quote computed + booking offered.
  await postInbound("1");
  let lead = await latestLead();
  assert.equal(lead.answers?._awaiting, "booking", "should be awaiting a booking pick");
  assert.equal(Number(lead.quote_low), 180, "hvac '1' quote_low");
  assert.equal(Number(lead.quote_high), 650, "hvac '1' quote_high");

  // 2) Booking pick "1" → soft-book.
  await postInbound("1");
  lead = await latestLead();
  assert.ok(lead.appointment_at, "appointment_at should be stored");
  assert.equal(lead.booking_status, "proposed", "booking_status should be proposed");
  assert.equal(lead.status, "completed", "lead should be completed");

  // Outbound messages: a combined quote+booking offer ($) and a "Booked ✅" confirm.
  const msgs = await sql`SELECT body FROM messages WHERE lead_id = ${lead.id} AND direction = 'outbound'`;
  const bodies = msgs.map((m) => m.body);
  assert.ok(bodies.some((b) => /\$\d/.test(b)), "an outbound SMS should carry the $ quote");
  assert.ok(bodies.some((b) => /Booked ✅/.test(b)), "a confirmation SMS should be sent");

  console.log("✅ Inbound E2E passed: triage → quote ($180–$650) → booked appointment stored.");
} catch (err) {
  console.error("❌ Inbound E2E failed:", err.message);
  process.exitCode = 1;
} finally {
  if (businessId) {
    await sql`DELETE FROM leads WHERE business_id = ${businessId}`;
    await sql`DELETE FROM businesses WHERE id = ${businessId}`;
  }
  if (server) server.close();
}
