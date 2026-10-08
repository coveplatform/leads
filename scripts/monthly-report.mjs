// The basis for a client's invoice: exact counts for one calendar month in the
// business's own timezone, plus every confirmed booking and won job itemised.
// Same inputs always give the same output; nothing is estimated.
//
//   node scripts/monthly-report.mjs <business_id> <YYYY-MM>
//
// Definitions:
//   missed calls          leads from a forwarded call created in the month (tests excluded)
//   recovered             of those, the caller texted back at least once
//   bookings confirmed    booking_confirmed_at falls in the month
//   jobs won              outcome = won and outcome_at falls in the month
//   reminders / reviews   follow-ups actually sent in the month

import "dotenv/config";
import { sql, getBusinessesOverview } from "../src/db.js";
import { zonedDate, businessTimezone } from "../src/time.js";
import { formatPhoneDisplay } from "../src/phone.js";
import { formatAppointment } from "../src/booking.js";

const [businessId, month] = process.argv.slice(2);
if (!businessId || !/^\d{4}-\d{2}$/.test(month || "")) {
  console.error("Usage: node scripts/monthly-report.mjs <business_id> <YYYY-MM>");
  process.exit(1);
}

const business = (await getBusinessesOverview()).find((b) => b.id === businessId);
if (!business) { console.error("No such business"); process.exit(1); }

const tz = businessTimezone(business);
const [y, m] = month.split("-").map(Number);
const from = zonedDate(tz, y, m, 1, 0, 0).toISOString();
const to = zonedDate(tz, m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1, 1, 0, 0).toISOString();

const [counts] = await sql`
  SELECT
    COUNT(*) FILTER (WHERE source = 'missed_call')::int AS missed_calls,
    COUNT(*) FILTER (WHERE source = 'missed_call' AND EXISTS (
      SELECT 1 FROM messages m WHERE m.lead_id = l.id AND m.direction = 'inbound'))::int AS recovered,
    COUNT(*) FILTER (WHERE COALESCE(source, '') NOT IN ('missed_call', 'test'))::int AS other_leads
  FROM leads l
  WHERE business_id = ${businessId} AND created_at >= ${from}::timestamptz AND created_at < ${to}::timestamptz
`;
const bookings = await sql`
  SELECT * FROM leads
  WHERE business_id = ${businessId} AND booking_status = 'confirmed' AND COALESCE(source, '') <> 'test'
    AND booking_confirmed_at >= ${from}::timestamptz AND booking_confirmed_at < ${to}::timestamptz
  ORDER BY booking_confirmed_at
`;
const won = await sql`
  SELECT * FROM leads
  WHERE business_id = ${businessId} AND outcome = 'won' AND COALESCE(source, '') <> 'test'
    AND outcome_at >= ${from}::timestamptz AND outcome_at < ${to}::timestamptz
  ORDER BY outcome_at
`;
const sent = await sql`
  SELECT kind, COUNT(*)::int AS n FROM scheduled_messages
  WHERE business_id = ${businessId} AND sent_at >= ${from}::timestamptz AND sent_at < ${to}::timestamptz
  GROUP BY kind
`;
const sentBy = Object.fromEntries(sent.map((r) => [r.kind, r.n]));
const day = (ts) => new Intl.DateTimeFormat("en-AU", { timeZone: tz, day: "2-digit", month: "short" }).format(new Date(ts));

console.log(`${business.name} — ${month} (${tz})\n`);
console.log(`Missed calls                ${counts.missed_calls}`);
console.log(`  recovered (caller replied) ${counts.recovered}`);
console.log(`Other leads (SMS, web)      ${counts.other_leads}`);
console.log(`Bookings confirmed          ${bookings.length}`);
console.log(`Jobs won                    ${won.length}`);
console.log(`Reminders sent              ${sentBy.reminder || 0}`);
console.log(`Review requests sent        ${sentBy.review_request || 0}`);
console.log(`Rebook nudges sent          ${sentBy.rebook_nudge || 0}`);

if (bookings.length) {
  console.log("\nConfirmed bookings");
  for (const l of bookings) {
    console.log(`  ${day(l.booking_confirmed_at)}  ${formatPhoneDisplay(l.phone).padEnd(14)}  ${formatAppointment(l, tz) || ""}  ${l.id}`);
  }
}
if (won.length) {
  console.log("\nJobs won");
  for (const l of won) {
    const value = l.job_value != null ? `$${Number(l.job_value).toLocaleString("en-AU")}` : "";
    console.log(`  ${day(l.outcome_at)}  ${formatPhoneDisplay(l.phone).padEnd(14)}  ${value.padEnd(9)}  ${l.id}`);
  }
}
