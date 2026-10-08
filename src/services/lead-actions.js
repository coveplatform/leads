// What the owner does to a lead — confirm/decline/move a booking, mark it won
// or lost — whether by SMS reply or from the dashboard. Each action updates the
// lead, tells the customer where that matters, and keeps follow-ups in step.

import { describeAppointment } from "../booking.js";
import { businessTimezone } from "../time.js";
import { setLeadBooking, setLeadOutcome, saveMessage, hasPhoneOptedOut } from "../db.js";
import { sendSms } from "../sms.js";
import { scheduleReminder, scheduleAfterWon, cancelFollowups } from "./scheduler.js";
import { log } from "../log.js";

async function textCustomer(business, lead, body) {
  if (await hasPhoneOptedOut(business.id, lead.phone)) return;
  await sendSms({ from: business.twilio_from_number, to: lead.phone, body });
  await saveMessage({ leadId: lead.id, direction: "outbound", body });
}

export function whenText(business, lead, now = new Date()) {
  if (lead.answers?._appointment_window) return describeAppointment(lead, businessTimezone(business), now);
  return lead.answers?._appointment_label || describeAppointment(lead, businessTimezone(business), now) || "the time you picked";
}

export async function confirmBooking(business, lead, { via = "dashboard", now = new Date() } = {}) {
  if (lead.booking_status === "confirmed") return { lead, changed: false };
  if (lead.booking_status !== "proposed") throw new Error("This lead has no booking waiting to be confirmed");

  const updated = await setLeadBooking(lead.id, { bookingStatus: "confirmed", bookingConfirmedAt: now.toISOString() });
  await saveMessage({ leadId: lead.id, direction: "system", body: `✅ Booking confirmed by owner (${via})` });
  await textCustomer(business, lead, `Confirmed ✅ ${business.name || "We"} will see you ${whenText(business, lead, now)}. Reply here if anything changes.`);
  await scheduleReminder(business, updated, now);
  log.info(`[booking] confirmed lead ${lead.id} via ${via}`);
  return { lead: updated, changed: true };
}

export async function declineBooking(business, lead, { via = "dashboard", now = new Date() } = {}) {
  if (lead.booking_status === "declined") return { lead, changed: false };
  if (!["proposed", "confirmed"].includes(lead.booking_status)) throw new Error("This lead has no booking to decline");

  const updated = await setLeadBooking(lead.id, { bookingStatus: "declined" });
  await saveMessage({ leadId: lead.id, direction: "system", body: `❌ Booking declined by owner (${via})` });
  await cancelFollowups(lead.id, ["reminder"]);
  await textCustomer(business, lead, `Sorry — ${business.name || "we"} can't make ${whenText(business, lead, now)}. We'll call you to sort another time.`);
  log.info(`[booking] declined lead ${lead.id} via ${via}`);
  return { lead: updated, changed: true };
}

// The owner replied with a different time ("Thu 2pm"). We can't know the exact
// instant from free text, so the booking is confirmed with their wording and
// no automatic reminder is sent.
export async function changeBooking(business, lead, newTime, { via = "sms" } = {}) {
  const label = String(newTime).trim().slice(0, 80);
  const answers = { ...(lead.answers || {}), _appointment_label: label, _appointment_window: null };
  const updated = await setLeadBooking(lead.id, {
    bookingStatus: "confirmed", bookingConfirmedAt: new Date().toISOString(), answers,
  });
  await saveMessage({ leadId: lead.id, direction: "system", body: `🕑 Owner moved the booking to "${label}" (${via})` });
  await cancelFollowups(lead.id, ["reminder"]);
  await textCustomer(business, lead, `Update from ${business.name || "us"}: you're booked in for ${label} instead. Reply here if that doesn't work.`);
  return { lead: updated, changed: true };
}

// outcome: 'won' | 'lost' | null
export async function setOutcome(business, lead, outcome, jobValue = null, { now = new Date() } = {}) {
  const updated = await setLeadOutcome(lead.id, business.id, outcome, jobValue);
  if (!updated) return null;
  const wasWon = lead.outcome === "won";
  if (outcome === "won" && !wasWon) {
    await scheduleAfterWon(business, updated, now);
  } else if (outcome !== "won") {
    const kinds = ["review_request", "rebook_nudge"];
    if (outcome === "lost") kinds.push("reminder");
    await cancelFollowups(lead.id, kinds);
  }
  return updated;
}
