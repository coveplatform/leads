// Buying, attaching and releasing Twilio numbers. Used by Kris's scripts; no
// route calls this.

import twilio from "twilio";
import { config } from "../config.js";
import { getBusinessNameById, saveTwilioNumber } from "../db.js";

export function webhookUrls() {
  const base = config.publicBaseUrl;
  return { smsUrl: `${base}/api/sms/inbound`, voiceUrl: `${base}/api/voice/inbound` };
}

function client() {
  return twilio(config.twilio.accountSid, config.twilio.authToken);
}

// Buys an AU number (mobile when a regulatory bundle is configured — needed
// for two-way SMS — else local in the requested area code), points its voice
// + SMS webhooks at Cove and saves it on the business.
// Returns the E.164 number, or null if Twilio isn't configured / none available.
export async function provisionNumber(businessId, { areaCode = null } = {}) {
  if (!config.twilio.accountSid || !config.twilio.authToken) return null;

  try {
    const client = twilio(config.twilio.accountSid, config.twilio.authToken);
    const { smsUrl, voiceUrl } = webhookUrls();

    const addressSid          = process.env.TWILIO_ADDRESS_SID           || null;
    const bundleSid           = process.env.TWILIO_BUNDLE_SID            || null;
    const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID || null;

    const bizName = await getBusinessNameById(businessId).catch(() => null);
    const friendlyName = bizName ? `Cove — ${bizName}` : "Cove";

    // Try AU mobile first (needs regulatory bundle), then AU local
    let phoneNumber = null;
    for (const type of ["mobile", "local"]) {
      try {
        if (type === "mobile" && !bundleSid) {
          console.warn("[provision] Skipping AU mobile — TWILIO_BUNDLE_SID not set");
          continue;
        }
        const list = await client.availablePhoneNumbers("AU")[type].list({ smsEnabled: true, limit: 50 });
        // Twilio's areaCode filter is US-only; filter AU local numbers ourselves.
        const prefix = type === "local" && areaCode ? `+61${String(areaCode).replace(/^0/, "")}` : "+61";
        const matching = list.filter((n) => n.phoneNumber.startsWith(prefix));
        if (!matching.length) { console.warn(`[provision] No AU ${type} numbers available (${prefix})`); continue; }
        const pick = matching.find((n) => !n.beta) || matching[0];
        phoneNumber = pick.phoneNumber;
        console.log(`[provision] Selected AU ${type}: ${phoneNumber}`);
        break;
      } catch (e) { console.warn(`[provision] AU ${type} search failed:`, e.message); }
    }

    if (!phoneNumber) {
      console.error("[provision] No AU numbers available");
      return null;
    }

    const createParams = {
      phoneNumber,
      friendlyName,
      smsUrl,
      smsMethod: "POST",
      voiceUrl,
      voiceMethod: "POST",
    };
    if (bundleSid)  createParams.bundleSid  = bundleSid;
    if (addressSid) createParams.addressSid = addressSid;

    const purchased = await client.incomingPhoneNumbers.create(createParams);
    console.log(`[provision] Purchased ${purchased.phoneNumber} (SID: ${purchased.sid})`);

    // Add to Messaging Service Sender Pool for compliance + opt-out management
    if (messagingServiceSid) {
      try {
        await client.messaging.v1.services(messagingServiceSid)
          .phoneNumbers
          .create({ phoneNumberSid: purchased.sid });
        console.log(`[provision] Added to Messaging Service ${messagingServiceSid}`);
      } catch (e) {
        console.warn("[provision] Could not add to Messaging Service:", e.message);
      }
    }

    await saveTwilioNumber(businessId, purchased.phoneNumber);
    return purchased.phoneNumber;
  } catch (err) {
    console.error("[provision] Twilio provisioning error:", err);
    return null;
  }
}

// A number already on the Twilio account: point its webhooks at Cove and save it.
export async function attachExistingNumber(businessId, phoneNumber) {
  const [found] = await client().incomingPhoneNumbers.list({ phoneNumber, limit: 1 });
  if (!found) throw new Error(`${phoneNumber} isn't on this Twilio account`);
  const { smsUrl, voiceUrl } = webhookUrls();
  await client().incomingPhoneNumbers(found.sid).update({ smsUrl, smsMethod: "POST", voiceUrl, voiceMethod: "POST" });
  await saveTwilioNumber(businessId, found.phoneNumber);
  return found.phoneNumber;
}

// Give a number back to Twilio (stops the monthly charge). Irreversible.
export async function releaseNumber(phoneNumber) {
  const [found] = await client().incomingPhoneNumbers.list({ phoneNumber, limit: 1 });
  if (!found) return false;
  await client().incomingPhoneNumbers(found.sid).remove();
  return true;
}
