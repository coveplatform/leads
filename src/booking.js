// In-conversation booking — generate offerable appointment windows from the
// business's existing operating_hours JSONB, present them as SMS options, and
// parse the caller's pick. No external calendar required for the MVP:
// "soft-book + owner confirms" (booking_status = 'proposed').

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// ─── Timezone helpers (no external date lib in this stack) ───

function localParts(tz, date) {
  let p = {};
  try {
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
      hour12: false, weekday: "short",
    });
    for (const part of dtf.formatToParts(date)) p[part.type] = part.value;
  } catch {
    // Invalid tz — fall back to the host's local time.
    return {
      year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate(),
      hour: date.getHours(), minute: date.getMinutes(), weekday: date.getDay(),
    };
  }
  const dayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  let hour = Number(p.hour);
  if (hour === 24) hour = 0; // some runtimes report midnight as 24
  return {
    year: Number(p.year), month: Number(p.month), day: Number(p.day),
    hour, minute: Number(p.minute), weekday: dayMap[p.weekday] ?? date.getDay(),
  };
}

function tzOffsetMinutes(tz, date) {
  const p = localParts(tz, date);
  const asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, 0);
  return Math.round((asUTC - date.getTime()) / 60000);
}

// Build a Date for a given wall-clock time in `tz`. One-pass offset correction —
// accurate except within the single ambiguous hour of a DST switch (fine for a
// soft-book the owner confirms).
function zonedDate(tz, year, month, day, hour) {
  const guess = Date.UTC(year, month - 1, day, hour, 0, 0);
  const off = tzOffsetMinutes(tz, new Date(guess));
  return new Date(guess - off * 60000);
}

// ─── Hour formatting ───

function hour12(h) {
  const mer = h < 12 || h >= 24 ? "am" : "pm";
  let hh = h % 12;
  if (hh === 0) hh = 12;
  return { hh, mer };
}

function formatWindow(start, end) {
  const a = hour12(start), b = hour12(end);
  return a.mer === b.mer
    ? `${a.hh}–${b.hh}${b.mer}`
    : `${a.hh}${a.mer}–${b.hh}${b.mer}`;
}

function resolveHours(business) {
  const h = business?.operating_hours || {};
  return {
    timezone: h.timezone || "Australia/Sydney",
    open: Number.isFinite(h.open_hour) ? h.open_hour : 8,
    close: Number.isFinite(h.close_hour) ? h.close_hour : 17,
    closedDays: Array.isArray(h.closed_days) ? h.closed_days : [0, 6], // Sun/Sat
  };
}

// ─── Slot generation ───
// Returns the next `count` offerable windows (chronological), skipping closed
// days and past windows. Each slot is JSON-safe so it can be persisted on the
// lead and read back when the caller replies.
export function getAvailableSlots(business, count = 2, now = new Date()) {
  const { timezone, open, close, closedDays } = resolveHours(business);
  const today = localParts(timezone, now);

  // Two windows per day: a morning block from open, an afternoon block at 1pm.
  const windows = [
    { start: open, end: Math.min(open + 2, close) },
    { start: 13, end: Math.min(15, close) },
  ].filter((w) => w.start >= open && w.start < close && w.end > w.start);

  // Anchor for day iteration: noon today (avoids DST edges when adding days).
  const anchor = zonedDate(timezone, today.year, today.month, today.day, 12);

  const slots = [];
  for (let i = 0; i < 14 && slots.length < count; i++) {
    const dayDate = new Date(anchor.getTime() + i * 86400000);
    const dp = localParts(timezone, dayDate);
    if (closedDays.includes(dp.weekday)) continue;

    for (const w of windows) {
      if (slots.length >= count) break;
      // For today, only offer windows that start later than the current hour.
      if (i === 0 && w.start <= today.hour) continue;
      const start = zonedDate(timezone, dp.year, dp.month, dp.day, w.start);
      if (start.getTime() <= now.getTime()) continue;

      const dayLabel = i === 0 ? "Today" : i === 1 ? "Tomorrow" : DAY_NAMES[dp.weekday];
      const windowLabel = formatWindow(w.start, w.end);
      slots.push({
        value: String(slots.length + 1),
        label: `${dayLabel} ${windowLabel}`,
        dayLabel,
        windowLabel,
        startHour: w.start,
        endHour: w.end,
        iso: start.toISOString(),
      });
    }
  }
  return slots;
}

// ─── Booking step (presented via the existing options mechanism) ───
export function buildBookingStep(business, opts = {}, now = new Date()) {
  const count = Number.isFinite(opts.count) ? opts.count : 2;
  const slots = getAvailableSlots(business, count, now);
  const escapeValue = String(slots.length + 1);

  const options = slots.map((s) => ({ value: s.value, label: s.label }));
  options.push({ value: escapeValue, label: "Another time / I'll call back" });

  const prompt = (opts.prompt && String(opts.prompt).trim()) || "Want to grab the first available slot?";
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

// Returns { slot } when the caller picked a real slot, { escape: true } when
// they declined / asked for another time, or null when the reply is unparseable.
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
  const m = raw.match(/^\s*(\d{1,2})/);
  if (m) {
    const slot = slots.find((s) => s.value === m[1]);
    if (slot) return { slot };
    if (m[1] === step?.escapeValue) return { escape: true };
  }

  const low = raw.toLowerCase();
  if (/(another|other time|later|call me|call back|callback|different|none|no thanks|not sure)/.test(low)) {
    return { escape: true };
  }
  // Soft natural-language matches.
  if (/(morning|\bam\b)/.test(low)) {
    const s = slots.find((x) => (x.windowLabel || "").includes("am"));
    if (s) return { slot: s };
  }
  if (/(afternoon|arvo|\bpm\b)/.test(low)) {
    const s = slots.find((x) => (x.windowLabel || "").includes("pm"));
    if (s) return { slot: s };
  }
  if (/(tomorrow|tmrw|tmw)/.test(low)) {
    const s = slots.find((x) => /tomorrow/i.test(x.dayLabel));
    if (s) return { slot: s };
  }
  if (/today|now|asap/.test(low)) {
    const s = slots.find((x) => /today/i.test(x.dayLabel));
    if (s) return { slot: s };
  }
  return null;
}

// Human-readable appointment for owner alerts / summaries / dashboards.
export function formatAppointment(lead, timezone = "Australia/Sydney") {
  const label = lead?.answers?._appointment_label;
  if (label) return label;
  const iso = lead?.appointment_at;
  if (!iso) return null;
  try {
    return new Intl.DateTimeFormat("en-AU", {
      timeZone: timezone, weekday: "short", day: "numeric", month: "short",
      hour: "numeric", hour12: true,
    }).format(new Date(iso));
  } catch {
    return String(iso);
  }
}
