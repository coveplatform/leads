// SMS from the owner to their own Cove number. Booking alerts end with
// "Reply Y to confirm, N to decline, or a time to change"; this applies the
// reply to the newest booking still waiting on them.

import { config } from "../config.js";
import { getPendingBookings, saveMessage } from "../db.js";
import { getNotificationConfig, sendOwnerSms } from "../integrations.js";
import { formatPhoneDisplay, normalizePhone } from "../phone.js";
import { confirmBooking, declineBooking, changeBooking, whenText } from "./lead-actions.js";
import { log } from "../log.js";

const YES = /^(y|yes|yep|yeah|yup|confirm|confirmed|ok|okay|sure|👍)[.!]*$/i;
const NO = /^(n|no|nope|nah|decline|declined|can'?t|cannot|cancel)[.!]*$/i;

export function isOwnerPhone(business, phone) {
  if (!phone) return false;
  const numbers = [business.owner_notify_phone, ...getNotificationConfig(business).sms.numbers];
  return numbers.some((n) => n && normalizePhone(n, config.defaultCountryCode) === phone);
}

export function parseOwnerReply(text) {
  const t = String(text || "").trim();
  if (!t) return { action: "none" };
  if (YES.test(t)) return { action: "confirm" };
  if (NO.test(t)) return { action: "decline" };
  return { action: "change", time: t };
}

// Handles the owner's message and texts them back what happened.
export async function handleOwnerReply(business, bodyRaw) {
  const reply = parseOwnerReply(bodyRaw);
  const pending = await getPendingBookings(business.id);
  const dashboard = `${config.baseUrl}/dashboard`;

  if (pending.length === 0) {
    await sendOwnerSms(business, `No bookings are waiting on you right now. Your leads: ${dashboard}`);
    return { handled: true, action: "none" };
  }

  const lead = pending[0];
  const who = formatPhoneDisplay(lead.phone);
  let message;
  if (reply.action === "confirm") {
    await confirmBooking(business, lead, { via: "sms" });
    message = `Confirmed ${who} for ${whenText(business, lead)}. We've texted them.`;
  } else if (reply.action === "decline") {
    await declineBooking(business, lead, { via: "sms" });
    message = `Declined ${who}. We've told them you'll call to sort another time.`;
  } else if (reply.action === "change" && reply.time.length <= 60) {
    await changeBooking(business, lead, reply.time, { via: "sms" });
    message = `Moved ${who} to "${reply.time}" and texted them. No automatic reminder for a changed time.`;
  } else {
    message = `Reply Y to confirm ${who} for ${whenText(business, lead)}, N to decline, or a short time like "Thu 2pm".`;
  }
  await saveMessage({ leadId: lead.id, direction: "system", body: `Owner replied: ${String(bodyRaw).slice(0, 200)}` });

  const rest = pending.length - 1;
  if (rest > 0 && reply.action !== "none") {
    const next = pending[1];
    message += `\n\n${rest} more waiting. Next: ${formatPhoneDisplay(next.phone)} for ${whenText(business, next)} — reply Y or N.`;
  }
  await sendOwnerSms(business, message);
  log.info(`[owner-reply] business ${business.id}: ${reply.action} → lead ${lead.id}`);
  return { handled: true, action: reply.action, leadId: lead.id };
}
