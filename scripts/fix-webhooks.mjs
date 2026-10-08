// Points every Cove business's Twilio number back at BASE_URL's voice + SMS
// webhooks. Run when the health check reports webhook problems.
//   node scripts/fix-webhooks.mjs [--dry-run]
import "dotenv/config";
import twilio from "twilio";
import { config } from "../src/config.js";
import { getBusinessesOverview } from "../src/db.js";
import { webhookUrls } from "../src/services/twilio-numbers.js";

const dryRun = process.argv.includes("--dry-run");
const client = twilio(config.twilio.accountSid, config.twilio.authToken);
const { smsUrl, voiceUrl } = webhookUrls();
console.log(`SMS URL  : ${smsUrl}\nVoice URL: ${voiceUrl}\n`);

const ours = new Set((await getBusinessesOverview()).map((b) => b.twilio_from_number).filter(Boolean));
for (const num of await client.incomingPhoneNumbers.list({ limit: 1000 })) {
  if (!ours.has(num.phoneNumber)) { console.log(`–  ${num.phoneNumber} not a Cove business, skipped`); continue; }
  if (num.smsUrl === smsUrl && num.voiceUrl === voiceUrl) { console.log(`✓  ${num.phoneNumber}`); continue; }
  console.log(`🔧 ${num.phoneNumber}: ${num.voiceUrl || "(none)"} → ${voiceUrl}`);
  if (!dryRun) {
    await client.incomingPhoneNumbers(num.sid).update({ smsUrl, smsMethod: "POST", voiceUrl, voiceMethod: "POST" });
  }
}
