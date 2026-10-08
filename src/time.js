// Timezone and opening-hours helpers. Everything here works in the business's
// own timezone; the server (Vercel) runs in UTC.
//
// operating_hours comes in two shapes:
//   new    { timezone, days: { mon: ["07:00", "17:00"], …, sat: null, sun: null } }
//   legacy { enabled, timezone, open_hour, close_hour, closed_days: [0, 6] }
// A legacy row with enabled: false (or no hours at all) is treated as always
// open for "are we open right now", and as Mon–Fri 8–5 for booking windows.

export const DEFAULT_TZ = "Australia/Sydney";
const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const WEEKDAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function localParts(tz, date = new Date()) {
  const p = {};
  try {
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false, weekday: "short",
    });
    for (const part of dtf.formatToParts(date)) p[part.type] = part.value;
  } catch {
    // Invalid tz — fall back to UTC rather than the host's zone.
    return localParts("UTC", date);
  }
  let hour = Number(p.hour);
  if (hour === 24) hour = 0; // some runtimes report midnight as 24
  return {
    year: Number(p.year), month: Number(p.month), day: Number(p.day),
    hour, minute: Number(p.minute), weekday: WEEKDAY_INDEX[p.weekday] ?? date.getUTCDay(),
  };
}

function tzOffsetMinutes(tz, date) {
  const p = localParts(tz, date);
  const asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, 0);
  return Math.round((asUTC - Math.floor(date.getTime() / 60000) * 60000) / 60000);
}

// The instant at a wall-clock time in `tz`. Corrects twice so it lands right
// on both sides of a DST switch.
export function zonedDate(tz, year, month, day, hour = 0, minute = 0) {
  const guess = Date.UTC(year, month - 1, day, hour, minute, 0);
  let off = tzOffsetMinutes(tz, new Date(guess));
  let result = new Date(guess - off * 60000);
  const off2 = tzOffsetMinutes(tz, result);
  if (off2 !== off) result = new Date(guess - off2 * 60000);
  return result;
}

// Calendar day `offset` days after `date`'s local day, as { year, month, day, weekday }.
export function localDayAfter(tz, date, offset) {
  const p = localParts(tz, date);
  const noon = zonedDate(tz, p.year, p.month, p.day, 12);
  return localParts(tz, new Date(noon.getTime() + offset * 86400000));
}

function parseHHMM(value) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(value || "").trim());
  if (!m) return null;
  const mins = Number(m[1]) * 60 + Number(m[2]);
  return mins >= 0 && mins <= 24 * 60 ? mins : null;
}

// → { timezone, alwaysOpen, days: [Sun..Sat] of { open, close } in minutes, or null when closed }
export function normalizeHours(operatingHours) {
  const h = operatingHours || {};
  const timezone = h.timezone || DEFAULT_TZ;

  if (h.days && typeof h.days === "object") {
    const days = DAY_KEYS.map((key) => {
      const v = h.days[key];
      if (!Array.isArray(v) || v.length !== 2) return null;
      const open = parseHHMM(v[0]);
      const close = parseHHMM(v[1]);
      return open != null && close != null && close > open ? { open, close } : null;
    });
    return { timezone, alwaysOpen: false, days };
  }

  const open = Number.isFinite(h.open_hour) ? h.open_hour * 60 : 8 * 60;
  const close = Number.isFinite(h.close_hour) ? h.close_hour * 60 : 17 * 60;
  const closed = Array.isArray(h.closed_days) ? h.closed_days : [0, 6];
  const days = DAY_KEYS.map((_, i) => (closed.includes(i) || close <= open ? null : { open, close }));
  return { timezone, alwaysOpen: !h.enabled, days };
}

// Validates the new per-day shape from a client config. Returns an error string or null.
export function validateDayHours(days) {
  if (!days || typeof days !== "object") return "operating_hours must be an object of mon..sun";
  for (const key of DAY_KEYS) {
    const v = days[key];
    if (v === null || v === undefined) continue;
    if (!Array.isArray(v) || v.length !== 2) return `${key}: use ["07:00", "17:00"] or null`;
    const open = parseHHMM(v[0]);
    const close = parseHHMM(v[1]);
    if (open == null || close == null) return `${key}: times must be HH:MM`;
    if (close <= open) return `${key}: closing time must be after opening time`;
  }
  if (!DAY_KEYS.some((k) => Array.isArray(days[k]))) return "at least one day must be open";
  return null;
}

export function isOpenAt(business, date = new Date()) {
  const hours = normalizeHours(business?.operating_hours);
  if (hours.alwaysOpen) return true;
  const p = localParts(hours.timezone, date);
  const today = hours.days[p.weekday];
  if (!today) return false;
  const mins = p.hour * 60 + p.minute;
  return mins >= today.open && mins < today.close;
}

// The next instant at or after `date` when the business is open (within 8 days), or null.
export function nextOpenAt(business, date = new Date()) {
  if (isOpenAt(business, date)) return date;
  const hours = normalizeHours(business?.operating_hours);
  for (let i = 0; i < 8; i++) {
    const d = localDayAfter(hours.timezone, date, i);
    const day = hours.days[d.weekday];
    if (!day) continue;
    const opens = zonedDate(hours.timezone, d.year, d.month, d.day, Math.floor(day.open / 60), day.open % 60);
    if (opens > date) return opens;
  }
  return null;
}

export function businessTimezone(business) {
  return normalizeHours(business?.operating_hours).timezone;
}

// "7am", "12:30pm"
export function formatClock(mins) {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  const mer = h < 12 ? "am" : "pm";
  const hh = h % 12 === 0 ? 12 : h % 12;
  return m ? `${hh}:${String(m).padStart(2, "0")}${mer}` : `${hh}${mer}`;
}

// "7am–12pm", "1–3pm"
export function formatRange(startMins, endMins) {
  const a = formatClock(startMins);
  const b = formatClock(endMins);
  const merA = a.slice(-2);
  const merB = b.slice(-2);
  return merA === merB ? `${a.slice(0, -2)}–${b}` : `${a}–${b}`;
}
