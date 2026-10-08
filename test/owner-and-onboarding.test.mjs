import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseOwnerReply, isOwnerPhone } from "../src/services/owner-replies.js";
import { validateClientConfig, buildFlowConfig, buildOperatingHours, buildIntegrations, buildSettings, generatePassword } from "../src/services/onboarding.js";
import { forwardingCodes, quietCutoff, needsForwardingAlert } from "../src/services/forwarding.js";
import { normalizePhone, isValidPhone, formatPhoneDisplay, toLocalDigits } from "../src/phone.js";
import { zonedDate } from "../src/time.js";
import { INDUSTRY_TEMPLATES } from "../src/flow-engine.js";

const example = JSON.parse(await readFile(new URL("../clients/example.json", import.meta.url), "utf8"));

test("owner replies: Y, N, or a new time", () => {
  for (const y of ["Y", "y", "yes", "Yes!", "ok", "👍"]) assert.equal(parseOwnerReply(y).action, "confirm", y);
  for (const n of ["N", "no", "Nope.", "can't", "decline"]) assert.equal(parseOwnerReply(n).action, "decline", n);
  assert.deepEqual(parseOwnerReply("Thu 2pm"), { action: "change", time: "Thu 2pm" });
  assert.equal(parseOwnerReply("  ").action, "none");
});

test("owner phone matches however it was stored", () => {
  const business = { owner_notify_phone: "0412 345 678", integrations: { notifications: { sms: { numbers: ["+61400111222"] } } } };
  assert.equal(isOwnerPhone(business, "+61412345678"), true);
  assert.equal(isOwnerPhone(business, "+61400111222"), true);
  assert.equal(isOwnerPhone(business, "+61499999999"), false);
});

test("the example client config is valid", () => {
  const { errors } = validateClientConfig(example);
  assert.deepEqual(errors, []);
});

test("config validation catches the usual mistakes", () => {
  const bad = structuredClone(example);
  bad.business.owner_phone = "0412";
  bad.business.industry = "plumbin";
  bad.business.timezone = "Brisbane";
  bad.business.operating_hours.mon = ["17:00", "07:00"];
  bad.twilio.area_code = "09";
  bad.followups.reminders = true;
  const { errors } = validateClientConfig(bad);
  assert.equal(errors.length, 6, errors.join("\n"));
});

test("flow config: template + overrides + booking", () => {
  const cfg = structuredClone(example);
  cfg.flow.overrides = { question: "Emergency? A) Yes B) No", options: [{ value: "A", label: "Emergency", synonyms: ["leak"] }, { value: "B", label: "Not urgent" }], urgent_values: ["A"] };
  cfg.flow.voice_mode = "dial_first";
  const flow = buildFlowConfig(cfg);
  assert.equal(flow.steps[0].question, "Emergency? A) Yes B) No");
  assert.deepEqual(flow.steps[0].options.map((o) => o.label), ["Emergency", "Not urgent"]);
  assert.equal(flow.booking.enabled, true);
  assert.equal(flow.voice_mode, "dial_first");
  assert.notEqual(INDUSTRY_TEMPLATES.plumbing.steps[0].question, flow.steps[0].question, "template not mutated");
});

test("hours, notifications and settings from the config", () => {
  const hours = buildOperatingHours(example);
  assert.equal(hours.timezone, "Australia/Brisbane");
  assert.deepEqual(hours.days.fri, ["07:00", "16:00"]);
  assert.equal(hours.days.sat, null);
  const integ = buildIntegrations(example, { webhook_secret: "keep" });
  assert.equal(integ.webhook_secret, "keep");
  assert.deepEqual(integ.notifications.sms, { enabled: true, numbers: ["+61412345678"] });
  const settings = buildSettings(example);
  assert.equal(settings.missed_call_alert, true);
  assert.equal(settings.followups.rebook_nudge.enabled, false);
});

test("temp passwords are readable and random", () => {
  const a = generatePassword();
  assert.match(a, /^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
  assert.notEqual(a, generatePassword());
});

test("forwarding codes use the local number", () => {
  const c = forwardingCodes("+61412345678");
  assert.equal(c.noAnswer, "**61*0412345678*11*20#");
  assert.equal(c.busy, "**67*0412345678#");
  assert.equal(c.unreachable, "**62*0412345678#");
});

test("forwarding check: quiet for 3 open days after recent calls → alert once", () => {
  const BNE = "Australia/Brisbane";
  const business = {
    twilio_from_number: "+61412345678",
    operating_hours: { timezone: BNE, days: { mon: ["07:00", "17:00"], tue: ["07:00", "17:00"], wed: ["07:00", "17:00"], thu: ["07:00", "17:00"], fri: ["07:00", "17:00"] } },
  };
  const now = zonedDate(BNE, 2025, 10, 13, 9); // Mon 13 Oct
  // 3 open days back from Monday is Thursday 9 Oct.
  assert.equal(quietCutoff(business, now).toISOString(), zonedDate(BNE, 2025, 10, 9, 0).toISOString());

  const lastFri = { ...business, last_inbound_call_at: zonedDate(BNE, 2025, 10, 10, 15).toISOString() };
  assert.equal(needsForwardingAlert(lastFri, now), false, "a call on Friday — fine");
  const lastTue = { ...business, last_inbound_call_at: zonedDate(BNE, 2025, 10, 7, 15).toISOString() };
  assert.equal(needsForwardingAlert(lastTue, now), true, "nothing since Tuesday — alert");
  assert.equal(needsForwardingAlert({ ...lastTue, forwarding_alerted_at: zonedDate(BNE, 2025, 10, 12, 9).toISOString() }, now), false, "already alerted for this quiet spell");
  const ancient = { ...business, last_inbound_call_at: zonedDate(BNE, 2025, 9, 1, 9).toISOString() };
  assert.equal(needsForwardingAlert(ancient, now), false, "no calls in 14 days — not a recent break");
  assert.equal(needsForwardingAlert({ ...business, last_inbound_call_at: null }, now), false);
});

test("phone numbers: every common AU format, invalid input rejected", () => {
  for (const v of ["0412 345 678", "+61412345678", "61412345678", "0061412345678", "(04) 1234-5678"]) {
    assert.equal(normalizePhone(v), "+61412345678", v);
  }
  assert.equal(normalizePhone("(07) 3333 4444"), "+61733334444");
  for (const v of ["123", "Anonymous", "", "+266696687", null]) assert.equal(normalizePhone(v), "", String(v));
  assert.equal(isValidPhone("0412"), false);
  assert.equal(formatPhoneDisplay("+61412345678"), "0412 345 678");
  assert.equal(formatPhoneDisplay("+61483481613"), "0483 481 613", "unassigned mobile ranges still format");
  assert.equal(toLocalDigits("+61733334444"), "0733334444");
});
