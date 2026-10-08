// In-conversation booking — offer appointment windows from the business's
// operating hours, present them as SMS options, and parse the caller's pick.
// Soft-book only: booking_status = 'proposed' until the owner confirms.
//
// Two styles:
//   windows — "Tomorrow morning" / "Tomorrow arvo" (default for trades: a
//             tradie can't promise 1–3pm from the roof of another job)
//   slots   — exact two-hour slots, "Tomorrow 8–10am" (dental, legal)

import { localParts, localDayAfter, zonedDate, normalizeHours, formatRange } from "./time.js";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const NOON = 12 * 60;
const TRADE_INDUSTRIES = new Set(["plumbing", "electrical", "hvac", "roofing", "general"]);

export function defaultBookingStyle(industry) {
  return TRADE_INDUSTRIES.has(industry) ? "windows" : "slots";
}

function windowsForDay(day, style) {
  if (!day) return [];
  const { open, close } = day;
  if (style === "windows") {
    const out = [];
    if (NOON - open >= 60) out.push({ start: open, end: NOON, period: "am", name: "morning" });
    const arvoStart = Math.max(open, NOON);
    if (close - arvoStart >= 60) out.push({ start: arvoStart, end: close, period: "pm", name: "arvo" });
    return out;
  }
  // Two-hour slots: one from opening, one at 1pm.
  return [
    { start: open, end: Math.min(open + 120, close) },
    { start: 13 * 60, end: Math.min(15 * 60, close) },
  ]
    .filter((w) => w.start >= open && w.start < close && w.end > w.start)
    .map((w) => ({ ...w, period: w.start < NOON ? "am" : "pm", name: formatRange(w.start, w.end) }));
}

// The next `count` offerable windows (chronological), skipping closed days and
// windows that have already started. Each is JSON-safe so it can be stored on
// the lead and read back when the caller replies.
export function getAvailableSlots(business, count = 2, now = new Date(), style = "slots") {
  const hours = normalizeHours(business?.operating_hours);
  const tz = hours.timezone;

  const slots = [];
  for (let i = 0; i < 14 && slots.length < count; i++) {
    const d = localDayAfter(tz, now, i);
    for (const w of windowsForDay(hours.days[d.weekday], style)) {
      if (slots.length >= count) break;
      const start = zonedDate(tz, d.year, d.month, d.day, Math.floor(w.start / 60), w.start % 60);
      if (start.getTime() <= now.getTime()) continue;

      const dayLabel = i === 0 ? "Today" : i === 1 ? "Tomorrow" : DAY_NAMES[d.weekday];
      slots.push({
        value: String(slots.length + 1),
        label: `${dayLabel} ${w.name}`,
        dayLabel,
        windowLabel: w.name,
        period: w.period,
        style,
        startMin: w.start,
        endMin: w.end,
        iso: start.toISOString(),
      });
    }
  }
  return slots;
}

export function buildBookingStep(business, opts = {}, now = new Date()) {
  const count = Number.isFinite(opts.count) ? opts.count : 2;
  const style = opts.style || "slots";
  const slots = getAvailableSlots(business, count, now, style);
  const escapeValue = String(slots.length + 1);

  const options = slots.map((s) => ({ value: s.value, label: s.label }));
  options.push({ value: escapeValue, label: "Another time / I'll call back" });

  const prompt = (opts.prompt && String(opts.prompt).trim()) || "Want to grab the first available time?";
  const lines = [prompt];
  for (const s of slots) lines.push(`${s.value}) ${s.label}`);
  lines.push(`${escapeValue}) Another time`);

  return {
    id: "booking",
    key: "appointment",
    type: "booking",
    question: lines.join("\n"),
    invalid_text: `Please reply with a number from 1 to ${escapeValue}.`,
    options,
    slots,
    escapeValue,
  };
}

// { slot } when the caller picked a real slot, { escape: true } when they
// declined / asked for another time, or null when the reply is unparseable.
export function parseBookingReply(step, text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  const norm = raw.toUpperCase();
  const slots = step?.slots || [];

  for (const s of slots) {
    if (String(s.value).toUpperCase() === norm) return { slot: s };
  }
  if (step?.escapeValue && String(step.escapeValue).toUpperCase() === norm) return { escape: true };

  // Leading digit, e.g. "1 please", "2) tmrw".
  const m = raw.match(/^\s*(\d{1,2})(?!\d)/);
  if (m) {
    const slot = slots.find((s) => s.value === m[1]);
    if (slot) return { slot };
    if (m[1] === step?.escapeValue) return { escape: true };
  }

  const low = raw.toLowerCase();
  if (/(another|other time|later|call me|call back|callback|different|none|no thanks|not sure)/.test(low)) {
    return { escape: true };
  }

  // Soft natural language: narrow by day, then by morning/afternoon.
  let pool = slots;
  let narrowed = false;
  if (/(tomorrow|tmrw|tmw)/.test(low)) { pool = pool.filter((x) => x.dayLabel === "Tomorrow"); narrowed = true; }
  else if (/(today|tonight|\bnow\b|asap)/.test(low)) { pool = pool.filter((x) => x.dayLabel === "Today"); narrowed = true; }
  const periodOf = (x) => x.period || ((x.windowLabel || "").includes("am") ? "am" : "pm");
  if (/(morning|\bam\b)/.test(low)) { pool = pool.filter((x) => periodOf(x) === "am"); narrowed = true; }
  else if (/(afternoon|arvo|\bpm\b)/.test(low)) { pool = pool.filter((x) => periodOf(x) === "pm"); narrowed = true; }
  return narrowed && pool.length > 0 ? { slot: pool[0] } : null;
}

// Absolute description of a booked window for messages sent later, relative to
// `now`: "tomorrow arvo (12–5pm)", "today 1–3pm", "Thu 9 Oct morning (7am–12pm)".
export function describeAppointment(lead, timezone, now = new Date()) {
  if (!lead?.appointment_at) return null;
  const tz = timezone || "Australia/Sydney";
  const at = new Date(lead.appointment_at);
  const w = lead.answers?._appointment_window;

  const a = localParts(tz, at);
  const t = localParts(tz, now);
  const tomorrow = localDayAfter(tz, now, 1);
  const sameDay = (x, y) => x.year === y.year && x.month === y.month && x.day === y.day;
  let day;
  if (sameDay(a, t)) day = "today";
  else if (sameDay(a, tomorrow)) day = "tomorrow";
  else {
    day = new Intl.DateTimeFormat("en-AU", { timeZone: tz, weekday: "short", day: "numeric", month: "short" })
      .format(at).replace(",", "");
  }

  if (!w) {
    const time = new Intl.DateTimeFormat("en-AU", { timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true })
      .format(at).replace(" ", "").replace(":00", "");
    return `${day} ${time}`;
  }
  const range = formatRange(w.startMin, w.endMin);
  return w.style === "windows" ? `${day} ${w.name} (${range})` : `${day} ${range}`;
}

// Human-readable appointment for owner alerts / summaries / dashboards.
export function formatAppointment(lead, timezone = "Australia/Sydney", now = new Date()) {
  if (lead?.appointment_at && lead?.answers?._appointment_window) {
    return describeAppointment(lead, timezone, now);
  }
  const label = lead?.answers?._appointment_label;
  if (label) return label;
  if (!lead?.appointment_at) return null;
  return describeAppointment(lead, timezone, now);
}
