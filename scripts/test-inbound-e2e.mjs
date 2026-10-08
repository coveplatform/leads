// End-to-end run of the whole loop through the real webhook handlers, with
// SMS_DRY_RUN so nothing reaches Twilio:
//
//   missed call → owner alert → unanswered nudge queued → customer replies →
//   booking offered → customer picks → owner texts Y → customer confirmation →
//   reminder sent the evening before → job marked won → review request next
//   morning → "C" to change → STOP
//   plus dial_first: ring the owner first, text back only when nobody answers.
//
// Uses its own throwaway businesses and only dispatches their follow-ups.
//   npm run e2e         against DATABASE_URL (a real Neon database)
//   npm run e2e:local   against a local Postgres (E2E_PG_URL), via test/support

import "dotenv/config";

const DB = process.env.DATABASE_URL || "";
if (!process.env.E2E_PG_URL && (!DB || /localhost|127\.0\.0\.1|u:p@/.test(DB))) {
  console.log("⏭  Skipped: set DATABASE_URL to a real Neon database (or use npm run e2e:local).");
  process.exit(0);
}

// Must be set before importing the app / sms layer.
process.env.VERCEL = "1";        // don't auto-listen on import
process.env.SMS_DRY_RUN = "1";   // never hit Twilio
delete process.env.TWILIO_AUTH_TOKEN; // skip signature validation for mock posts

const assert = (await import("node:assert/strict")).default;
const { normalizePhone } = await import("../src/phone.js");
const { INDUSTRY_TEMPLATES } = await import("../src/flow-engine.js");
const db = await import("../src/db.js");
const { dryRunOutbox } = await import("../src/sms.js");
const { dispatchDue } = await import("../src/services/scheduler.js");
const { setOutcome } = await import("../src/services/lead-actions.js");
const app = (await import("../src/server.js")).default;
const { sql } = db;

const stamp = Date.now().toString().slice(-6);
const BIZ_NUMBER = normalizePhone(`+61481${stamp}`);
const DIAL_BIZ_NUMBER = normalizePhone(`+61482${stamp}`);
const CALLER = normalizePhone(`+61483${stamp}`);
const CALLER_2 = normalizePhone(`+61484${stamp}`);
const OWNER = normalizePhone(`+61485${stamp}`);

let server, base;
const businessIds = [];

const post = async (path, body) => {
  const r = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
  if (r.status !== 200) throw new Error(`${path} returned ${r.status}`);
  return r.text();
};
let sid = 0;
const text = (from, to, body) => post("/api/sms/inbound", { From: from, To: to, Body: body, MessageSid: `SMe2e${stamp}${sid++}` });
const call = (from, to) => post("/api/voice/inbound", { From: from, To: to, CallSid: `CAe2e${stamp}${sid++}` });
const latestLead = async (businessId, phone) =>
  (await sql`SELECT * FROM leads WHERE business_id = ${businessId} AND phone = ${phone} ORDER BY created_at DESC LIMIT 1`)[0];
const sentTo = (phone) => dryRunOutbox.filter((m) => m.to === phone).map((m) => m.body);
const lastTo = (phone) => sentTo(phone).at(-1) || "";
const pending = (leadId, kind) =>
  sql`SELECT * FROM scheduled_messages WHERE lead_id = ${leadId} AND kind = ${kind} AND sent_at IS NULL AND cancelled_at IS NULL`;

// Dispatch this business's follow-ups at `at`, stepping forward 30 minutes at
// a time (up to 6 tries) to get past quiet hours.
async function dispatchAt(businessId, at) {
  let t = new Date(at.getTime() + 60_000);
  for (let i = 0; i < 6; i++) {
    const r = await dispatchDue({ now: t, businessId });
    if (r.sent || r.cancelled) return r;
    t = new Date(t.getTime() + 30 * 60_000);
  }
  return { sent: 0 };
}

try {
  await new Promise((res) => { server = app.listen(0, res); });
  base = `http://127.0.0.1:${server.address().port}`;

  // Plumbing business: booking on, legacy "always open" hours (so the run
  // works at any time of day), review link set.
  const business = await db.createBusiness({
    name: "E2E Plumbing", twilioFromNumber: BIZ_NUMBER, ownerNotifyPhone: OWNER, industry: "plumbing",
    flowConfig: { ...INDUSTRY_TEMPLATES.plumbing, booking: { enabled: true, slots: 2 } },
    operatingHours: { enabled: false, timezone: "Australia/Brisbane" },
  });
  businessIds.push(business.id);
  await db.updateBusinessExtras(business.id, { reviewLink: "https://g.page/r/e2e-test" });

  // 1) Missed call → lead, text-back, instant owner alert, nudge queued.
  assert.match(await call(CALLER, BIZ_NUMBER), /<Response>/);
  let lead = await latestLead(business.id, CALLER);
  assert.ok(lead, "a lead should be created");
  assert.equal(lead.source, "missed_call");
  assert.match(lastTo(CALLER), /How urgent is it/, "caller gets the triage question");
  assert.match(lastTo(OWNER), /Missed call from 0481|Missed call from 04\d\d/, "owner gets the instant missed-call alert");
  assert.equal((await pending(lead.id, "unanswered_nudge")).length, 1, "unanswered nudge queued");

  // A second ring within 30 minutes doesn't start another lead.
  await call(CALLER, BIZ_NUMBER);
  assert.equal((await sql`SELECT COUNT(*)::int n FROM leads WHERE business_id = ${business.id}`)[0].n, 1);

  // 2) Unmatched reply → re-asked; any reply cancels the nudge.
  await text(CALLER, BIZ_NUMBER, "hello?");
  assert.match(lastTo(CALLER), /Please reply A, B or C/);
  assert.equal((await pending(lead.id, "unanswered_nudge")).length, 0, "nudge cancelled once they reply");

  // 3) Natural-language answer → matched, booking windows offered.
  await text(CALLER, BIZ_NUMBER, "burst pipe, water everywhere");
  lead = await latestLead(business.id, CALLER);
  assert.equal(lead.answers.urgency_code, "A");
  assert.match(lastTo(CALLER), /1\) (Today|Tomorrow|Mon|Tue|Wed|Thu|Fri) (morning|arvo)/, "trade windows offered");

  // 4) Pick → soft-booked, owner asked to confirm.
  await text(CALLER, BIZ_NUMBER, "1");
  lead = await latestLead(business.id, CALLER);
  assert.equal(lead.booking_status, "proposed");
  assert.match(lastTo(CALLER), /Booked ✅/);
  assert.match(lastTo(OWNER), /Reply Y to confirm, N to decline/);

  // 5) Owner texts Y → confirmed, customer told, reminder queued.
  await text(OWNER, BIZ_NUMBER, "Y");
  lead = await latestLead(business.id, CALLER);
  assert.equal(lead.booking_status, "confirmed");
  assert.ok(lead.booking_confirmed_at, "confirmation time recorded for invoicing");
  assert.match(lastTo(CALLER), /Confirmed ✅/);
  assert.match(lastTo(OWNER), /^Confirmed 04/);
  const [reminder] = await pending(lead.id, "reminder");
  assert.ok(reminder, "reminder queued");

  // 6) Reminder goes out when due and shows in the conversation.
  const r1 = await dispatchAt(business.id, new Date(reminder.send_at));
  assert.equal(r1.sent, 1, "reminder sent");
  assert.match(lastTo(CALLER), /^Reminder: E2E Plumbing is booked for (today|tomorrow)/);
  let history = await db.getMessagesByLeadId(lead.id);
  assert.ok(history.some((m) => /^Reminder:/.test(m.body)), "reminder in message history");

  // 7) Job won → review request next morning.
  await setOutcome(await db.getBusinessById(business.id), lead, "won");
  const [review] = await pending(lead.id, "review_request");
  assert.ok(review, "review request queued");
  const r2 = await dispatchAt(business.id, new Date(review.send_at));
  assert.equal(r2.sent, 1, "review request sent");
  assert.match(lastTo(CALLER), /g\.page\/r\/e2e-test/);
  history = await db.getMessagesByLeadId(lead.id);
  assert.ok(history.some((m) => /quick Google review/.test(m.body)), "review request in message history");

  // 8) "C" to the reminder → back into booking; owner told.
  await text(CALLER, BIZ_NUMBER, "C");
  lead = await latestLead(business.id, CALLER);
  assert.equal(lead.status, "active");
  assert.equal(lead.answers._awaiting, "booking");
  assert.match(lastTo(CALLER), /when suits instead/);
  assert.match(lastTo(OWNER), /wants to change their booking/);

  // 9) STOP → opted out, nothing more queued or sent.
  await text(CALLER, BIZ_NUMBER, "STOP");
  assert.equal((await sql`SELECT COUNT(*)::int n FROM opt_outs WHERE business_id = ${business.id} AND phone = ${CALLER}`)[0].n, 1);
  const before = sentTo(CALLER).length;
  await call(CALLER, BIZ_NUMBER);
  assert.equal(sentTo(CALLER).length, before, "an opted-out caller is never texted again");

  // 10) dial_first: owner's phone rings first; text-back only if unanswered.
  const dialBiz = await db.createBusiness({
    name: "E2E Sparky", twilioFromNumber: DIAL_BIZ_NUMBER, ownerNotifyPhone: OWNER, industry: "electrical",
    flowConfig: { ...INDUSTRY_TEMPLATES.electrical, voice_mode: "dial_first" },
  });
  businessIds.push(dialBiz.id);
  const dialTwiml = await call(CALLER_2, DIAL_BIZ_NUMBER);
  assert.match(dialTwiml, /<Dial timeout="20" callerId="\+61482\d+"[^>]*><Number>\+61485/, "rings the owner first");
  assert.equal(await latestLead(dialBiz.id, CALLER_2), undefined, "no lead while the owner's phone rings");
  await post("/api/voice/status", { From: CALLER_2, To: DIAL_BIZ_NUMBER, DialCallStatus: "completed", DialCallDuration: "45" });
  assert.equal(await latestLead(dialBiz.id, CALLER_2), undefined, "answered → no text-back");
  await post("/api/voice/status", { From: CALLER_2, To: DIAL_BIZ_NUMBER, DialCallStatus: "no-answer" });
  assert.ok(await latestLead(dialBiz.id, CALLER_2), "unanswered → lead + text-back");
  assert.match(lastTo(CALLER_2), /safety issue/);
  // The dialled phone forwarding back to Cove shows our own number: rejected, no loop.
  assert.match(await call(DIAL_BIZ_NUMBER, DIAL_BIZ_NUMBER), /<Reject/);

  console.log("✅ E2E passed: missed call → reply → booking → owner Y → confirmation → reminder → won → review → C → STOP; dial_first.");
} catch (err) {
  console.error("❌ E2E failed:", err);
  process.exitCode = 1;
} finally {
  for (const id of businessIds) {
    await sql`DELETE FROM businesses WHERE id = ${id}`; // cascades to leads, messages, follow-ups, opt-outs
  }
  if (server) server.close();
  if (process.env.E2E_PG_URL) await (await import("../test/support/neon-pg.mjs")).closeShim();
}
