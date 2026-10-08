// Per-business automation settings (businesses.settings, migration 012), with
// defaults for anything not set. Rows from before the migration have no
// settings column at all and get the defaults.

export const FOLLOWUP_KINDS = ["reminder", "review_request", "rebook_nudge", "unanswered_nudge"];

export const FOLLOWUP_DEFAULTS = {
  reminder: {
    enabled: true,
    body: "Reminder: {business} is booked for {when}{at_address}. Reply C to change.",
  },
  review_request: {
    enabled: true,
    body: "Thanks for having {business} out. If we did a good job, a quick Google review helps a lot: {review_link}",
  },
  rebook_nudge: {
    enabled: false, // off until Kris has seen it work
    body: "Hi {firstName}, it's been {n} months since {business} serviced your {thing}. Want us to book a check? Reply Y.",
  },
  unanswered_nudge: {
    enabled: true,
    body: "Still want a call back from {business}? Reply {options} and we'll sort it.",
  },
};

export function getSettings(business) {
  const s = business?.settings || {};
  const followups = {};
  for (const kind of FOLLOWUP_KINDS) {
    const own = s.followups?.[kind] || {};
    followups[kind] = {
      enabled: typeof own.enabled === "boolean" ? own.enabled : FOLLOWUP_DEFAULTS[kind].enabled,
      body: (typeof own.body === "string" && own.body.trim()) || FOLLOWUP_DEFAULTS[kind].body,
    };
  }
  return {
    // One-line owner alert the moment a call is missed (before the caller replies).
    missedCallAlert: s.missed_call_alert !== false,
    followups,
  };
}

// Merge a partial update from the dashboard / onboarding into stored settings.
export function mergeSettings(current, patch) {
  const next = { ...(current || {}) };
  if (typeof patch?.missed_call_alert === "boolean") next.missed_call_alert = patch.missed_call_alert;
  if (patch?.followups && typeof patch.followups === "object") {
    next.followups = { ...(next.followups || {}) };
    for (const kind of FOLLOWUP_KINDS) {
      const p = patch.followups[kind];
      if (!p || typeof p !== "object") continue;
      const merged = { ...(next.followups[kind] || {}) };
      if (typeof p.enabled === "boolean") merged.enabled = p.enabled;
      if (typeof p.body === "string") merged.body = p.body.trim().slice(0, 320) || undefined;
      next.followups[kind] = merged;
    }
  }
  return next;
}

// "{business} is booked for {when}" → filled in. Unknown placeholders are left out.
export function fillTemplate(body, vars) {
  return String(body).replace(/\{(\w+)\}/g, (_, key) => (vars[key] ?? "")).replace(/ {2,}/g, " ").trim();
}
