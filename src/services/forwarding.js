// Forwarding can break silently (new phone, carrier reset, Message Bank turned
// back on). The heartbeat (last_inbound_call_at) shows when the last forwarded
// call arrived; a business that was getting calls and then goes quiet for 3 of
// its open days is probably not forwarding any more.

import { config } from "../config.js";
import { normalizeHours, localDayAfter, zonedDate } from "../time.js";
import { getAllBusinesses, setForwardingAlerted } from "../db.js";
import { sendOwnerSms, alertKris } from "../integrations.js";
import { toLocalDigits } from "../phone.js";
import { log } from "../log.js";

const LOOKBACK_DAYS = 14;
const QUIET_OPEN_DAYS = 3;

// Conditional (no answer) forwarding, the same code on Telstra, Optus and Vodafone.
export function forwardingCodes(coveNumber) {
  const local = toLocalDigits(coveNumber);
  return {
    noAnswer: `**61*${local}*11*20#`,
    busy: `**67*${local}#`,
    unreachable: `**62*${local}#`,
    cancelAll: "##002#",
  };
}

export function dialLink(code) {
  return `${config.baseUrl}/dial/${encodeURIComponent(code)}`;
}

// Start of the open day `count` open days before `now` (today counts if open).
export function quietCutoff(business, now = new Date(), count = QUIET_OPEN_DAYS) {
  const hours = normalizeHours(business.operating_hours);
  let seen = 0;
  for (let i = 0; i < 21; i++) {
    const d = localDayAfter(hours.timezone, now, -i);
    if (!hours.days[d.weekday]) continue;
    seen++;
    if (seen === count) return zonedDate(hours.timezone, d.year, d.month, d.day, 0, 0);
  }
  return new Date(now.getTime() - count * 86400000);
}

export function needsForwardingAlert(business, now = new Date()) {
  const last = business.last_inbound_call_at ? new Date(business.last_inbound_call_at) : null;
  if (!last || !business.twilio_from_number) return false;
  if (now - last > LOOKBACK_DAYS * 86400000) return false;       // quiet for ages: already alerted or never used
  if (last >= quietCutoff(business, now)) return false;           // calls still arriving
  const alerted = business.forwarding_alerted_at ? new Date(business.forwarding_alerted_at) : null;
  return !alerted || alerted < last;                              // once per quiet spell
}

export async function runForwardingCheck(now = new Date()) {
  const alerted = [];
  for (const business of await getAllBusinesses()) {
    if (!needsForwardingAlert(business, now)) continue;
    const since = new Intl.DateTimeFormat("en-AU", {
      timeZone: normalizeHours(business.operating_hours).timezone, weekday: "short", day: "numeric", month: "short",
    }).format(new Date(business.last_inbound_call_at));
    const code = forwardingCodes(business.twilio_from_number).noAnswer;

    await sendOwnerSms(business,
      `Heads up from Cove: no missed calls have come through for ${business.name} since ${since}. ` +
      `If you've changed phones or carriers, call forwarding may be off. Tap to turn it back on: ${dialLink(code)} (or dial ${code}).`);
    await alertKris(`Forwarding quiet: ${business.name}`, `No forwarded calls since ${since}. Owner has been texted.`);
    await setForwardingAlerted(business.id);
    alerted.push(business.id);
    log.info(`[forwarding-check] alerted ${business.name}`);
  }
  return { alerted };
}
