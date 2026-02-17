const PATIENT_TYPE_MAP = {
  A: "New patient",
  B: "Existing patient",
};

const INTENT_MAP = {
  "1": "Urgent dental pain",
  "2": "Routine check-up and clean",
  "3": "Broken tooth / filling issue",
  "4": "Cosmetic consultation",
  "5": "Other",
};

const TIMING_MAP = {
  A: "Morning",
  B: "Afternoon",
  C: "Next available",
};

export const FLOW_STEPS = [
  {
    key: "patient_type",
    question:
      "1) Are you a new or existing patient? Reply: A) New B) Existing",
    invalidMessage: "Please reply A for New or B for Existing.",
    validate: ({ text }) => ["A", "B"].includes(String(text || "").trim().toUpperCase()),
    parse: ({ text }) => {
      const val = String(text || "").trim().toUpperCase();
      return {
        patient_type_code: val,
        patient_type_label: PATIENT_TYPE_MAP[val],
      };
    },
  },
  {
    key: "intent",
    question:
      "2) What can we help with today? Reply: 1) Urgent pain 2) Check-up/clean 3) Broken tooth/filling 4) Cosmetic consult 5) Other",
    invalidMessage: "Please reply with a number from 1 to 5.",
    validate: ({ text }) => /^[1-5]$/.test(String(text || "").trim()),
    parse: ({ text }) => {
      const val = String(text || "").trim();
      return {
        intent_code: val,
        intent_label: INTENT_MAP[val] || "Other",
      };
    },
  },
  {
    key: "timing",
    question:
      "3) Preferred callback time? Reply: A) Morning B) Afternoon C) Next available",
    invalidMessage:
      "Please reply A for Morning, B for Afternoon, or C for Next available.",
    validate: ({ text }) => ["A", "B", "C"].includes(String(text || "").trim().toUpperCase()),
    parse: ({ text }) => {
      const val = String(text || "").trim().toUpperCase();
      return {
        timing_code: val,
        timing_label: TIMING_MAP[val],
      };
    },
  },
];

export function getStep(stepNumber) {
  return FLOW_STEPS[stepNumber - 1] || null;
}

export function buildIntroAndFirstQuestion(name, businessName) {
  const clinic = businessName || "your clinic";
  const firstName = String(name || "there").trim().split(" ")[0] || "there";
  return `Hi ${firstName}, this is ${clinic}. Thanks for contacting us - we'll triage you now with 3 quick questions so our team can call you faster.\n${FLOW_STEPS[0].question}`;
}

export function buildCompletionMessage({ bookingLink, businessName }) {
  const clinic = businessName || "our team";
  if (bookingLink) {
    return `Thanks, got it. ${clinic} will contact you shortly. If easier, you can book directly here: ${bookingLink}`;
  }
  return `Thanks, got it. ${clinic} will contact you shortly.`;
}

export function buildStoppedMessage(businessName) {
  const clinic = businessName || "our clinic";
  if (clinic) {
    return `No problem. You have been unsubscribed from ${clinic} messages.`;
  }
  return "No problem, you've been unsubscribed from these messages.";
}

export function isStopKeyword(text) {
  const t = String(text || "").trim().toUpperCase();
  return ["STOP", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"].includes(t);
}

function getRecommendedAction(answers = {}) {
  if (answers.intent_code === "1") {
    return "URGENT: Call this patient immediately (potential pain case).";
  }

  if (answers.intent_code === "4") {
    return "Offer cosmetic consultation slot and mention consultation fee/process.";
  }

  if (answers.patient_type_code === "A") {
    return "Offer earliest new-patient exam and onboarding details.";
  }

  return "Call back in preferred time window and complete booking.";
}

export function isUrgentDentalIntent(parsedAnswers = {}) {
  return parsedAnswers.intent_code === "1";
}

export function buildUrgentOwnerAlert(lead, business, answers = {}) {
  return [
    `URGENT DENTAL LEAD - ${business.name || "Clinic"}`,
    `Patient: ${lead.name || "Unknown"}`,
    `Phone: ${lead.phone}`,
    `Reason: ${answers.intent_label || "Urgent pain"}`,
    `Original msg: ${lead.message || "-"}`,
    "Call this patient now.",
  ].join("\n");
}

export function buildOwnerSummary(lead, business) {
  const answers = lead.answers || {};
  const lines = [
    `NEW PATIENT ENQUIRY: ${lead.name || "Unknown"}`,
    `Clinic: ${business.name || "-"}`,
    `Phone: ${lead.phone}`,
    `Email: ${lead.email || "-"}`,
    `Original msg: ${lead.message || "-"}`,
    `Patient type: ${answers.patient_type_label || "-"}`,
    `Intent: ${answers.intent_label || "-"}`,
    `Preferred callback: ${answers.timing_label || "-"}`,
    `Recommended action: ${getRecommendedAction(answers)}`,
  ];

  if (business.booking_link) {
    lines.push(`Booking link: ${business.booking_link}`);
  }

  return lines.join("\n");
}
