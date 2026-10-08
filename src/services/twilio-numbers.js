// Buying and wiring up Twilio numbers for a business. Used by the onboarding
// script; no route calls this.

import twilio from "twilio";
import { config } from "../config.js";
import { getBusinessNameById, saveTwilioNumber } from "../db.js";

export function webhookUrls() {
  const base = config.publicBaseUrl;
  return { smsUrl: `${base}/api/sms/inbound`, voiceUrl: `${base}/api/voice/inbound` };
}

// Buys an AU number (mobile when a regulatory bundle is configured, else local),
// points its voice + SMS webhooks at Cove and saves it on the business.
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
        const query = { smsEnabled: true, mmsEnabled: true, limit: 20 };
        if (type === "local" && areaCode) query.areaCode = String(areaCode).replace(/^0/, "");
        const list = await client.availablePhoneNumbers("AU")[type].list(query);
        if (!list.length) { console.warn(`[provision] No AU ${type} numbers available`); continue; }
        const pick = list.find((n) => !n.beta) || list[0];
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
