import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeHours, isOpenAt, nextOpenAt, validateDayHours, zonedDate, formatRange } from "../src/time.js";
import { getAvailableSlots, buildBookingStep, parseBookingReply, describeAppointment, defaultBookingStyle } from "../src/booking.js";

const BNE = "Australia/Brisbane"; // UTC+10, no DST
const tradie = {
  industry: "plumbing",
  operating_hours: {
    timezone: BNE,
    days: { mon: ["07:00", "17:00"], tue: ["07:00", "17:00"], wed: ["07:00", "17:00"], thu: ["07:00", "17:00"], fri: ["07:00", "16:00"], sat: null, sun: null },
  },
};
// Wed 8 Oct 2025 is a Wednesday.
const bne = (d, h, m = 0) => zonedDate(BNE, 2025, 10, d, h, m);

test("per-day hours: open/closed by the business's own clock, not the server's", () => {
  assert.equal(isOpenAt(tradie, bne(8, 7, 0)), true);   // Wed 7:00
  assert.equal(isOpenAt(tradie, bne(8, 6, 59)), false); // Wed 6:59
  assert.equal(isOpenAt(tradie, bne(10, 16, 30)), false); // Fri 4:30pm (closes 4)
  assert.equal(isOpenAt(tradie, bne(11, 10)), false);   // Sat
});

test("legacy hours with enabled:false are always open", () => {
  assert.equal(isOpenAt({ operating_hours: { enabled: false } }, bne(11, 3)), true);
  assert.equal(isOpenAt({}, bne(11, 3)), true);
});

test("legacy enabled hours still work", () => {
  const legacy = { operating_hours: { enabled: true, timezone: BNE, open_hour: 8, close_hour: 17, closed_days: [0, 6] } };
  assert.equal(isOpenAt(legacy, bne(8, 9)), true);
  assert.equal(isOpenAt(legacy, bne(12, 9)), false); // Sunday
});

test("nextOpenAt skips the weekend", () => {
  const opens = nextOpenAt(tradie, bne(10, 18)); // Fri 6pm
  assert.equal(opens.toISOString(), bne(13, 7).toISOString()); // Mon 7am
});

test("validateDayHours catches bad input", () => {
  assert.equal(validateDayHours(tradie.operating_hours.days), null);
  assert.match(validateDayHours({ mon: ["17:00", "07:00"] }), /after opening/);
  assert.match(validateDayHours({ mon: ["7am", "5pm"] }), /HH:MM/);
  assert.match(validateDayHours({ mon: null }), /at least one day/);
});

test("trades get morning/arvo windows; dental gets exact slots", () => {
  assert.equal(defaultBookingStyle("plumbing"), "windows");
  assert.equal(defaultBookingStyle("dental"), "slots");
  const slots = getAvailableSlots(tradie, 3, bne(8, 10), "windows"); // Wed 10am
  assert.deepEqual(slots.map((s) => s.label), ["Today arvo", "Tomorrow morning", "Tomorrow arvo"]);
  assert.equal(slots[1].startMin, 7 * 60);
  assert.equal(slots[1].endMin, 12 * 60);
  assert.equal(new Date(slots[1].iso).toISOString(), bne(9, 7).toISOString());
});

test("windows skip closed days and respect a short Friday", () => {
  const slots = getAvailableSlots(tradie, 3, bne(10, 13), "windows"); // Fri 1pm: arvo already started
  assert.deepEqual(slots.map((s) => s.label), ["Mon morning", "Mon arvo", "Tue morning"]);
});

test("booking replies: number, words, escape", () => {
  const step = buildBookingStep(tradie, { count: 2, style: "windows" }, bne(8, 10));
  assert.equal(parseBookingReply(step, "2").slot.label, "Tomorrow morning");
  assert.equal(parseBookingReply(step, "tomorrow").slot.label, "Tomorrow morning");
  assert.equal(parseBookingReply(step, "this arvo works").slot.label, "Today arvo");
  assert.equal(parseBookingReply(step, "3").escape, true);
  assert.equal(parseBookingReply(step, "12"), null, "12 is not slot 1");
});

test("describeAppointment is absolute and relative to the moment it's sent", () => {
  const lead = {
    appointment_at: bne(9, 7).toISOString(),
    answers: { _appointment_window: { startMin: 420, endMin: 720, style: "windows", name: "morning" } },
  };
  assert.equal(describeAppointment(lead, BNE, bne(8, 17)), "tomorrow morning (7am–12pm)");
  assert.equal(describeAppointment(lead, BNE, bne(9, 5)), "today morning (7am–12pm)");
  assert.match(describeAppointment(lead, BNE, bne(6, 9)), /^Thu 9 Oct morning/);
});

test("formatRange", () => {
  assert.equal(formatRange(420, 720), "7am–12pm");
  assert.equal(formatRange(780, 900), "1–3pm");
  assert.equal(formatRange(450, 600), "7:30–10am");
});

test("normalizeHours defaults to Mon–Fri 8–5 for booking", () => {
  const h = normalizeHours(null);
  assert.equal(h.alwaysOpen, true);
  assert.deepEqual(h.days[1], { open: 480, close: 1020 });
  assert.equal(h.days[0], null);
});
