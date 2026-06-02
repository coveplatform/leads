import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getAvailableSlots,
  buildBookingStep,
  parseBookingReply,
  formatAppointment,
} from "../src/booking.js";

const TZ = "Australia/Sydney"; // AEST (UTC+10) in June — no DST
const HOURS = { enabled: true, timezone: TZ, open_hour: 8, close_hour: 17, closed_days: [0, 6] };
const biz = { operating_hours: HOURS };

function tzWeekday(iso) {
  return new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" }).format(new Date(iso));
}

test("getAvailableSlots returns the requested count, all in the future", () => {
  const now = new Date("2026-06-03T00:30:00Z"); // Wed 10:30 Sydney
  const slots = getAvailableSlots(biz, 2, now);
  assert.equal(slots.length, 2);
  for (const s of slots) {
    assert.ok(new Date(s.iso).getTime() > now.getTime(), `${s.label} should be in the future`);
  }
  assert.deepEqual(slots.map((s) => s.value), ["1", "2"]);
});

test("getAvailableSlots skips today's already-passed morning window", () => {
  const now = new Date("2026-06-03T00:30:00Z"); // 10:30 Sydney — 8–10am has passed
  const slots = getAvailableSlots(biz, 2, now);
  // First offerable is today's afternoon block.
  assert.equal(slots[0].dayLabel, "Today");
  assert.ok(slots[0].windowLabel.includes("pm"));
  assert.equal(slots[1].dayLabel, "Tomorrow");
});

test("getAvailableSlots never offers a closed day", () => {
  const now = new Date("2026-06-06T02:00:00Z"); // Sat 12:00 Sydney — closed weekends
  const slots = getAvailableSlots(biz, 3, now);
  assert.equal(slots.length, 3);
  for (const s of slots) {
    const wd = tzWeekday(s.iso);
    assert.ok(wd !== "Sat" && wd !== "Sun", `slot fell on a closed day: ${wd}`);
  }
});

test("buildBookingStep presents slots plus an escape option", () => {
  const now = new Date("2026-06-03T00:30:00Z");
  const step = buildBookingStep(biz, { count: 2, prompt: "Grab the first inspection slot?" }, now);
  assert.equal(step.type, "booking");
  assert.equal(step.options.length, step.slots.length + 1);
  assert.equal(step.options[step.options.length - 1].value, step.escapeValue);
  assert.ok(step.question.includes("Grab the first inspection slot?"));
  assert.ok(step.question.includes("Another time"));
});

test("parseBookingReply resolves picks, escapes, and gibberish", () => {
  const now = new Date("2026-06-03T00:30:00Z");
  const step = buildBookingStep(biz, { count: 2 }, now);

  assert.equal(parseBookingReply(step, "1").slot.value, "1");
  assert.equal(parseBookingReply(step, "2 please").slot.value, "2");
  assert.equal(parseBookingReply(step, step.escapeValue).escape, true);
  assert.equal(parseBookingReply(step, "another time").escape, true);
  assert.equal(parseBookingReply(step, "call me back").escape, true);
  assert.equal(parseBookingReply(step, "asdf qwer"), null);
});

test("parseBookingReply understands soft natural language", () => {
  const now = new Date("2026-06-03T00:30:00Z");
  const step = buildBookingStep(biz, { count: 2 }, now);
  const am = parseBookingReply(step, "tomorrow morning works");
  assert.ok(am && am.slot, "should resolve a tomorrow/morning slot");
});

test("formatAppointment prefers the stored label", () => {
  assert.equal(
    formatAppointment({ answers: { _appointment_label: "Tomorrow 8–10am" }, appointment_at: "2026-06-04T22:00:00Z" }, TZ),
    "Tomorrow 8–10am",
  );
  // Falls back to formatting the timestamp when no label is stored.
  const out = formatAppointment({ appointment_at: "2026-06-04T22:00:00Z" }, TZ);
  assert.ok(typeof out === "string" && out.length > 0);
});
