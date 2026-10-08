// End-to-end SMS sim for the missed call → triage → booking flow.
// Drives the REAL /api/voice/inbound and /api/sms/inbound handlers and asserts
// the lead, appointment_at / booking_status and outbound SMS are stored.
// Uses SMS_DRY_RUN so no Twilio messages are sent.
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
const { createBusiness, updateBusiness } = await import("../src/db.js");
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

async function postMissedCall() {
  const r = await fetch(`${base}/api/voice/inbound`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ From: CALLER, To: BIZ_NUMBER }),
  });
  if (r.status !== 200) throw new Error(`voice returned ${r.status}`);
  return r.text();
}

async function latestLead() {
  const rows = await sql`SELECT * FROM leads WHERE business_id = ${businessId} ORDER BY created_at DESC LIMIT 1`;
  return rows[0];
}

try {
  await new Promise((res) => { server = app.listen(0, res); });
  base = `http://127.0.0.1:${server.address().port}`;

  // Plumbing business with booking on and always-open hours.
  const flowConfig = {
    ...INDUSTRY_TEMPLATES.plumbing,
    booking: { enabled: true, slots: 2, prompt: "Want us to come out?" },
  };
  const business = await createBusiness({
    name: "E2E Test Plumbing", twilioFromNumber: BIZ_NUMBER, ownerNotifyPhone: OWNER,
    industry: "plumbing", flowConfig, isActive: true,
  });
  businessId = business.id;
  await updateBusiness(businessId, {
    operatingHours: { enabled: false, timezone: "Australia/Brisbane", open_hour: 0, close_hour: 24, closed_days: [] },
  });

  // 1) Missed call → lead created, triage question texted, heartbeat stamped.
  const twiml = await postMissedCall();
  assert.match(twiml, /<Response>/, "voice webhook should answer TwiML");
  let lead = await latestLead();
  assert.ok(lead, "a lead should be created");
  assert.equal(lead.status, "active");
  const [biz] = await sql`SELECT last_inbound_call_at FROM businesses WHERE id = ${businessId}`;
  assert.ok(biz.last_inbound_call_at, "heartbeat should be stamped");

  // A second ring within 30 minutes doesn't start another lead.
  await postMissedCall();
  const count = await sql`SELECT COUNT(*)::int AS n FROM leads WHERE business_id = ${businessId}`;
  assert.equal(count[0].n, 1, "duplicate call should not create a second lead");

  // 2) Unmatched reply → re-asked, still on step 1.
  await postInbound("hello?");
  lead = await latestLead();
  assert.equal(lead.current_step, 1);

  // 3) Natural-language triage answer → matched deterministically, booking offered.
  await postInbound("burst pipe, water everywhere");
  lead = await latestLead();
  assert.equal(lead.answers?.urgency_code, "A", "synonym should match the emergency option");
  assert.equal(lead.answers?._awaiting, "booking", "should be awaiting a booking pick");

  // 4) Booking pick "1" → soft-book.
  await postInbound("1");
  lead = await latestLead();
  assert.ok(lead.appointment_at, "appointment_at should be stored");
  assert.equal(lead.booking_status, "proposed", "booking_status should be proposed");
  assert.equal(lead.status, "completed", "lead should be completed");

  const msgs = await sql`SELECT direction, body FROM messages WHERE lead_id = ${lead.id} ORDER BY created_at`;
  const outbound = msgs.filter((m) => m.direction === "outbound").map((m) => m.body);
  assert.ok(msgs.some((m) => m.direction === "system" && /Missed call/.test(m.body)), "missed call should be logged");
  assert.ok(outbound.some((b) => /How urgent/.test(b)), "triage question should be sent");
  assert.ok(outbound.some((b) => /Booked ✅/.test(b)), "a confirmation SMS should be sent");
  assert.ok(!outbound.some((b) => /\$\d/.test(b)), "no price should ever be texted");

  console.log("✅ Inbound E2E passed: missed call → triage (synonym) → booked appointment stored.");
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
