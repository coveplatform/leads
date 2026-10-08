// The SMS conversation after a lead starts: STOP, special intents, option
// matching with retries, the booking step, and the owner notification at the
// end. Called by /api/sms/inbound once it has resolved the business and lead.

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
import { buildBookingStep, parseBookingReply, formatAppointment, defaultBookingStyle } from "../booking.js";
import {
  detectSpecialIntent,
  isMeaninglessReply,
  getRetryCount,
  incrementRetryAnswers,
  MAX_RETRIES_MULTIPLE_CHOICE,
  MAX_RETRIES_FREE_TEXT,
} from "../reply-processor.js";
import {
  updateLead,
  setLeadBooking,
  saveMessage,
  createLead,
  recordOptOut,
  getLatestLeadByBusinessAndPhone,
  getLatestSentFollowup,
  getLeadById,
} from "../db.js";
import { isWithinOperatingHours, sendLeadNotifications, sendOwnerSms } from "../integrations.js";
import { formatPhoneDisplay } from "../phone.js";
import { sendSms } from "../sms.js";
import { businessTimezone } from "../time.js";
import { cancelFollowups } from "./scheduler.js";
import { getRebookConfig } from "../flow-engine.js";
import { log } from "../log.js";

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
// SMS is the punchy buildBookedAlert (ending "Reply Y to confirm…"); otherwise
// the full lead summary.
async function finalizeAndNotify({ business, lead, flowConfig, booked }) {
  let summary;
  if (booked) {
    const appointmentLabel = lead.answers?._appointment_label
      || formatAppointment(lead, businessTimezone(business));
    summary = buildBookedAlert(lead, business, { appointmentLabel, flowConfig });
  } else {
    summary = buildSummary(lead, business, flowConfig);
  }
  const urgent = !!lead.answers?.urgent_alert_sent;
  await sendLeadNotifications({ business, lead, flowConfig, summary, urgent, booked });
}

// Offer booking windows; returns false when there's nothing to offer.
async function offerBooking({ business, lead, flowConfig, answers, bodyRaw, currentStep, prompt }) {
  const bookingStep = buildBookingStep(business, {
    count: flowConfig.booking?.slots,
    prompt: prompt || flowConfig.booking?.prompt,
    style: flowConfig.booking?.style || defaultBookingStyle(business.industry),
  });
  if (bookingStep.slots.length === 0) return false;
  await setLeadBooking(lead.id, {
    answers: {
      ...answers,
      _awaiting: "booking",
      _offered_slots: bookingStep.slots,
      _booking_escape: bookingStep.escapeValue,
      _booking_question: bookingStep.question,
    },
    currentStep,
    lastInboundText: bodyRaw,
    status: "active",
  });
  await reply(business, lead, bookingStep.question);
  return true;
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
    const window = slot.startMin != null
      ? { startMin: slot.startMin, endMin: slot.endMin, period: slot.period, style: slot.style, name: slot.windowLabel }
      : null;
    const completedLead = await setLeadBooking(lead.id, {
      appointmentAt: slot.iso,
      bookingStatus: "proposed",
      status: "completed",
      finishedAt: new Date().toISOString(),
      lastInboundText: bodyRaw,
      answers: clearAwaiting({ _appointment_label: slot.label, _appointment_window: window }),
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
    await recordStop(business, lead);
    await reply(business, lead, buildStoppedMessage(business.name));
    return;
  }

  // Any reply means the "still want a call back?" nudge is no longer needed.
  await cancelFollowups(lead.id, ["unanswered_nudge"]);

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
    await sendOwnerSms(business, buildExitSummary(lead, business, bodyRaw, reason));

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
    const offered = await offerBooking({
      business, lead, flowConfig, answers: nextAnswers, bodyRaw, currentStep: lead.current_step + 1,
    });
    if (offered) return;
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

// ─── Texts from someone with no conversation in progress ───

async function recordStop(business, lead) {
  try {
    await recordOptOut(business.id, lead.phone);
  } catch (err) {
    log.error("[stop] could not record opt-out:", err.message);
  }
  await cancelFollowups(lead.id, ["unanswered_nudge", "reminder", "review_request", "rebook_nudge"]);
}

const RECENT_LEAD_DAYS = 7;

// Returns true when the text was handled (so the caller must not start a new
// lead): STOP, a reply to a reminder or rebook nudge, or a message from someone
// whose conversation finished in the last week.
export async function handleNonLeadText({ business, phone, bodyRaw }) {
  const latest = await getLatestLeadByBusinessAndPhone(business.id, phone);

  if (isStopKeyword(bodyRaw)) {
    if (latest) await recordStop(business, latest);
    else await recordOptOut(business.id, phone).catch((err) => log.error("[stop]", err.message));
    return true;
  }

  const lookup = (kinds, days) => getLatestSentFollowup(business.id, phone, kinds, days).catch((err) => {
    log.error("[followup-reply] lookup failed:", err.message);
    return null;
  });
  const word = String(bodyRaw || "").trim().toUpperCase().replace(/[.!]+$/, "");

  // "C" to a reminder (last 3 days): back into the booking step.
  const reminder = (word === "C" || word === "CHANGE") ? await lookup(["reminder"], 3) : null;
  if (reminder) {
    const lead = await getLeadById(reminder.lead_id);
    await saveMessage({ leadId: lead.id, direction: "inbound", body: bodyRaw });
    await cancelFollowups(lead.id, ["reminder"]);
    await setLeadBooking(lead.id, { bookingStatus: "none" });
    const flowConfig = resolveFlowConfig(lead, business);
    const offered = await offerBooking({
      business, lead, flowConfig, answers: lead.answers || {}, bodyRaw, currentStep: lead.current_step,
      prompt: "No worries — when suits instead?",
    });
    if (!offered) await reply(business, lead, `No worries — ${business.name || "we"}'ll call you to sort a new time.`);
    await sendOwnerSms(business, `${formatPhoneDisplay(phone)} wants to change their booking (was ${lead.answers?._appointment_label || "booked"}). ${offered ? "We've offered new times." : "Give them a call."}`);
    return true;
  }

  // "Y" to a rebook nudge (last 14 days): a new lead for the owner to call.
  const rebookNudge = /^(Y|YES|YEP|YEAH|SURE|PLEASE)$/.test(word) ? await lookup(["rebook_nudge"], 14) : null;
  if (rebookNudge) {
    const original = await getLeadById(rebookNudge.lead_id);
    const rebook = getRebookConfig(business);
    const lead = await createLead({
      businessId: business.id, name: original?.name || null, phone,
      message: `Rebook request${rebook ? ` — ${rebook.thing} check` : ""}`, source: "rebook",
    });
    await saveMessage({ leadId: lead.id, direction: "inbound", body: bodyRaw });
    await updateLead(lead.id, { status: "completed", finished_at: new Date().toISOString() });
    await reply(business, lead, `Great — ${business.name || "we"}'ll be in touch to book a time.`);
    await sendOwnerSms(business, `🔁 Rebook: ${formatPhoneDisplay(phone)} said yes to a ${rebook?.thing || "service"} check. Give them a call to book it in.`);
    return true;
  }

  // Anything else from a recent customer goes to the owner, not a new flow.
  const followup = await lookup(["reminder", "review_request", "rebook_nudge"], 3);
  const recentLead = latest && latest.status !== "stopped"
    && (Date.now() - new Date(latest.finished_at || latest.created_at)) / 86400000 <= RECENT_LEAD_DAYS;
  const target = followup ? await getLeadById(followup.lead_id) : (recentLead ? latest : null);
  if (target) {
    await saveMessage({ leadId: target.id, direction: "inbound", body: bodyRaw });
    await sendOwnerSms(business, `Text from ${formatPhoneDisplay(phone)}: "${String(bodyRaw).slice(0, 200)}"`);
    return true;
  }
  return false;
}
