// Starting a lead: the one path every entry point (missed call, cold SMS,
// generic webhook, public lead API, owner test) goes through, so opt-out and
// dedupe rules can't drift between them.

import { getFlowConfig, buildIntro, buildMissedCallAlert } from "../flow-engine.js";
import { checkDuplicateLead, createLead, hasPhoneOptedOut, saveMessage } from "../db.js";
import { sendSms } from "../sms.js";
import { sendOwnerSms } from "../integrations.js";
import { getSettings } from "../settings.js";
import { scheduleUnansweredNudge } from "./scheduler.js";

export const DEDUPE_MINUTES = 30;

// Returns { status, lead }:
//   'opted_out' — the phone sent STOP to this business; nothing sent, lead null
//   'duplicate' — an active lead for this phone at this business is <30 min old; lead is that one
//   'created'   — new lead created and the intro + first question texted
//
// source: missed_call | sms | webhook | api | test. A missed call also sends
// the owner a one-line alert straight away (unless switched off), so a caller
// who never replies still shows up on the owner's phone.
export async function startLead({
  business,
  phone,
  name = null,
  email = null,
  message = null,
  systemNote = null,   // shown in the conversation, e.g. "📞 Missed call"
  inboundBody = null,  // the customer's own text when they texted first
  skipDedupe = false,
  source = null,
}) {
  if (await hasPhoneOptedOut(business.id, phone)) {
    return { status: "opted_out", lead: null };
  }

  if (!skipDedupe) {
    const existing = await checkDuplicateLead(business.id, phone, DEDUPE_MINUTES);
    if (existing) return { status: "duplicate", lead: existing };
  }

  const lead = await createLead({ businessId: business.id, name, phone, email, message, source });
  if (systemNote) await saveMessage({ leadId: lead.id, direction: "system", body: systemNote });
  if (inboundBody) await saveMessage({ leadId: lead.id, direction: "inbound", body: inboundBody });

  // Always qualify — even after hours. The completion line (built at the end
  // of the flow) sets the morning-callback expectation when we're closed.
  const firstMessage = buildIntro(getFlowConfig(business), name, business.name);
  await sendSms({ from: business.twilio_from_number, to: phone, body: firstMessage });
  await saveMessage({ leadId: lead.id, direction: "outbound", body: firstMessage });

  if (source === "missed_call" && getSettings(business).missedCallAlert) {
    await sendOwnerSms(business, buildMissedCallAlert(lead));
  }
  if (source !== "test") await scheduleUnansweredNudge(business, lead);

  return { status: "created", lead };
}
