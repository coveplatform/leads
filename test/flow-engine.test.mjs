import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSummary, buildBookedAlert, buildCompletion, getStepType, STEP_TYPES, INDUSTRY_TEMPLATES } from "../src/flow-engine.js";

const dental = INDUSTRY_TEMPLATES.dental;
const business = { name: "Smile Dental", operating_hours: { timezone: "Australia/Sydney" } };
const bookedLead = {
  name: "Sarah Jones",
  phone: "+61400000000",
  answers: { intent_code: "1", intent_label: "Urgent dental pain", _appointment_label: "Tomorrow 8–10am" },
  appointment_at: "2026-06-04T22:00:00Z",
  booking_status: "proposed",
};

test("getStepType defaults to question, reads booking", () => {
  assert.equal(getStepType({}), "question");
  assert.equal(getStepType({ type: "booking" }), "booking");
});

test("there is no quote step type", () => {
  assert.deepEqual(Object.values(STEP_TYPES).sort(), ["booking", "question"]);
});

test("roofing is a first-class industry template", () => {
  assert.ok(INDUSTRY_TEMPLATES.roofing, "roofing template should exist");
  assert.equal(INDUSTRY_TEMPLATES.roofing.steps.length, 1);
  assert.equal(INDUSTRY_TEMPLATES.roofing.steps[0].key, "job_type");
});

test("buildSummary surfaces the booked appointment", () => {
  const s = buildSummary(bookedLead, business, dental);
  assert.ok(s.includes("Urgent dental pain"));
  assert.ok(s.includes("Tomorrow 8–10am"));
  assert.ok(s.includes("proposed"));
  assert.ok(s.includes("Appointment booked"));
});

test("buildSummary is unchanged for a plain lead (no booking)", () => {
  const plain = { name: "Bob", phone: "+61400000001", answers: { intent_label: "Routine check-up and clean" } };
  const s = buildSummary(plain, business, dental);
  assert.ok(s.includes("Routine check-up and clean"));
  assert.ok(!s.includes("Booked"));
  assert.ok(!s.includes("Est. quote"));
});

test("buildCompletion promises a prompt callback during hours", () => {
  const msg = buildCompletion(dental, business);
  assert.ok(msg.includes("shortly"));
  assert.ok(!msg.includes("first thing in the morning"));
});

test("buildCompletion sets a morning-callback expectation after hours", () => {
  const msg = buildCompletion(dental, business, { afterHours: true });
  assert.ok(msg.includes("first thing in the morning"));
  assert.ok(!msg.includes("shortly"));
});

test("buildBookedAlert is a punchy owner SMS", () => {
  const alert = buildBookedAlert(bookedLead, business, {
    appointmentLabel: "Tomorrow 8–10am",
    flowConfig: dental,
  });
  assert.ok(alert.includes("🔥 Booked lead"));
  assert.ok(alert.includes("Smile Dental"));
  assert.ok(alert.includes("Sarah Jones"));
  assert.ok(alert.includes("Urgent dental pain"));
  assert.ok(alert.includes("Tomorrow 8–10am"));
  assert.ok(!alert.includes("$"));
  assert.ok(alert.includes("Confirm the time"));
});

test("summaries ignore legacy quote columns on old leads", () => {
  const legacy = { ...bookedLead, quote_low: 16000, quote_high: 22000 };
  assert.ok(!buildSummary(legacy, business, dental).includes("$"));
});
