// Dynamic flow engine — interprets JSON flow configs per business
// Replaces the hardcoded dental-only flow.js

import { formatAppointment } from "./booking.js";
import { fmtRange } from "./quote.js";

// Step kinds. Existing flows have no `type` and default to 'question', so they
// are unchanged. 'booking' and 'quote' steps are injected after triage.
export const STEP_TYPES = { QUESTION: "question", BOOKING: "booking", QUOTE: "quote" };
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
          { value: "A", label: "Emergency — active leak" },
          { value: "B", label: "Urgent — same day" },
          { value: "C", label: "Not urgent" },
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
          { value: "A", label: "Safety issue" },
          { value: "B", label: "General work" },
        ],
        urgent_values: ["A"],
      },
    ],
  },
  hvac: {
    name: "HVAC / Air Conditioning",
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
          { value: "1", label: "Not working at all" },
          { value: "2", label: "Not cooling/heating properly" },
          { value: "3", label: "Strange noise or smell" },
          { value: "4", label: "New installation" },
          { value: "5", label: "Service / maintenance" },
        ],
        urgent_values: ["1", "3"],
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
          { value: "A", label: "Very urgent — today" },
          { value: "B", label: "This week" },
          { value: "C", label: "Not urgent" },
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

export function getFlowStep(flowConfig, stepNumber) {
  return flowConfig.steps[stepNumber - 1] || null;
}

export function validateReply(step, text) {
  if (step.free_text) return String(text || "").trim().length > 0;
  const normalized = String(text || "").trim().toUpperCase();
  if (step.options.some((opt) => opt.value.toUpperCase() === normalized)) return true;
  // Fuzzy fallback: match against option labels
  if (fuzzyMatchReply(step, text)) return true;
  return false;
}

export function fuzzyMatchReply(step, text) {
  if (!text || !step.options?.length) return null;
  const input = String(text).trim().toLowerCase();
  if (input.length < 2) return null;

  // Try exact label match first
  for (const opt of step.options) {
    if (opt.label && opt.label.toLowerCase() === input) return opt.value;
  }

  // Try keyword containment: if user's text contains the full label or vice versa
  for (const opt of step.options) {
    if (!opt.label) continue;
    const label = opt.label.toLowerCase();
    // User typed "emergency" and label is "emergency — today"
    if (label.includes(input) || input.includes(label)) return opt.value;
    // Check individual words: "emergency" matches label containing "emergency"
    const labelWords = label.split(/[\s\-—,\/]+/).filter(w => w.length > 2);
    const inputWords = input.split(/[\s\-—,\/]+/).filter(w => w.length > 2);
    for (const iw of inputWords) {
      for (const lw of labelWords) {
        if (lw.startsWith(iw) || iw.startsWith(lw)) return opt.value;
      }
    }
  }

  return null;
}

export function parseReply(step, text) {
  if (step.free_text) {
    return {
      [`${step.key}_code`]: "free_text",
      [`${step.key}_label`]: String(text || "").trim(),
    };
  }
  const normalized = String(text || "").trim().toUpperCase();
  // Try exact value match
  let option = step.options.find(
    (opt) => opt.value.toUpperCase() === normalized,
  );
  // Try fuzzy label match
  if (!option) {
    const fuzzyVal = fuzzyMatchReply(step, text);
    if (fuzzyVal) {
      option = step.options.find((opt) => opt.value === fuzzyVal);
    }
  }
  return {
    [`${step.key}_code`]: option ? option.value : normalized,
    [`${step.key}_label`]: option ? option.label : text,
  };
}

export function isUrgentAnswer(step, text) {
  if (!step.urgent_values || step.urgent_values.length === 0) return false;
  const normalized = String(text || "").trim().toUpperCase();
  // Direct match
  if (step.urgent_values.some((v) => v.toUpperCase() === normalized)) return true;
  // Fuzzy match: check if fuzzy-resolved value is an urgent value
  const fuzzyVal = fuzzyMatchReply(step, text);
  if (fuzzyVal && step.urgent_values.some((v) => v.toUpperCase() === fuzzyVal.toUpperCase())) return true;
  return false;
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

export function buildCompletion(flowConfig, business) {
  if (business.booking_link && flowConfig.completion_with_booking) {
    return flowConfig.completion_with_booking
      .replace(/{businessName}/g, business.name || "our team")
      .replace(/{bookingLink}/g, business.booking_link);
  }
  const template =
    flowConfig.completion || "Thanks! {businessName} will contact you shortly.";
  return template.replace(/{businessName}/g, business.name || "our team");
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

  // Quote range (instant-quote toggle) and booked appointment, when present.
  if (lead.quote_low != null && lead.quote_high != null) {
    lines.push(`Est. quote: ${fmtRange({ low: lead.quote_low, high: lead.quote_high })} (estimate only)`);
  }
  const apptLabel = formatAppointment(lead, business.operating_hours?.timezone);
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
//   "🔥 Booked lead — Sarah, roof replacement, Tomorrow 8–10am, est. ~$16k–$22k"
export function buildBookedAlert(lead, business, { appointmentLabel, quote, flowConfig } = {}) {
  const answers = lead.answers || {};
  // Job descriptor = the first answered triage label.
  let descriptor = "";
  for (const step of (flowConfig?.steps || [])) {
    const label = answers[`${step.key}_label`];
    if (label) { descriptor = String(label); break; }
  }
  const lines = [
    `🔥 Booked lead — ${business.name || "your business"}`,
    `${lead.name || "Unknown"} · ${lead.phone}`,
  ];
  if (descriptor) lines.push(descriptor);
  if (appointmentLabel) lines.push(`📅 ${appointmentLabel}`);
  if (quote) lines.push(`Est. ${fmtRange(quote)} (estimate only)`);
  lines.push("→ Confirm the time with them.");
  return lines.join("\n");
}

export function buildUrgentAlert(lead, business, stepKey, answerLabel) {
  return [
    `URGENT LEAD — ${business.name || "Business"}`,
    `Name: ${lead.name || "Unknown"}`,
    `Phone: ${lead.phone}`,
    `Reason: ${answerLabel}`,
    lead.message ? `Message: ${lead.message}` : null,
    "→ Call this lead NOW.",
  ]
    .filter(Boolean)
    .join("\n");
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

export function getIndustryList() {
  return Object.entries(INDUSTRY_TEMPLATES).map(([key, tmpl]) => ({
    id: key,
    name: tmpl.name,
    stepCount: tmpl.steps.length,
  }));
}
