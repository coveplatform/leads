// Dynamic flow engine — interprets JSON flow configs per business
// Replaces the hardcoded dental-only flow.js

// ─── Industry Templates ───
export const INDUSTRY_TEMPLATES = {
  dental: {
    name: "Dental Clinic",
    intro: "Hi {firstName}, this is {businessName}. Thanks for contacting us — 3 quick Qs so our team can call you faster.",
    completion: "Thanks, got it! {businessName} will contact you shortly.",
    completion_with_booking: "Thanks, got it! {businessName} will contact you shortly. Book directly here: {bookingLink}",
    steps: [
      {
        id: "patient_type",
        key: "patient_type",
        question: "Are you a new or existing patient?\nA) New\nB) Existing",
        invalid_text: "Please reply A for New or B for Existing.",
        options: [
          { value: "A", label: "New patient" },
          { value: "B", label: "Existing patient" },
        ],
        urgent_values: [],
      },
      {
        id: "intent",
        key: "intent",
        question: "What can we help with today?\n1) Urgent pain\n2) Check-up/clean\n3) Broken tooth/filling\n4) Cosmetic consult\n5) Other",
        invalid_text: "Please reply with a number from 1 to 5.",
        options: [
          { value: "1", label: "Urgent dental pain" },
          { value: "2", label: "Routine check-up and clean" },
          { value: "3", label: "Broken tooth / filling issue" },
          { value: "4", label: "Cosmetic consultation" },
          { value: "5", label: "Other" },
        ],
        urgent_values: ["1"],
      },
      {
        id: "timing",
        key: "timing",
        question: "Preferred callback time?\nA) Morning\nB) Afternoon\nC) Next available",
        invalid_text: "Please reply A for Morning, B for Afternoon, or C for Next available.",
        options: [
          { value: "A", label: "Morning" },
          { value: "B", label: "Afternoon" },
          { value: "C", label: "Next available" },
        ],
        urgent_values: [],
      },
    ],
  },
  plumbing: {
    name: "Plumbing",
    intro: "Hi {firstName}, this is {businessName}. Quick questions so we can prioritise your job.",
    completion: "Thanks {firstName}! {businessName} will be in touch shortly.",
    completion_with_booking: "Thanks {firstName}! {businessName} will be in touch shortly. Or book online: {bookingLink}",
    steps: [
      {
        id: "urgency",
        key: "urgency",
        question: "How urgent is this?\nA) Emergency — water/gas leak now\nB) Urgent — need someone today\nC) Can wait a few days",
        invalid_text: "Please reply A, B or C.",
        options: [
          { value: "A", label: "Emergency — active leak" },
          { value: "B", label: "Urgent — same day" },
          { value: "C", label: "Not urgent" },
        ],
        urgent_values: ["A"],
      },
      {
        id: "job_type",
        key: "job_type",
        question: "What type of job?\n1) Blocked drain\n2) Leak / burst pipe\n3) Hot water system\n4) Toilet / tap repair\n5) Other",
        invalid_text: "Please reply with a number from 1 to 5.",
        options: [
          { value: "1", label: "Blocked drain" },
          { value: "2", label: "Leak / burst pipe" },
          { value: "3", label: "Hot water system" },
          { value: "4", label: "Toilet / tap repair" },
          { value: "5", label: "Other" },
        ],
        urgent_values: ["2"],
      },
      {
        id: "availability",
        key: "availability",
        question: "When are you available?\nA) Now — I'm home\nB) This morning\nC) This afternoon\nD) Tomorrow",
        invalid_text: "Please reply A, B, C or D.",
        options: [
          { value: "A", label: "Now — home" },
          { value: "B", label: "This morning" },
          { value: "C", label: "This afternoon" },
          { value: "D", label: "Tomorrow" },
        ],
        urgent_values: [],
      },
    ],
  },
  electrical: {
    name: "Electrical",
    intro: "Hi {firstName}, this is {businessName}. Quick Qs to get you sorted fast.",
    completion: "Thanks! {businessName} will be in touch shortly.",
    completion_with_booking: "Thanks! {businessName} will be in touch shortly. Or book online: {bookingLink}",
    steps: [
      {
        id: "safety",
        key: "safety",
        question: "Is this a safety issue?\nA) Yes — sparking, burning smell, no power\nB) No — general electrical work",
        invalid_text: "Please reply A or B.",
        options: [
          { value: "A", label: "Safety issue" },
          { value: "B", label: "General work" },
        ],
        urgent_values: ["A"],
      },
      {
        id: "job_type",
        key: "job_type",
        question: "What do you need?\n1) Power outage / fault\n2) New lights or power points\n3) Switchboard / safety switch\n4) Fan installation\n5) Other",
        invalid_text: "Please reply with a number from 1 to 5.",
        options: [
          { value: "1", label: "Power outage / fault" },
          { value: "2", label: "New lights or power points" },
          { value: "3", label: "Switchboard / safety switch" },
          { value: "4", label: "Fan installation" },
          { value: "5", label: "Other" },
        ],
        urgent_values: ["1"],
      },
      {
        id: "timing",
        key: "timing",
        question: "Preferred time for a callback?\nA) ASAP\nB) Morning\nC) Afternoon",
        invalid_text: "Please reply A, B or C.",
        options: [
          { value: "A", label: "ASAP" },
          { value: "B", label: "Morning" },
          { value: "C", label: "Afternoon" },
        ],
        urgent_values: [],
      },
    ],
  },
  hvac: {
    name: "HVAC / Air Conditioning",
    intro: "Hi {firstName}, this is {businessName}. A few quick questions to get your comfort sorted.",
    completion: "Thanks! {businessName} will follow up shortly.",
    completion_with_booking: "Thanks! {businessName} will follow up shortly. Or book here: {bookingLink}",
    steps: [
      {
        id: "system_type",
        key: "system_type",
        question: "What system do you need help with?\nA) Air conditioning\nB) Heating\nC) Both / ducted\nD) Not sure",
        invalid_text: "Please reply A, B, C or D.",
        options: [
          { value: "A", label: "Air conditioning" },
          { value: "B", label: "Heating" },
          { value: "C", label: "Both / ducted" },
          { value: "D", label: "Not sure" },
        ],
        urgent_values: [],
      },
      {
        id: "issue",
        key: "issue",
        question: "What's the issue?\n1) Not working at all\n2) Not cooling/heating properly\n3) Strange noise or smell\n4) New installation\n5) Service / maintenance",
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
      {
        id: "timing",
        key: "timing",
        question: "When works best for a callback?\nA) ASAP\nB) Morning\nC) Afternoon\nD) This week sometime",
        invalid_text: "Please reply A, B, C or D.",
        options: [
          { value: "A", label: "ASAP" },
          { value: "B", label: "Morning" },
          { value: "C", label: "Afternoon" },
          { value: "D", label: "This week" },
        ],
        urgent_values: [],
      },
    ],
  },
  legal: {
    name: "Legal Services",
    intro: "Hi {firstName}, thanks for contacting {businessName}. A few quick questions so we can connect you with the right person.",
    completion: "Thanks! Someone from {businessName} will be in touch shortly.",
    completion_with_booking: "Thanks! Someone from {businessName} will be in touch shortly. Or book a consultation: {bookingLink}",
    steps: [
      {
        id: "matter_type",
        key: "matter_type",
        question: "What type of matter?\n1) Family / divorce\n2) Property / conveyancing\n3) Wills & estates\n4) Employment\n5) Business / commercial\n6) Other",
        invalid_text: "Please reply with a number from 1 to 6.",
        options: [
          { value: "1", label: "Family / divorce" },
          { value: "2", label: "Property / conveyancing" },
          { value: "3", label: "Wills & estates" },
          { value: "4", label: "Employment" },
          { value: "5", label: "Business / commercial" },
          { value: "6", label: "Other" },
        ],
        urgent_values: [],
      },
      {
        id: "urgency",
        key: "urgency",
        question: "How urgent is this?\nA) Very — court date or deadline soon\nB) Moderate — need advice this week\nC) Just exploring options",
        invalid_text: "Please reply A, B or C.",
        options: [
          { value: "A", label: "Very urgent — deadline" },
          { value: "B", label: "Moderate — this week" },
          { value: "C", label: "Exploring options" },
        ],
        urgent_values: ["A"],
      },
      {
        id: "consult_pref",
        key: "consult_pref",
        question: "Preferred consultation type?\nA) Phone call\nB) In-person meeting\nC) Video call",
        invalid_text: "Please reply A, B or C.",
        options: [
          { value: "A", label: "Phone call" },
          { value: "B", label: "In-person" },
          { value: "C", label: "Video call" },
        ],
        urgent_values: [],
      },
    ],
  },
  general: {
    name: "General Service Business",
    intro: "Hi {firstName}, this is {businessName}. Quick questions so we can help you faster.",
    completion: "Thanks! {businessName} will be in touch shortly.",
    completion_with_booking: "Thanks! {businessName} will be in touch shortly. Or book online: {bookingLink}",
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
      {
        id: "service_type",
        key: "service_type",
        question: "What service do you need? (Reply with a short description)",
        invalid_text: null,
        options: [],
        urgent_values: [],
        free_text: true,
      },
      {
        id: "timing",
        key: "timing",
        question: "Best time for a callback?\nA) ASAP\nB) Morning\nC) Afternoon\nD) Tomorrow",
        invalid_text: "Please reply A, B, C or D.",
        options: [
          { value: "A", label: "ASAP" },
          { value: "B", label: "Morning" },
          { value: "C", label: "Afternoon" },
          { value: "D", label: "Tomorrow" },
        ],
        urgent_values: [],
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

  const hasUrgent = flowConfig.steps.some((step) => {
    const code = answers[`${step.key}_code`];
    return step.urgent_values?.some(
      (v) => v.toUpperCase() === String(code || "").toUpperCase(),
    );
  });

  lines.push("---");
  if (hasUrgent) {
    lines.push("→ URGENT: Call this lead immediately.");
  } else {
    lines.push("→ Call back in preferred time window.");
  }

  if (business.booking_link) {
    lines.push(`Booking: ${business.booking_link}`);
  }

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
