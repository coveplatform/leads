// Starting a lead: the one path every entry point (missed call, cold SMS,
// generic webhook, public lead API, owner test) goes through, so opt-out and
// dedupe rules can't drift between them.

import { getFlowConfig, buildIntro } from "../flow-engine.js";
import { checkDuplicateLead, createLead, hasPhoneOptedOut, saveMessage } from "../db.js";
import { sendSms } from "../sms.js";

export const DEDUPE_MINUTES = 30;

// Returns { status, lead }:
//   'opted_out' — the phone sent STOP to this business; nothing sent, lead null
//   'duplicate' — an active lead for this phone at this business is <30 min old; lead is that one
//   'created'   — new lead created and the intro + first question texted
export async function startLead({
  business,
  phone,
  name = null,
  email = null,
  message = null,
  systemNote = null,   // shown in the conversation, e.g. "📞 Missed call"
  inboundBody = null,  // the customer's own text when they texted first
  skipDedupe = false,
}) {
  if (await hasPhoneOptedOut(business.id, phone)) {
    return { status: "opted_out", lead: null };
  }

  if (!skipDedupe) {
    const existing = await checkDuplicateLead(business.id, phone, DEDUPE_MINUTES);
    if (existing) return { status: "duplicate", lead: existing };
  }

  const lead = await createLead({ businessId: business.id, name, phone, email, message });
  if (systemNote) await saveMessage({ leadId: lead.id, direction: "system", body: systemNote });
  if (inboundBody) await saveMessage({ leadId: lead.id, direction: "inbound", body: inboundBody });

  // Always qualify — even after hours. The completion line (built at the end
  // of the flow) sets the morning-callback expectation when we're closed.
  const firstMessage = buildIntro(getFlowConfig(business), name, business.name);
  await sendSms({ from: business.twilio_from_number, to: phone, body: firstMessage });
  await saveMessage({ leadId: lead.id, direction: "outbound", body: firstMessage });

  return { status: "created", lead };
}
