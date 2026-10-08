// Every delayed text goes through here: the unanswered nudge, booking
// reminders, review requests and rebook nudges. Rows live in
// scheduled_messages; /api/cron/dispatch (every 5 minutes) sends what's due.
//
// Rules applied at send time, not just at schedule time, because things change
// in between: the kind must still be switched on, the customer must not have
// opted out, the lead must still be in the state the message assumes, and it
// must be 7:30am–7pm in the business's timezone (nudges: opening hours too).

import { getSettings, fillTemplate } from "../settings.js";
import { localParts, localDayAfter, zonedDate, businessTimezone, isOpenAt } from "../time.js";
import { describeAppointment } from "../booking.js";
import { optionList, getFlowConfig, getRebookConfig } from "../flow-engine.js";
import {
  insertScheduledMessage,
  cancelScheduledMessages,
  getDueScheduledMessages,
  claimScheduledMessage,
  releaseScheduledMessage,
  cancelScheduledMessage,
  getBusinessById,
  getLeadById,
  hasPhoneOptedOut,
  hasInboundSince,
  saveMessage,
} from "../db.js";
import { sendSms } from "../sms.js";
import { log } from "../log.js";

const SEND_FROM = 7 * 60 + 30;   // 7:30am
const SEND_UNTIL = 19 * 60;      // 7pm
const NUDGE_DELAY_MS = 2 * 3600 * 1000;
const NUDGE_STALE_MS = 18 * 3600 * 1000;

// ─── Time rules ───

export function withinSendingHours(tz, date = new Date()) {
  const p = localParts(tz, date);
  const mins = p.hour * 60 + p.minute;
  return mins >= SEND_FROM && mins < SEND_UNTIL;
}

// 5pm the day before; if that has passed (booked for today, or booked after
// 5pm yesterday), 2 hours before; if that has passed too, no reminder.
export function reminderSendAt(appointmentAt, tz, now = new Date()) {
  const at = new Date(appointmentAt);
  if (!(at > now)) return null;
  const dayBefore = localDayAfter(tz, at, -1);
  const fivePm = zonedDate(tz, dayBefore.year, dayBefore.month, dayBefore.day, 17, 0);
  if (fivePm > now) return fivePm;
  const twoHoursBefore = new Date(at.getTime() - 2 * 3600 * 1000);
  return twoHoursBefore > now ? twoHoursBefore : null;
}

// 9am local on the next day.
export function nextMorning(tz, now = new Date(), hour = 9) {
  const d = localDayAfter(tz, now, 1);
  return zonedDate(tz, d.year, d.month, d.day, hour, 0);
}

// 9am local, `months` months from now (clamped to the month's last day).
export function monthsLater(tz, now, months, hour = 9) {
  const p = localParts(tz, now);
  const total = p.month - 1 + months;
  const year = p.year + Math.floor(total / 12);
  const month = (total % 12) + 1;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return zonedDate(tz, year, month, Math.min(p.day, lastDay), hour, 0);
}

// ─── Scheduling ───

function firstName(lead) {
  return String(lead?.name || "").trim().split(/\s+/)[0] || "there";
}

async function schedule(kind, { business, lead, sendAt, vars }) {
  const setting = getSettings(business).followups[kind];
  if (!setting.enabled || !sendAt) return null;
  const body = fillTemplate(setting.body, { business: business.name || "us", firstName: firstName(lead), ...vars });
  try {
    const row = await insertScheduledMessage({
      businessId: business.id, leadId: lead.id, kind, sendAt: sendAt.toISOString(), body,
    });
    log.info(`[scheduler] ${kind} for lead ${lead.id} at ${sendAt.toISOString()}`);
    return row;
  } catch (err) {
    // Never let a follow-up break the conversation (e.g. migration 012 not run yet).
    log.error(`[scheduler] could not schedule ${kind}:`, err.message);
    return null;
  }
}

export async function cancelFollowups(leadId, kinds) {
  try {
    const rows = await cancelScheduledMessages(leadId, kinds);
    if (rows.length) log.info(`[scheduler] cancelled ${rows.map((r) => r.kind).join(", ")} for lead ${leadId}`);
  } catch (err) {
    log.error("[scheduler] cancel failed:", err.message);
  }
}

export async function scheduleUnansweredNudge(business, lead, now = new Date()) {
  const step = getFlowConfig(business).steps?.[0];
  const options = step?.options?.length ? optionList(step) : "here";
  return schedule("unanswered_nudge", {
    business, lead, sendAt: new Date(now.getTime() + NUDGE_DELAY_MS), vars: { options },
  });
}

export async function scheduleReminder(business, lead, now = new Date()) {
  if (!lead.appointment_at) return null;
  const tz = businessTimezone(business);
  const sendAt = reminderSendAt(lead.appointment_at, tz, now);
  if (!sendAt) return null;
  const address = lead.answers?.address_label;
  return schedule("reminder", {
    business, lead, sendAt,
    vars: {
      when: describeAppointment(lead, tz, sendAt),
      window: describeAppointment(lead, tz, sendAt),
      address: address || "",
      at_address: address ? ` at ${address}` : "",
    },
  });
}

// Lead marked won: review request next morning, rebook nudge N months later.
export async function scheduleAfterWon(business, lead, now = new Date()) {
  const tz = businessTimezone(business);
  if (business.review_link) {
    await schedule("review_request", {
      business, lead, sendAt: nextMorning(tz, now), vars: { review_link: business.review_link },
    });
  }
  const rebook = getRebookConfig(business);
  if (rebook) {
    await schedule("rebook_nudge", {
      business, lead, sendAt: monthsLater(tz, now, rebook.months),
      vars: { n: String(rebook.months), thing: rebook.thing },
    });
  }
}

// ─── Dispatch ───

// Why a due message shouldn't go: "wait" (try again next run) or a cancel reason.
async function checkDue(msg, business, lead, now) {
  if (!business) return "business inactive";
  if (!lead) return "lead missing";
  if (!getSettings(business).followups[msg.kind].enabled) return "switched off";
  if (await hasPhoneOptedOut(business.id, lead.phone)) return "opted out";

  switch (msg.kind) {
    case "unanswered_nudge":
      if (lead.status !== "active" || lead.current_step !== 1) return "lead moved on";
      if (await hasInboundSince(lead.id, lead.created_at)) return "customer replied";
      if (now - new Date(msg.send_at) > NUDGE_STALE_MS) return "stale";
      if (!isOpenAt(business, now)) return "wait";
      break;
    case "reminder":
      if (lead.booking_status !== "confirmed") return "booking not confirmed";
      if (!lead.appointment_at || new Date(lead.appointment_at) <= now) return "appointment passed";
      break;
    case "review_request":
      if (lead.outcome !== "won") return "no longer won";
      break;
    case "rebook_nudge":
      if (lead.outcome !== "won") return "no longer won";
      break;
  }
  if (!withinSendingHours(businessTimezone(business), now)) return "wait";
  return null;
}

export async function dispatchDue({ now = new Date(), limit = 100, businessId = null } = {}) {
  const due = await getDueScheduledMessages(now.toISOString(), limit, businessId);
  const result = { due: due.length, sent: 0, waiting: 0, cancelled: 0, failed: 0 };

  for (const msg of due) {
    try {
      const [business, lead] = await Promise.all([getBusinessById(msg.business_id), getLeadById(msg.lead_id)]);
      const reason = await checkDue(msg, business, lead, now);
      if (reason === "wait") { result.waiting++; continue; }
      if (reason) {
        await cancelScheduledMessage(msg.id, reason);
        result.cancelled++;
        continue;
      }
      if (!(await claimScheduledMessage(msg.id))) continue; // another run took it
      try {
        await sendSms({ from: business.twilio_from_number, to: lead.phone, body: msg.body });
        await saveMessage({ leadId: lead.id, direction: "outbound", body: msg.body });
        result.sent++;
        log.info(`[dispatch] sent ${msg.kind} ${msg.id}`);
      } catch (err) {
        await releaseScheduledMessage(msg.id, err.message);
        result.failed++;
        log.error(`[dispatch] ${msg.kind} ${msg.id} failed:`, err.message);
      }
    } catch (err) {
      result.failed++;
      log.error(`[dispatch] ${msg.id} error:`, err.message);
    }
  }
  return result;
}
