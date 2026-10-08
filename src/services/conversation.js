// The SMS conversation after a lead starts: STOP, special intents, option
// matching with retries, the booking step, and the owner notification at the
// end. Called by /api/sms/inbound once it has resolved the business and lead.

import { config } from "../config.js";
import {
  getFlowConfig,
  getFlowStep,
  validateReply,
  parseReply,
  isUrgentAnswer,
  buildCompletion,
  buildSummary,
  buildExitSummary,
  buildBookedAlert,
  isStopKeyword,
  buildStoppedMessage,
} from "../flow-engine.js";
import { buildBookingStep, parseBookingReply, formatAppointment } from "../booking.js";
import {
  detectSpecialIntent,
  isMeaninglessReply,
  getRetryCount,
  incrementRetryAnswers,
  MAX_RETRIES_MULTIPLE_CHOICE,
  MAX_RETRIES_FREE_TEXT,
} from "../reply-processor.js";
import { updateLead, setLeadBooking, saveMessage } from "../db.js";
import { isWithinOperatingHours, sendLeadNotifications } from "../integrations.js";
import { normalizePhone } from "../phone.js";
import { sendSms } from "../sms.js";

// Per-lead flow_config (stored in answers when a lead was started with a
// one-off flow) takes precedence over the business flow.
export function resolveFlowConfig(lead, business) {
  const stored = lead?.answers?._flow_config;
  if (stored && Array.isArray(stored.steps) && stored.steps.length > 0) return stored;
  return getFlowConfig(business);
}

async function reply(business, lead, body) {
  await sendSms({ from: business.twilio_from_number, to: lead.phone, body });
  await saveMessage({ leadId: lead.id, direction: "outbound", body });
}

// Notify owner/CRM once the conversation finishes. For a fresh booking the owner
// SMS is the punchy buildBookedAlert; otherwise the full lead summary.
async function finalizeAndNotify({ business, lead, flowConfig, booked }) {
  let summary;
  if (booked) {
    const appointmentLabel = lead.answers?._appointment_label
      || formatAppointment(lead, business.operating_hours?.timezone);
    summary = buildBookedAlert(lead, business, { appointmentLabel, flowConfig });
  } else {
    summary = buildSummary(lead, business, flowConfig);
  }
  await sendLeadNotifications({
    business, lead, flowConfig, summary,
    sendSmsFn: sendSms, normalizePhoneFn: normalizePhone, defaultCountryCode: config.defaultCountryCode,
  });
}

// The caller's reply to the in-conversation booking offer.
async function handleBookingReply({ business, lead, flowConfig, bodyRaw }) {
  const slots = lead.answers?._offered_slots || [];
  const escapeValue = lead.answers?._booking_escape || String(slots.length + 1);
  const parsed = parseBookingReply({ slots, escapeValue }, bodyRaw);

  const clearAwaiting = (extra = {}) => ({ ...(lead.answers || {}), _awaiting: null, ...extra });
  const finishExit = async (msg) => {
    const completedLead = await setLeadBooking(lead.id, {
      bookingStatus: "none",
      status: "completed",
      finishedAt: new Date().toISOString(),
      lastInboundText: bodyRaw,
      answers: clearAwaiting(),
    });
    await reply(business, lead, msg);
    await finalizeAndNotify({ business, lead: completedLead, flowConfig, booked: false });
  };

  // Declined / "call me" → graceful exit, owner still notified.
  if (parsed?.escape || detectSpecialIntent(bodyRaw) === "call_me") {
    return finishExit(`No worries — ${business.name || "we"}'ll call to sort a time that suits.`);
  }

  // Picked a slot → soft-book (owner confirms).
  if (parsed?.slot) {
    const slot = parsed.slot;
    const completedLead = await setLeadBooking(lead.id, {
      appointmentAt: slot.iso,
      bookingStatus: "proposed",
      status: "completed",
      finishedAt: new Date().toISOString(),
      lastInboundText: bodyRaw,
      answers: clearAwaiting({ _appointment_label: slot.label }),
    });
    await reply(business, lead, `Booked ✅ ${slot.label}. ${business.name || "We"}'ll confirm shortly — reply here if you need to change it.`);
    await finalizeAndNotify({ business, lead: completedLead, flowConfig, booked: true });
    return;
  }

  // Unparseable → re-offer the same slots, then give up gracefully.
  const retryCount = getRetryCount(lead.answers, lead.current_step);
  if (retryCount >= MAX_RETRIES_MULTIPLE_CHOICE) {
    return finishExit(`No worries — ${business.name || "we"}'ll call you to book a time.`);
  }
  await setLeadBooking(lead.id, {
    answers: incrementRetryAnswers(lead.answers, lead.current_step),
    lastInboundText: bodyRaw,
  });
  await reply(business, lead, `Sorry, didn't catch that.\n\n${lead.answers?._booking_question || "Reply with the number of a slot, or say 'another time'."}`);
}

// Handle one inbound SMS for an active lead (already saved to messages).
export async function handleLeadReply({ business, lead, bodyRaw }) {
  // ─── STOP keyword ───
  if (isStopKeyword(bodyRaw)) {
    await updateLead(lead.id, { status: "stopped", last_inbound_text: bodyRaw, finished_at: new Date().toISOString() });
    await reply(business, lead, buildStoppedMessage(business.name));
    return;
  }

  const flowConfig = resolveFlowConfig(lead, business);

  // ─── Booking step reply (injected after triage) ───
  // When the lead is mid-booking, current_step points past the real steps, so
  // route here before getFlowStep (which would return null).
  if (lead.answers?._awaiting === "booking") {
    await handleBookingReply({ business, lead, flowConfig, bodyRaw });
    return;
  }

  const step = getFlowStep(flowConfig, lead.current_step);
  if (!step) return;

  // ─── Graceful exit (skip remaining questions, notify owner) ───
  const gracefulExit = async (reason) => {
    await reply(business, lead, `No worries — someone from ${business.name || "the team"} will call you back shortly.`);

    if (business.owner_notify_phone) {
      const ownerPhone = normalizePhone(business.owner_notify_phone, config.defaultCountryCode);
      const alert = buildExitSummary(lead, business, bodyRaw, reason);
      await sendSms({ from: business.twilio_from_number, to: ownerPhone, body: alert });
      await saveMessage({ leadId: lead.id, direction: "outbound", body: alert });
    }

    await updateLead(lead.id, {
      status: "completed",
      last_inbound_text: bodyRaw,
      finished_at: new Date().toISOString(),
      answers: { ...(lead.answers || {}), _exit_reason: reason, _last_attempt: bodyRaw },
    });
  };

  // ─── Special intents ───
  const intent = detectSpecialIntent(bodyRaw);

  if (intent === "call_me") return gracefulExit("call_requested");

  if (intent === "confused") {
    return reply(business, lead, `This is ${business.name || "a local business"} — you missed a call from us earlier. We're just checking in.\n\n${step.question}`);
  }

  if (intent === "price_question") {
    return reply(business, lead, `Great question — we'll cover that when we call you. First:\n\n${step.question}`);
  }

  // ─── Validate reply ───
  const valid = validateReply(step, bodyRaw);

  // Free text: re-prompt once if the reply isn't a real answer, then accept it.
  if (valid && step.free_text && isMeaninglessReply(bodyRaw)) {
    if (getRetryCount(lead.answers, lead.current_step) < MAX_RETRIES_FREE_TEXT) {
      await updateLead(lead.id, { answers: incrementRetryAnswers(lead.answers, lead.current_step) });
      return reply(business, lead, "Just a quick description is fine — what do you need help with?");
    }
  }

  // Options: re-ask, then graceful exit after too many misses.
  if (!valid) {
    if (getRetryCount(lead.answers, lead.current_step) >= MAX_RETRIES_MULTIPLE_CHOICE) {
      return gracefulExit("max_retries");
    }
    await updateLead(lead.id, { answers: incrementRetryAnswers(lead.answers, lead.current_step) });
    return reply(business, lead, step.invalid_text ? `${step.invalid_text}\n\n${step.question}` : step.question);
  }

  // ─── Valid reply — parse and advance ───
  const nextAnswers = { ...(lead.answers || {}), ...parseReply(step, bodyRaw) };

  // Track urgent answers — the completion summary flags them with "→ URGENT: Call this lead immediately."
  if (isUrgentAnswer(step, bodyRaw)) {
    nextAnswers.urgent_alert_sent = true;
  }

  const isFinalStep = lead.current_step >= flowConfig.steps.length;

  if (!isFinalStep) {
    const nextStepNumber = lead.current_step + 1;
    const nextStep = getFlowStep(flowConfig, nextStepNumber);
    await updateLead(lead.id, { answers: nextAnswers, last_inbound_text: bodyRaw, current_step: nextStepNumber });
    return reply(business, lead, nextStep.question);
  }

  // Offer booking windows in-conversation when booking is on and we're open.
  if (flowConfig.booking?.enabled && isWithinOperatingHours(business)) {
    const bookingStep = buildBookingStep(business, {
      count: flowConfig.booking.slots,
      prompt: flowConfig.booking.prompt,
    });
    if (bookingStep.slots.length > 0) {
      await setLeadBooking(lead.id, {
        answers: {
          ...nextAnswers,
          _awaiting: "booking",
          _offered_slots: bookingStep.slots,
          _booking_escape: bookingStep.escapeValue,
          _booking_question: bookingStep.question,
        },
        currentStep: lead.current_step + 1,
        lastInboundText: bodyRaw,
      });
      return reply(business, lead, bookingStep.question);
    }
  }

  // No booking (off, closed, or no slots) → finish now.
  const completedLead = await updateLead(lead.id, {
    answers: nextAnswers,
    last_inbound_text: bodyRaw,
    current_step: lead.current_step + 1,
    status: "completed",
    finished_at: new Date().toISOString(),
  });
  await reply(business, lead, buildCompletion(flowConfig, business, { afterHours: !isWithinOperatingHours(business) }));
  await finalizeAndNotify({ business, lead: completedLead, flowConfig, booked: false });
}
