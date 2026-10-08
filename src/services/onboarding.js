// Turning a client config file (clients/<name>.json) into a valid business:
// validation, flow building, hours, notification settings. The script in
// scripts/onboard-client.mjs does the I/O; everything here is pure.

import { randomInt } from "node:crypto";
import { INDUSTRY_TEMPLATES } from "../flow-engine.js";
import { isValidPhone, normalizePhone } from "../phone.js";
import { validateDayHours } from "../time.js";
import { FOLLOWUP_KINDS } from "../settings.js";

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const TRADES = ["plumbing", "electrical", "hvac", "roofing", "general"];

function isTimezone(tz) {
  try {
    new Intl.DateTimeFormat("en-AU", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// → { errors: string[], warnings: string[] }
export function validateClientConfig(cfg) {
  const errors = [];
  const warnings = [];
  const b = cfg?.business || {};

  if (!b.name || typeof b.name !== "string") errors.push("business.name is required");
  if (!INDUSTRY_TEMPLATES[b.industry]) errors.push(`business.industry must be one of: ${Object.keys(INDUSTRY_TEMPLATES).join(", ")}`);
  else if (!TRADES.includes(b.industry)) warnings.push(`${b.industry} is a non-trade template; it gets no further work`);
  if (!isValidPhone(b.owner_phone)) errors.push("business.owner_phone must be a valid phone number (e.g. +61412345678)");
  if (b.owner_email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(b.owner_email)) errors.push("business.owner_email is not an email address");
  if (b.business_phone && !isValidPhone(b.business_phone)) errors.push("business.business_phone is not a valid phone number");
  if (!b.timezone || !isTimezone(b.timezone)) errors.push("business.timezone must be an IANA zone like Australia/Brisbane");
  const hoursError = validateDayHours(b.operating_hours);
  if (hoursError) errors.push(`business.operating_hours: ${hoursError}`);
  if (b.avg_job_value != null && !(Number(b.avg_job_value) >= 0)) errors.push("business.avg_job_value must be a number");
  if (b.review_link && !/^https:\/\/\S+$/.test(b.review_link)) errors.push("business.review_link must start with https://");
  if (!b.review_link) warnings.push("no business.review_link — review requests won't be sent until one is set");

  const flow = cfg?.flow || {};
  const template = flow.template || b.industry;
  if (!INDUSTRY_TEMPLATES[template]) errors.push(`flow.template "${template}" doesn't exist`);
  if (flow.voice_mode && !["hangup", "dial_first"].includes(flow.voice_mode)) errors.push("flow.voice_mode must be hangup or dial_first");
  if (flow.dial_to && !isValidPhone(flow.dial_to)) errors.push("flow.dial_to must be a valid phone number");
  if (flow.booking_style && !["windows", "slots"].includes(flow.booking_style)) errors.push("flow.booking_style must be windows or slots");
  const o = flow.overrides || {};
  if (o.options !== undefined) {
    if (!Array.isArray(o.options) || o.options.some((x) => !x || !x.value || !x.label)) {
      errors.push("flow.overrides.options must be a list of { value, label, synonyms? }");
    }
  }

  const tw = cfg?.twilio || {};
  if (tw.existing_number && !isValidPhone(tw.existing_number)) errors.push("twilio.existing_number is not a valid phone number");
  if (tw.area_code && !/^0[2378]$/.test(String(tw.area_code))) errors.push("twilio.area_code must be 02, 03, 07 or 08");

  const login = cfg?.login || {};
  const loginEmail = login.email || b.owner_email;
  if (!loginEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(loginEmail)) errors.push("login.email (or business.owner_email) is required");
  if (login.temp_password && login.temp_password !== "generate" && String(login.temp_password).length < 8) {
    errors.push('login.temp_password must be "generate" or at least 8 characters');
  }

  const fu = cfg?.followups || {};
  for (const [k, v] of Object.entries(fu)) {
    if (!FOLLOWUP_KINDS.includes(k)) errors.push(`followups.${k} is not a follow-up (${FOLLOWUP_KINDS.join(", ")})`);
    else if (typeof v !== "boolean") errors.push(`followups.${k} must be true or false`);
  }
  return { errors, warnings };
}

// Template + overrides → flow_config.
export function buildFlowConfig(cfg) {
  const flow = cfg.flow || {};
  const template = structuredClone(INDUSTRY_TEMPLATES[flow.template || cfg.business.industry]);
  const o = flow.overrides || {};
  const step = template.steps[0];

  if (o.intro) template.intro = o.intro;
  if (o.completion) template.completion = o.completion;
  if (o.completion_with_booking) template.completion_with_booking = o.completion_with_booking;
  if (o.question) step.question = o.question;
  if (o.invalid_text) step.invalid_text = o.invalid_text;
  if (Array.isArray(o.options)) {
    step.options = o.options.map((x) => ({ value: String(x.value), label: x.label, ...(x.synonyms ? { synonyms: x.synonyms } : {}) }));
  }
  if (Array.isArray(o.urgent_values)) step.urgent_values = o.urgent_values.map(String);

  template.booking = {
    enabled: flow.booking !== false,
    slots: 2,
    ...(flow.booking_prompt ? { prompt: flow.booking_prompt } : {}),
    ...(flow.booking_style ? { style: flow.booking_style } : {}),
  };
  if (flow.voice_mode) template.voice_mode = flow.voice_mode;
  if (flow.dial_to) template.dial_to = normalizePhone(flow.dial_to);
  if (flow.rebook !== undefined) template.rebook = flow.rebook;
  return template;
}

// Config hours (mon..sun) → operating_hours in the new per-day shape.
export function buildOperatingHours(cfg) {
  const days = {};
  for (const d of DAYS) days[d] = cfg.business.operating_hours?.[d] || null;
  return { timezone: cfg.business.timezone, days };
}

export function buildIntegrations(cfg, current = {}) {
  const n = cfg.notifications || {};
  const b = cfg.business;
  return {
    ...current,
    notifications: {
      ...(current.notifications || {}),
      sms: { enabled: n.sms !== false, numbers: [normalizePhone(b.owner_phone)] },
      email: { enabled: !!n.email, addresses: b.owner_email ? [b.owner_email] : [] },
      urgent_only: !!n.urgent_only,
    },
  };
}

export function buildSettings(cfg, current = {}) {
  const next = { ...current };
  if (typeof cfg.notifications?.missed_call_alert === "boolean") next.missed_call_alert = cfg.notifications.missed_call_alert;
  const fu = cfg.followups || {};
  if (Object.keys(fu).length) {
    next.followups = { ...(next.followups || {}) };
    for (const [kind, enabled] of Object.entries(fu)) next.followups[kind] = { ...(next.followups[kind] || {}), enabled };
  }
  return next;
}

// Readable temp password: three words-ish chunks, no lookalike characters.
export function generatePassword() {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const chunk = () => Array.from({ length: 4 }, () => alphabet[randomInt(alphabet.length)]).join("");
  return `${chunk()}-${chunk()}-${chunk()}`;
}
