// Integration utilities: after-hours, CRM webhooks, lead nudge/timeout

// ─── Email via Resend ───
export async function sendEmailViaResend({ to, subject, text }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({
        from: process.env.NOTIFY_EMAIL || "Cove <noreply@coveplatform.com>",
        to: Array.isArray(to) ? to : [to],
        subject,
        text,
      }),
      signal: AbortSignal.timeout(8000),
    });
  } catch (err) {
    console.error("Resend email error:", err.message);
  }
}

// ─── After-Hours Detection ───

export function isWithinOperatingHours(business) {
  const hours = business.operating_hours;
  if (!hours || !hours.enabled) return true;

  const tz = hours.timezone || "Australia/Sydney";
  const now = new Date();

  let localHour, localDay;
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "numeric",
      hour12: false,
      weekday: "short",
    }).formatToParts(now);
    localHour = Number(parts.find((p) => p.type === "hour")?.value || 0);
    localDay = parts.find((p) => p.type === "weekday")?.value || "";
  } catch {
    return true;
  }

  const dayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dayNum = dayMap[localDay] ?? new Date().getDay();

  const closedDays = hours.closed_days || [];
  if (closedDays.includes(dayNum)) return false;

  const open = hours.open_hour ?? 8;
  const close = hours.close_hour ?? 18;
  return localHour >= open && localHour < close;
}

export function buildAfterHoursMessage(business) {
  const hours = business.operating_hours || {};
  const openHour = hours.open_hour ?? 8;
  const ampm = openHour > 12 ? `${openHour - 12}pm` : `${openHour}am`;
  return (
    hours.after_hours_message ||
    `Thanks for reaching out to ${business.name || "us"}! We're currently closed. We'll text you back at ${ampm} when we open. If this is urgent, please call us directly.`
  );
}

// ─── Outbound Completion Webhook (push to CRM/Zapier) ───

export async function fireCompletionWebhook(business, lead, flowConfig) {
  const integrations = business.integrations;
  if (!integrations) return;

  const webhookUrl = integrations.completion_webhook_url;
  if (!webhookUrl) return;

  const answers = lead.answers || {};
  const payload = {
    event: "lead.qualified",
    timestamp: new Date().toISOString(),
    business: {
      id: business.id,
      name: business.name,
    },
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
  };

  for (const step of (flowConfig?.steps || [])) {
    const code = answers[`${step.key}_code`];
    const label = answers[`${step.key}_label`];
    if (label) {
      payload.answers[step.key] = { code, label };
    }
    if (step.urgent_values?.some((v) => v.toUpperCase() === String(code || "").toUpperCase())) {
      payload.is_urgent = true;
    }
  }

  try {
    const headers = { "Content-Type": "application/json" };
    if (integrations.webhook_secret) {
      headers["X-Cove-Secret"] = integrations.webhook_secret;
    }

    const resp = await fetch(webhookUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });

    if (!resp.ok) {
      console.error(`Completion webhook failed ${resp.status} for business ${business.id}`);
    }
  } catch (err) {
    console.error(`Completion webhook error for business ${business.id}:`, err.message);
  }
}

// ─── Lead Nudge ───

export function shouldNudge(lead, business) {
  const integrations = business.integrations || {};
  const nudgeMinutes = integrations.nudge_after_minutes || 0;
  if (!nudgeMinutes || lead.status !== "active") return false;

  const answers = lead.answers || {};
  if (answers._nudge_sent) return false;

  const lastActivity = lead.updated_at || lead.created_at;
  if (!lastActivity) return false;

  const elapsed = (Date.now() - new Date(lastActivity).getTime()) / 60000;
  return elapsed >= nudgeMinutes;
}

export function buildNudgeMessage(business, lead, flowConfig) {
  const integrations = business.integrations || {};
  if (integrations.nudge_message) {
    return integrations.nudge_message
      .replace(/{businessName}/g, business.name || "us")
      .replace(/{firstName}/g, (lead.name || "").split(" ")[0] || "there");
  }

  const step = flowConfig?.steps[(lead.current_step || 1) - 1];
  const question = step?.question || "";
  return `Hey, just checking in! We still have your enquiry open. Reply to continue:\n\n${question}`;
}

// ─── Notification Channel Dispatch ───

export function getNotificationConfig(business) {
  const integrations = business.integrations || {};
  const nc = integrations.notifications || {};
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
  };
}

export async function sendLeadNotifications({ business, lead, flowConfig, summary, sendSmsFn, normalizePhoneFn, defaultCountryCode }) {
  const nc = getNotificationConfig(business);
  const errors = [];

  // SMS to all configured numbers
  if (nc.sms.enabled && nc.sms.numbers.length > 0) {
    for (const num of nc.sms.numbers) {
      try {
        const normalized = normalizePhoneFn(num, defaultCountryCode);
        if (normalized) {
          await sendSmsFn({
            from: business.twilio_from_number,
            to: normalized,
            body: summary,
          });
        }
      } catch (err) {
        errors.push(`SMS to ${num}: ${err.message}`);
      }
    }
  }

  // Webhooks to all configured URLs
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

  // Email via Resend
  if (nc.email.enabled && nc.email.addresses.length > 0) {
    const subject = `New lead: ${lead.name || lead.phone} — ${business.name}`;
    await sendEmailViaResend({ to: nc.email.addresses, subject, text: summary }).catch(e =>
      errors.push(`Email: ${e.message}`)
    );
  }

  // Always email owner_notify_email if set and Resend is configured
  if (business.owner_notify_email && process.env.RESEND_API_KEY) {
    const alreadySent = nc.email.enabled && nc.email.addresses.includes(business.owner_notify_email);
    if (!alreadySent) {
      const subject = `New lead: ${lead.name || lead.phone} — ${business.name}`;
      await sendEmailViaResend({ to: business.owner_notify_email, subject, text: summary }).catch(e =>
        errors.push(`Email owner: ${e.message}`)
      );
    }
  }

  if (errors.length > 0) {
    console.error("[Notification] Some channels failed:", errors);
  }
}

// ─── Integration Config Defaults ───

export const INTEGRATION_DEFAULTS = {
  completion_webhook_url: null,
  webhook_secret: null,
  nudge_after_minutes: 0,
  nudge_message: null,
  push_to: null,
};

export function getIntegrationConfig(business) {
  return { ...INTEGRATION_DEFAULTS, ...(business.integrations || {}) };
}
