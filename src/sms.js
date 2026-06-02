import twilio from "twilio";
import { config } from "./config.js";

let _client = null;
function getClient() {
  if (!_client) _client = twilio(config.twilio.accountSid, config.twilio.authToken);
  return _client;
}

export async function sendSms({ from, to, body }) {
  if (!from || !to || !body) {
    throw new Error("sendSms requires from, to, and body");
  }
  // Opt-in dry-run seam for local dev / E2E tests — never touches Twilio.
  // Production never sets SMS_DRY_RUN, so behaviour there is unchanged.
  if (process.env.SMS_DRY_RUN === "1") {
    if (config.debug) console.log(`[sms:dry-run] → ${to}: ${String(body).slice(0, 80)}`);
    return { sid: "DRYRUN", status: "dry-run", to, from, body };
  }
  return getClient().messages.create({ from, to, body });
}
