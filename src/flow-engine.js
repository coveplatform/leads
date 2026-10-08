// Dynamic flow engine — interprets JSON flow configs per business
// Replaces the hardcoded dental-only flow.js

import { formatAppointment } from "./booking.js";
import { formatPhoneDisplay } from "./phone.js";
import { businessTimezone } from "./time.js";

// Step kinds. Existing flows have no `type` and default to 'question'. A
// 'booking' step is injected after triage when booking is on.
export const STEP_TYPES = { QUESTION: "question", BOOKING: "booking" };
export function getStepType(step) {
  return step?.type || STEP_TYPES.QUESTION;
}

// ─── Industry Templates ───
// One question per template. A missed caller wants a human to ring back, not a
// form — so the SMS is an instant text-back plus a SINGLE high-signal question
// that (a) tells the owner whether to call NOW and (b) keeps response rates high.
// The intro is the greeting only; buildIntro appends steps[0].question.
export const INDUSTRY_TEMPLATES = {
  dental: {
    name: "Dental Clinic",
    intro: "Hi {firstName}, sorry we missed your call — this is {businessName}. One quick question so we can call you back fast:",
    completion: "Thanks, got it! {businessName} will call you back shortly.",
    completion_with_booking: "Thanks, got it! {businessName} will call you back shortly. Or book directly here: {bookingLink}",
    steps: [
      {
        id: "intent",
        key: "intent",
        question: "What do you need?\n1) Urgent pain\n2) Check-up/clean\n3) Broken tooth/filling\n4) Cosmetic\n5) Something else",
        invalid_text: "Please reply with a number from 1 to 5.",
        options: [
          { value: "1", label: "Urgent dental pain" },
          { value: "2", label: "Routine check-up and clean" },
          { value: "3", label: "Broken tooth / filling issue" },
          { value: "4", label: "Cosmetic consultation" },
          { value: "5", label: "Something else" },
        ],
        urgent_values: ["1"],
      },
    ],
  },
  plumbing: {
    name: "Plumbing",
    rebook: { months: 6, thing: "hot water system" },
    intro: "Hi {firstName}, sorry we missed your call — {businessName} here. One quick question so we can prioritise you:",
    completion: "Thanks {firstName}! {businessName} will call you back shortly.",
    completion_with_booking: "Thanks {firstName}! {businessName} will call you back shortly. Or book online: {bookingLink}",
    steps: [
      {
        id: "urgency",
        key: "urgency",
        question: "How urgent is it?\nA) Emergency — water/gas leak now\nB) Need someone today\nC) Can wait a few days",
        invalid_text: "Please reply A, B or C.",
        options: [
          { value: "A", label: "Emergency — active leak", synonyms: ["emergency", "leak", "leaking", "burst", "flood", "flooding", "gas"] },
          { value: "B", label: "Urgent — same day", synonyms: ["today", "same day", "asap"] },
          { value: "C", label: "Not urgent", synonyms: ["no rush", "can wait", "few days", "next week", "whenever"] },
        ],
        urgent_values: ["A"],
      },
    ],
  },
  electrical: {
    name: "Electrical",
    intro: "Hi {firstName}, sorry we missed your call — {businessName} here. One quick question to get you sorted fast:",
    completion: "Thanks! {businessName} will call you back shortly.",
    completion_with_booking: "Thanks! {businessName} will call you back shortly. Or book online: {bookingLink}",
    steps: [
      {
        id: "safety",
        key: "safety",
        question: "Is this a safety issue (sparking, burning smell, no power)?\nA) Yes\nB) No — general electrical work",
        invalid_text: "Please reply A or B.",
        options: [
          { value: "A", label: "Safety issue", synonyms: ["yes", "sparking", "sparks", "burning", "smoke", "no power", "shock"] },
          { value: "B", label: "General work", synonyms: ["no", "general"] },
        ],
        urgent_values: ["A"],
      },
    ],
  },
  hvac: {
    name: "HVAC / Air Conditioning",
    rebook: { months: 12, thing: "air con" },
    intro: "Hi {firstName}, sorry we missed your call — {businessName} here. One quick question to get your comfort sorted:",
    completion: "Thanks! {businessName} will call you back shortly.",
    completion_with_booking: "Thanks! {businessName} will call you back shortly. Or book here: {bookingLink}",
    steps: [
      {
        id: "issue",
        key: "issue",
        question: "What's happening?\n1) Not working at all\n2) Not heating/cooling properly\n3) Strange noise or smell\n4) New installation\n5) Service / maintenance",
        invalid_text: "Please reply with a number from 1 to 5.",
        options: [
          { value: "1", label: "Not working at all", synonyms: ["dead", "won't turn on", "wont turn on", "not working"] },
          { value: "2", label: "Not cooling/heating properly", synonyms: ["not cooling", "not heating", "warm air", "cold air"] },
          { value: "3", label: "Strange noise or smell", synonyms: ["noise", "noisy", "smell", "smells", "rattling"] },
          { value: "4", label: "New installation", synonyms: ["install", "new unit", "new system"] },
          { value: "5", label: "Service / maintenance", synonyms: ["service", "maintenance", "clean"] },
        ],
        urgent_values: ["1", "3"],
      },
    ],
  },
  roofing: {
    name: "Roofing",
    intro: "Hi {firstName}, sorry we missed your call — {businessName} here. One quick question so we can help fast:",
    completion: "Thanks {firstName}! {businessName} will call you back shortly.",
    completion_with_booking: "Thanks {firstName}! {businessName} will call you back shortly. Or book online: {bookingLink}",
    steps: [
      {
        id: "job_type",
        key: "job_type",
        question: "What do you need?\n1) Roof replacement\n2) Repair / leak\n3) New roof (new build)\n4) Inspection / quote\n5) Something else",
        invalid_text: "Please reply with a number from 1 to 5.",
        options: [
          { value: "1", label: "Roof replacement", synonyms: ["replace", "replacement", "reroof", "re-roof"] },
          { value: "2", label: "Repair / leak", synonyms: ["repair", "leak", "leaking", "storm", "damage"] },
          { value: "3", label: "New roof", synonyms: ["new build"] },
          { value: "4", label: "Inspection / quote", synonyms: ["inspection", "inspect", "quote"] },
          { value: "5", label: "Something else" },
        ],
        urgent_values: ["2"],
      },
    ],
  },
  legal: {
    name: "Legal Services",
    intro: "Hi {firstName}, sorry we missed your call — {businessName} here. One quick question so we can call you back:",
    completion: "Thanks! Someone from {businessName} will call you back shortly.",
    completion_with_booking: "Thanks! Someone from {businessName} will call you back shortly. Or book a consultation: {bookingLink}",
    steps: [
      {
        id: "urgency",
        key: "urgency",
        question: "How urgent is your matter?\nA) Very — court date or deadline soon\nB) This week\nC) Just exploring options",
        invalid_text: "Please reply A, B or C.",
        options: [
          { value: "A", label: "Very urgent — deadline" },
          { value: "B", label: "This week" },
          { value: "C", label: "Exploring options" },
        ],
        urgent_values: ["A"],
      },
    ],
  },
  general: {
    name: "General Service Business",
    intro: "Hi {firstName}, sorry we missed your call — this is {businessName}. One quick question so we can help you faster:",
    completion: "Thanks! {businessName} will call you back shortly.",
    completion_with_booking: "Thanks! {businessName} will call you back shortly. Or book online: {bookingLink}",
    steps: [
      {
        id: "urgency",
        key: "urgency",
        question: "How urgent is this?\nA) Very urgent — need help today\nB) This week\nC) Not urgent — just enquiring",
        invalid_text: "Please reply A, B or C.",
        options: [
          { value: "A", label: "Very urgent — today", synonyms: ["today", "asap", "emergency"] },
          { value: "B", label: "This week" },
          { value: "C", label: "Not urgent", synonyms: ["no rush", "enquiring", "just asking", "whenever"] },
        ],
        urgent_values: ["A"],
      },
    ],
  },
};

// ─── Core Engine Functions ───

export function getFlowConfig(business) {
  if (
    business.flow_config &&
    typeof business.flow_config === "object" &&
    Array.isArray(business.flow_config.steps) &&
    business.flow_config.steps.length > 0
  ) {
    return business.flow_config;
  }
  const industry = business.industry || "dental";
  return INDUSTRY_TEMPLATES[industry] || INDUSTRY_TEMPLATES.dental;
}

// Rebook nudge settings: flow_config.rebook overrides the industry template's.
// null when this business has none.
export function getRebookConfig(business) {
  const own = business?.flow_config?.rebook;
  const rebook = own === undefined ? INDUSTRY_TEMPLATES[business?.industry]?.rebook : own;
  if (!rebook || !Number.isFinite(Number(rebook.months)) || Number(rebook.months) < 1) return null;
  return { months: Number(rebook.months), thing: rebook.thing || "system" };
}

// "A, B or C"
export function optionList(step) {
  const values = (step?.options || []).map((o) => o.value);
  if (values.length <= 1) return values.join("");
  return `${values.slice(0, -1).join(", ")} or ${values[values.length - 1]}`;
}

export function getFlowStep(flowConfig, stepNumber) {
  return flowConfig.steps[stepNumber - 1] || null;
}

// ─── Reply matching ───
// Deterministic, in order: exact option value ("a", "2"), a leading option
// value ("A please", "1) yes"), an option label or a prefix of one
// ("emergency", "not urg"), then per-option synonyms ("burst pipe" → the
// option listing "burst"). Anything ambiguous returns null so the caller
// re-asks.

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeText(text) {
  return String(text || "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function matchOption(step, text) {
  const options = step?.options || [];
  const input = normalizeText(text);
  if (!input || options.length === 0) return null;

  // 1. Exact value
  const exact = options.find((o) => String(o.value).toLowerCase() === input);
  if (exact) return exact;

  // 2. Leading value followed by a non-alphanumeric char ("A please", "2.")
  for (const o of options) {
    const re = new RegExp(`^${escapeRegex(String(o.value))}($|[^a-z0-9])`, "i");
    if (re.test(input)) return o;
  }

  // 3. Label, or a prefix of the label (at least 3 chars to avoid noise)
  if (input.length >= 3) {
    const byLabel = options.filter((o) => {
      const label = normalizeText(o.label);
      return label && (label === input || label.startsWith(input) || input.startsWith(label));
    });
    if (byLabel.length === 1) return byLabel[0];
  }

  // 4. Synonyms as whole words/phrases anywhere in the reply. The longest
  // matching synonym wins, so "no power" beats "no"; a tie is ambiguous.
  let best = null;
  let bestLen = 0;
  let tie = false;
  for (const o of options) {
    for (const syn of o.synonyms || []) {
      const word = normalizeText(syn);
      if (!word) continue;
      if (!new RegExp(`(^|[^a-z0-9])${escapeRegex(word)}($|[^a-z0-9])`, "i").test(input)) continue;
      if (word.length > bestLen) {
        best = o; bestLen = word.length; tie = false;
      } else if (word.length === bestLen && best !== o) {
        tie = true;
      }
    }
  }
  return best && !tie ? best : null;
}

export function validateReply(step, text) {
  if (step.free_text) return String(text || "").trim().length > 0;
  return matchOption(step, text) !== null;
}

export function parseReply(step, text) {
  if (step.free_text) {
    return {
      [`${step.key}_code`]: "free_text",
      [`${step.key}_label`]: String(text || "").trim(),
    };
  }
  const option = matchOption(step, text);
  return {
    [`${step.key}_code`]: option ? option.value : String(text || "").trim().toUpperCase(),
    [`${step.key}_label`]: option ? option.label : text,
  };
}

export function isUrgentAnswer(step, text) {
  if (!step.urgent_values || step.urgent_values.length === 0) return false;
  const option = matchOption(step, text);
  if (!option) return false;
  return step.urgent_values.some((v) => String(v).toUpperCase() === String(option.value).toUpperCase());
}

export function buildIntro(flowConfig, name, businessName) {
  const firstName =
    String(name || "there").trim().split(" ")[0] || "there";
  const template =
    flowConfig.intro ||
    "Hi {firstName}, this is {businessName}. Quick questions so our team can help you faster.";
  const intro = template
    .replace(/{firstName}/g, firstName)
    .replace(/{businessName}/g, businessName || "our team");
  return `${intro}\n\n${flowConfig.steps[0].question}`;
}

export function buildCompletion(flowConfig, business, { afterHours = false } = {}) {
  let message;
  if (business.booking_link && flowConfig.completion_with_booking) {
    message = flowConfig.completion_with_booking
      .replace(/{businessName}/g, business.name || "our team")
      .replace(/{bookingLink}/g, business.booking_link);
  } else {
    const template =
      flowConfig.completion || "Thanks! {businessName} will contact you shortly.";
    message = template.replace(/{businessName}/g, business.name || "our team");
  }
  // After hours nobody's calling back tonight — set the honest expectation.
  // Every built-in template phrases the callback as "shortly"; swap it for a
  // morning callback so we don't imply an immediate response while closed.
  if (afterHours) {
    message = message.replace(/\bshortly\b/gi, "first thing in the morning");
  }
  return message;
}

export function buildSummary(lead, business, flowConfig) {
  const answers = lead.answers || {};
  const lines = [
    `NEW LEAD: ${lead.name || "Unknown"}`,
    `Business: ${business.name || "-"}`,
    `Phone: ${lead.phone}`,
  ];
  if (lead.email) lines.push(`Email: ${lead.email}`);
  if (lead.message) lines.push(`Message: ${lead.message}`);
  lines.push("---");

  for (const step of flowConfig.steps) {
    const label = answers[`${step.key}_label`];
    if (label) {
      const prettyKey = step.key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      lines.push(`${prettyKey}: ${label}`);
    }
  }

  // Booked appointment, when present.
  const apptLabel = formatAppointment(lead, businessTimezone(business));
  if (apptLabel) {
    const statusNote = lead.booking_status === "confirmed" ? "confirmed" : "proposed — confirm with caller";
    lines.push(`📅 Booked: ${apptLabel} (${statusNote})`);
  }

  const hasUrgent = flowConfig.steps.some((step) => {
    const code = answers[`${step.key}_code`];
    return step.urgent_values?.some(
      (v) => v.toUpperCase() === String(code || "").toUpperCase(),
    );
  });

  lines.push("---");
  if (apptLabel) {
    lines.push("→ Appointment booked. Confirm the time with the lead.");
  } else if (hasUrgent) {
    lines.push("→ URGENT: Call this lead immediately.");
  } else {
    lines.push("→ Call back in preferred time window.");
  }

  if (business.booking_link) {
    lines.push(`Booking: ${business.booking_link}`);
  }

  return lines.join("\n");
}

// Punchy owner SMS for a fresh booking:
//   "🔥 Booked lead — Sarah, roof replacement, Tomorrow 8–10am"
export function buildBookedAlert(lead, business, { appointmentLabel, flowConfig } = {}) {
  const answers = lead.answers || {};
  // Job descriptor = the first answered triage label.
  let descriptor = "";
  for (const step of (flowConfig?.steps || [])) {
    const label = answers[`${step.key}_label`];
    if (label) { descriptor = String(label); break; }
  }
  const lines = [
    `🔥 Booked lead — ${business.name || "your business"}`,
    `${lead.name || "Unknown"} · ${formatPhoneDisplay(lead.phone)}`,
  ];
  if (descriptor) lines.push(descriptor);
  if (appointmentLabel) lines.push(`📅 ${appointmentLabel}`);
  lines.push("Reply Y to confirm, N to decline, or a time to change.");
  return lines.join("\n");
}

// The one-liner the owner gets the moment a call is missed.
export function buildMissedCallAlert(lead) {
  return `Missed call from ${formatPhoneDisplay(lead.phone)} — we've texted them. Details to follow if they reply.`;
}

export function buildExitSummary(lead, business, lastAttempt, reason) {
  const reasonLine =
    reason === "call_requested"
      ? "→ Lead asked to be called back directly."
      : `→ Lead had trouble answering. Last reply: "${lastAttempt || "—"}"`;
  return [
    `INCOMPLETE LEAD — ${business.name || "Business"}`,
    `Name: ${lead.name || "Unknown"}`,
    `Phone: ${lead.phone}`,
    reasonLine,
    "Worth calling back.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function isStopKeyword(text) {
  const t = String(text || "").trim().toUpperCase();
  return ["STOP", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"].includes(t);
}

export function buildStoppedMessage(businessName) {
  return `No problem. You have been unsubscribed from ${businessName || "these"} messages.`;
}

