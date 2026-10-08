// Getting word to people: owner alerts (SMS, email, outbound webhooks) and
// alerts to Kris. Owner notification settings live in
// businesses.integrations.notifications:
//   { sms: { enabled, numbers }, email: { enabled, addresses },
//     webhook: { enabled, urls }, urgent_only }

import { config } from "./config.js";
import { isOpenAt } from "./time.js";
import { normalizePhone } from "./phone.js";
import { sendSms } from "./sms.js";
import { log } from "./log.js";

// ─── Email via Resend ───
export async function sendEmailViaResend({ to, subject, text, html }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({
        from: process.env.NOTIFY_EMAIL || "Cove <hello@usecove.app>",
        to: Array.isArray(to) ? to : [to],
        subject,
        text,
        ...(html ? { html } : {}),
      }),
      signal: AbortSignal.timeout(8000),
    });
  } catch (err) {
    log.error("Resend email error:", err.message);
  }
}

export function isWithinOperatingHours(business, date = new Date()) {
  return isOpenAt(business, date);
}

export function getNotificationConfig(business) {
  const nc = business.integrations?.notifications || {};
  return {
    sms: {
      enabled: nc.sms?.enabled !== false,
      numbers: nc.sms?.numbers || (business.owner_notify_phone ? [business.owner_notify_phone] : []),
    },
    email: {
      enabled: !!nc.email?.enabled,
      addresses: nc.email?.addresses || (business.owner_notify_email ? [business.owner_notify_email] : []),
    },
    webhook: {
      enabled: !!nc.webhook?.enabled,
      urls: nc.webhook?.urls || [],
    },
    urgentOnly: !!nc.urgent_only,
  };
}

// SMS to every owner number, from the business's Cove number. Never throws.
export async function sendOwnerSms(business, body) {
  const nc = getNotificationConfig(business);
  if (!nc.sms.enabled || !business.twilio_from_number) return false;
  let sent = false;
  for (const num of nc.sms.numbers) {
    const to = normalizePhone(num, config.defaultCountryCode);
    if (!to) continue;
    try {
      await sendSms({ from: business.twilio_from_number, to, body });
      sent = true;
    } catch (err) {
      log.error(`[notify] owner SMS to ${to} failed:`, err.message);
    }
  }
  return sent;
}

// Kris's phone + inbox, for things only Kris can fix. Never throws.
export async function alertKris(subject, body) {
  const to = normalizePhone(config.adminAlert.to, config.defaultCountryCode);
  if (to && config.adminAlert.from && config.twilio.accountSid) {
    try {
      await sendSms({ from: config.adminAlert.from, to, body: `${subject}\n${body}` });
    } catch (err) {
      log.error("[notify] Kris SMS failed:", err.message);
    }
  }
  await sendEmailViaResend({ to: config.adminAlert.email, subject: `Cove: ${subject}`, text: body });
}

// The end-of-conversation notification. With urgent_only set, the owner SMS
// is skipped for leads that are neither urgent nor booked (email and webhooks
// still go).
export async function sendLeadNotifications({ business, lead, flowConfig, summary, urgent = false, booked = false }) {
  const nc = getNotificationConfig(business);
  const errors = [];

  if (!nc.urgentOnly || urgent || booked) {
    await sendOwnerSms(business, summary);
  }

  if (nc.webhook.enabled && nc.webhook.urls.length > 0) {
    const answers = lead.answers || {};
    const payload = {
      event: "lead.qualified",
      timestamp: new Date().toISOString(),
      business: { id: business.id, name: business.name },
      lead: {
        id: lead.id,
        name: lead.name,
        phone: lead.phone,
        email: lead.email,
        message: lead.message,
        created_at: lead.created_at,
        finished_at: lead.finished_at,
      },
      answers: {},
      raw_answers: answers,
      is_urgent: false,
      // Booking — null when the lead didn't book in-conversation.
      booking: lead.appointment_at
        ? {
            appointment_at: lead.appointment_at,
            status: lead.booking_status || "proposed",
            label: answers._appointment_label || null,
          }
        : null,
    };

    for (const step of (flowConfig?.steps || [])) {
      const code = answers[`${step.key}_code`];
      const label = answers[`${step.key}_label`];
      if (label) payload.answers[step.key] = { code, label };
      if (step.urgent_values?.some((v) => v.toUpperCase() === String(code || "").toUpperCase())) {
        payload.is_urgent = true;
      }
    }

    for (const url of nc.webhook.urls) {
      try {
        await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(10000),
        });
      } catch (err) {
        errors.push(`Webhook ${url}: ${err.message}`);
      }
    }
  }

  const subject = `New lead: ${lead.name || lead.phone} — ${business.name}`;
  if (nc.email.enabled && nc.email.addresses.length > 0) {
    await sendEmailViaResend({ to: nc.email.addresses, subject, text: summary });
  }
  // Always email owner_notify_email if set and Resend is configured
  if (business.owner_notify_email && process.env.RESEND_API_KEY) {
    const alreadySent = nc.email.enabled && nc.email.addresses.includes(business.owner_notify_email);
    if (!alreadySent) await sendEmailViaResend({ to: business.owner_notify_email, subject, text: summary });
  }

  if (errors.length > 0) log.error("[notify] Some channels failed:", errors);
}

export const INTEGRATION_DEFAULTS = {
  completion_webhook_url: null,
  webhook_secret: null,
};

export function getIntegrationConfig(business) {
  return { ...INTEGRATION_DEFAULTS, ...(business.integrations || {}) };
}
