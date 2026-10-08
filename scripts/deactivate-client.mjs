// Take a client off Cove. Their number stops taking calls immediately and is
// released back to Twilio after a 30-day grace period.
//
//   node scripts/deactivate-client.mjs <business_id>                 switch off, start the 30-day grace
//   node scripts/deactivate-client.mjs <business_id> --reactivate    switch back on, cancel the grace
//   node scripts/deactivate-client.mjs --release-due [--dry-run]     release numbers whose grace has ended
import "dotenv/config";
import {
  deactivateBusiness,
  reactivateBusiness,
  getNumbersDueForRelease,
  clearTwilioNumber,
} from "../src/db.js";
import { releaseNumber } from "../src/services/twilio-numbers.js";

const args = process.argv.slice(2);
const id = args.find((a) => !a.startsWith("--"));

if (args.includes("--release-due")) {
  const due = await getNumbersDueForRelease();
  if (!due.length) console.log("No numbers due for release.");
  for (const b of due) {
    if (args.includes("--dry-run")) { console.log(`would release ${b.twilio_from_number} (${b.name})`); continue; }
    const released = await releaseNumber(b.twilio_from_number);
    await clearTwilioNumber(b.id);
    console.log(`${released ? "released" : "not on Twilio, cleared"} ${b.twilio_from_number} (${b.name})`);
  }
} else if (id && args.includes("--reactivate")) {
  const b = await reactivateBusiness(id);
  console.log(b ? `✓ ${b.name} is back on (${b.twilio_from_number || "no number — re-run onboarding"})` : "No such business");
} else if (id) {
  const b = await deactivateBusiness(id);
  if (!b) { console.error("No such business"); process.exit(1); }
  console.log(`✓ ${b.name} switched off. Number ${b.twilio_from_number || "(none)"} will be releasable after ${new Date(b.release_number_after).toDateString()}.`);
  console.log("  Ask the owner to cancel forwarding on their mobile: dial ##002#");
} else {
  console.error("Usage: node scripts/deactivate-client.mjs <business_id> [--reactivate] | --release-due [--dry-run]");
  process.exit(1);
}
