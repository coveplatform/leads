// One line per business: number, forwarding health, leads this month.
//   node scripts/list-clients.mjs
import "dotenv/config";
import { getBusinessesOverview } from "../src/db.js";
import { formatPhoneDisplay } from "../src/phone.js";

const ago = (ts) => {
  if (!ts) return "never";
  const days = (Date.now() - new Date(ts)) / 86400000;
  return days < 1 ? `${Math.round(days * 24)}h ago` : `${Math.round(days)}d ago`;
};
const health = (b) => {
  if (!b.last_inbound_call_at) return "⚪ no calls yet";
  const days = (Date.now() - new Date(b.last_inbound_call_at)) / 86400000;
  return days <= 3 ? "🟢" : days <= 14 ? "🟠" : "🔴";
};

const rows = await getBusinessesOverview();
for (const b of rows) {
  console.log([
    b.is_active ? "ON " : "OFF",
    b.name.padEnd(28).slice(0, 28),
    (b.twilio_from_number ? formatPhoneDisplay(b.twilio_from_number) : "no number").padEnd(15),
    `${health(b)} last call ${ago(b.last_inbound_call_at)}`.padEnd(26),
    `${String(b.leads_this_month).padStart(3)} leads this month`,
    b.id,
  ].join("  "));
}
console.log(`\n${rows.length} businesses`);
