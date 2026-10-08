import { test } from "node:test";
import assert from "node:assert/strict";
import { reminderSendAt, nextMorning, monthsLater, withinSendingHours } from "../src/services/scheduler.js";
import { zonedDate } from "../src/time.js";
import { getSettings, mergeSettings, fillTemplate } from "../src/settings.js";

const SYD = "Australia/Sydney"; // has DST from 5 Oct 2025
const syd = (y, mo, d, h, m = 0) => zonedDate(SYD, y, mo, d, h, m);

test("reminder: 5pm the day before", () => {
  const appt = syd(2025, 10, 9, 8);
  assert.equal(reminderSendAt(appt, SYD, syd(2025, 10, 7, 12)).toISOString(), syd(2025, 10, 8, 17).toISOString());
});

test("reminder: booked for later today → 2 hours before", () => {
  const appt = syd(2025, 10, 9, 13);
  assert.equal(reminderSendAt(appt, SYD, syd(2025, 10, 9, 8)).toISOString(), syd(2025, 10, 9, 11).toISOString());
});

test("reminder: too late for either → none", () => {
  assert.equal(reminderSendAt(syd(2025, 10, 9, 13), SYD, syd(2025, 10, 9, 12)), null);
  assert.equal(reminderSendAt(syd(2025, 10, 9, 13), SYD, syd(2025, 10, 9, 14)), null);
});

test("reminder across the DST switch lands on local 5pm", () => {
  // Clocks went forward on Sun 5 Oct 2025.
  const sendAt = reminderSendAt(syd(2025, 10, 6, 9), SYD, syd(2025, 10, 3, 9));
  assert.equal(sendAt.toISOString(), syd(2025, 10, 5, 17).toISOString());
  assert.equal(sendAt.toISOString(), "2025-10-05T06:00:00.000Z"); // AEDT, UTC+11
});

test("review request: 9am next morning; rebook: N months later at 9am", () => {
  assert.equal(nextMorning(SYD, syd(2025, 10, 8, 15)).toISOString(), syd(2025, 10, 9, 9).toISOString());
  assert.equal(monthsLater(SYD, syd(2025, 8, 31, 15), 6).toISOString(), syd(2026, 2, 28, 9).toISOString());
  assert.equal(monthsLater(SYD, syd(2025, 10, 8, 15), 12).toISOString(), syd(2026, 10, 8, 9).toISOString());
});

test("sending hours are 7:30am–7pm local", () => {
  assert.equal(withinSendingHours(SYD, syd(2025, 10, 8, 7, 29)), false);
  assert.equal(withinSendingHours(SYD, syd(2025, 10, 8, 7, 30)), true);
  assert.equal(withinSendingHours(SYD, syd(2025, 10, 8, 18, 59)), true);
  assert.equal(withinSendingHours(SYD, syd(2025, 10, 8, 19, 0)), false);
});

test("settings: defaults, overrides and merging", () => {
  const d = getSettings({});
  assert.equal(d.missedCallAlert, true);
  assert.equal(d.followups.review_request.enabled, true);
  assert.equal(d.followups.rebook_nudge.enabled, false, "rebook off until Kris has seen it work");
  const merged = mergeSettings({ followups: { reminder: { body: "custom" } } }, {
    missed_call_alert: false, followups: { reminder: { enabled: false }, bogus: { enabled: true } },
  });
  assert.deepEqual(merged, { missed_call_alert: false, followups: { reminder: { body: "custom", enabled: false } } });
  const s = getSettings({ settings: merged });
  assert.equal(s.followups.reminder.body, "custom");
  assert.equal(s.followups.reminder.enabled, false);
});

test("fillTemplate", () => {
  assert.equal(fillTemplate("Hi {firstName}, {business} here{nothing}.", { firstName: "Sam", business: "Dave's" }), "Hi Sam, Dave's here.");
});
