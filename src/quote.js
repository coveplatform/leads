// Instant-quote engine (toggle / upsell) — ports Plot's CalcSpec idea
// (build/calculators.ts): an inputs list + a compute that returns
// { value, unit, breakdown }, here extended to a {low, high} RANGE.
//
// Two modes, both returning a range with an "estimate only" disclaimer:
//   matrix  — option code → price band   (service-call trades)
//   formula — numeric inputs → band      (roofing, HVAC … via quote-formula.js)
//
// Per-business rates are the source of truth. When rates are missing (e.g. the
// public demo) we derive a sane band from businesses.avg_job_value so a quote
// still renders.

import { validFormula, evalFormula } from "./quote-formula.js";

// Validate a stored/owner-supplied quote_spec before it's persisted or run.
// Enforces the formula whitelist guard (ported from Plot) so an AI- or
// owner-authored formula can never smuggle in code. Returns { ok, reason }.
export function validateQuoteSpec(quoteSpec) {
  if (quoteSpec == null) return { ok: true };
  if (typeof quoteSpec !== "object") return { ok: false, reason: "spec must be an object" };
  if (!quoteSpec.enabled) return { ok: true }; // disabled — nothing to run

  const spec = resolveSpec(quoteSpec);
  if (!spec) return { ok: false, reason: "unknown trade and no custom spec" };

  if (spec.mode === "formula") {
    let allowed;
    if (typeof spec.vars === "function") {
      try { allowed = Object.keys(spec.vars({}, spec.rates || {})); } catch { allowed = []; }
    } else {
      allowed = [
        ...(spec.inputs || []).filter((i) => i.type === "number").map((i) => i.key),
        ...Object.keys(spec.rates || {}),
      ];
    }
    for (const f of [spec.formulaLow, spec.formulaHigh]) {
      if (!f) return { ok: false, reason: "formula missing" };
      const v = validFormula(f, allowed);
      if (!v.ok) return { ok: false, reason: `formula rejected: ${v.reason}` };
    }
  } else if (spec.mode === "matrix") {
    if (!spec.bands && !spec.fallback) return { ok: false, reason: "matrix needs bands" };
  } else {
    return { ok: false, reason: `unknown mode: ${spec.mode}` };
  }
  return { ok: true };
}

const DISCLAIMER = "estimate only — confirmed on site";

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

// Round a low bound down and a high bound up to a tidy figure so quotes read
// like a tradesperson wrote them ($16k–$22k, not $16,142–$21,887).
function roundNice(n, dir) {
  const v = Math.max(0, num(n));
  let step;
  if (v >= 10000) step = 1000;
  else if (v >= 2000) step = 500;
  else if (v >= 500) step = 50;
  else step = 10;
  return dir === "down" ? Math.floor(v / step) * step : Math.ceil(v / step) * step;
}

// ─── Built-in launch verticals ───
// roofing demonstrates the safe FORMULA path; hvac the MATRIX path.
export const QUOTE_SPECS = {
  roofing: {
    id: "roofing",
    label: "Roof replacement",
    unit: "job",
    mode: "formula",
    inputs: [
      {
        key: "squares", type: "number", label: "Roof size (squares)",
        default: 20, min: 1, max: 300,
        question: "Roughly how big is the roof, in squares? (1 square ≈ 100 sq ft / ~9 m²). Reply with a number.",
      },
      {
        key: "steep", type: "option", label: "Access",
        default: "standard",
        options: [
          { value: "standard", label: "Single storey / walkable" },
          { value: "steep", label: "Two-storey or steep pitch" },
        ],
      },
    ],
    // AU full-roof-replacement rates (~$100–130/m²). An 18-square standard roof
    // lands at ~$16k–$22k, matching the figure quoted on the landing page.
    rates: { per_square_low: 900, per_square_high: 1200, steep_mult: 1.3, callout: 250 },
    // Variables exposed to the formulas (all numeric, all whitelisted).
    vars: (answers, rates) => ({
      squares: num(answers.squares ?? answers.squares_code, 20),
      per_square_low: num(rates.per_square_low),
      per_square_high: num(rates.per_square_high),
      steep_mult: (answers.steep === "steep" || answers.steep_code === "steep")
        ? num(rates.steep_mult, 1) : 1,
      callout: num(rates.callout),
    }),
    formulaLow: "squares * per_square_low * steep_mult + callout",
    formulaHigh: "squares * per_square_high * steep_mult + callout",
  },

  hvac: {
    id: "hvac",
    label: "HVAC / Air Conditioning",
    unit: "job",
    mode: "matrix",
    // Maps the triage answer (flow-engine hvac template, step key "issue",
    // option codes 1–5) straight to a price band — zero extra questions.
    matrixKey: "issue",
    bands: {
      "1": { low: 180, high: 650, label: "Not working — diagnostic + repair" },
      "2": { low: 150, high: 480, label: "Not heating/cooling properly" },
      "3": { low: 180, high: 600, label: "Strange noise or smell" },
      "4": { low: 4500, high: 12000, label: "New installation" },
      "5": { low: 120, high: 280, label: "Service / maintenance" },
    },
    fallback: { low: 150, high: 600, label: "Service call" },
  },
};

export function getQuoteSpecForTrade(trade) {
  return QUOTE_SPECS[String(trade || "").toLowerCase()] || null;
}

// Merge built-in trade defaults with the per-business quote_spec stored in
// flow_config. The business config wins for any field it sets.
function resolveSpec(quoteSpec) {
  const base = quoteSpec?.trade ? getQuoteSpecForTrade(quoteSpec.trade) : null;
  if (!base && !quoteSpec) return null;
  const merged = { ...(base || {}), ...(quoteSpec || {}) };
  merged.rates = { ...(base?.rates || {}), ...(quoteSpec?.rates || {}) };
  if (base?.vars && !quoteSpec?.vars) merged.vars = base.vars;
  if (base?.bands && !quoteSpec?.bands) merged.bands = base.bands;
  return merged;
}

function computeMatrix(spec, answers) {
  const key = spec.matrixKey || "intent";
  const code = String(answers[`${key}_code`] ?? answers[key] ?? "").trim().toUpperCase();
  const bands = spec.bands || {};
  const band =
    bands[code] || bands[code.toLowerCase?.()] || spec.fallback || null;
  if (!band) return null;
  return {
    low: num(band.low),
    high: num(band.high),
    unit: spec.unit || "job",
    breakdown: band.label ? [band.label] : [],
  };
}

function computeFormula(spec, answers) {
  const rates = spec.rates || {};
  const scope = typeof spec.vars === "function"
    ? spec.vars(answers, rates)
    : buildScopeFromInputs(spec, answers, rates);
  const allowed = Object.keys(scope);
  const lowF = spec.formulaLow, highF = spec.formulaHigh;
  if (!lowF || !highF) return null;
  if (!validFormula(lowF, allowed).ok || !validFormula(highF, allowed).ok) return null;
  const low = evalFormula(lowF, scope);
  const high = evalFormula(highF, scope);
  return {
    low, high, unit: spec.unit || "job",
    breakdown: spec.breakdown ? spec.breakdown(scope) : [],
  };
}

// Generic scope builder for custom formula specs without a vars() function:
// numeric inputs become variables, plus every numeric rate.
function buildScopeFromInputs(spec, answers, rates) {
  const scope = {};
  for (const inp of spec.inputs || []) {
    if (inp.type === "number") {
      scope[inp.key] = num(answers[inp.key] ?? answers[`${inp.key}_code`], inp.default ?? 0);
    }
  }
  for (const [k, v] of Object.entries(rates || {})) {
    if (Number.isFinite(Number(v))) scope[k] = Number(v);
  }
  return scope;
}

// Main entry. Returns { low, high, unit, breakdown, disclaimer } or null.
// ctx.avgJobValue anchors/derives bands when rates are absent.
export function computeQuoteFromAnswers(quoteSpec, answers = {}, ctx = {}) {
  const spec = resolveSpec(quoteSpec);
  const avg = num(ctx.avgJobValue);

  let raw = null;
  try {
    if (spec) {
      if (spec.mode === "matrix") raw = computeMatrix(spec, answers);
      else if (spec.mode === "formula") raw = computeFormula(spec, answers);
    }
  } catch {
    raw = null; // never let a bad spec break the conversation
  }

  // Fall back to an avg-anchored band so a quote still renders (demo / no rates).
  if ((!raw || !(raw.high > 0)) && avg > 0) {
    raw = { low: avg * 0.8, high: avg * 1.25, unit: spec?.unit || "job", breakdown: [] };
  }
  if (!raw || !(raw.high > 0)) return null;

  let low = roundNice(Math.min(raw.low, raw.high), "down");
  let high = roundNice(Math.max(raw.low, raw.high), "up");
  if (low <= 0) low = roundNice(high * 0.7, "down");
  if (high <= low) high = roundNice(low * 1.25 || low + 100, "up");

  return {
    low, high,
    unit: raw.unit || "job",
    breakdown: raw.breakdown || [],
    disclaimer: DISCLAIMER,
  };
}

// ─── Presentation ───
export function fmtMoney(n) {
  const v = Math.round(num(n));
  if (v >= 10000) return `$${Math.round(v / 1000)}k`;
  if (v >= 1000) return `$${(v / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return `$${v.toLocaleString("en-US")}`;
}

export function fmtRange(quote) {
  if (!quote) return "";
  return `${fmtMoney(quote.low)}–${fmtMoney(quote.high)}`;
}

// One-line ballpark for the SMS / demo, e.g.
//   "A job like this usually runs $16k–$22k (estimate only — confirmed on site)."
export function buildQuoteSentence(quote) {
  if (!quote) return "";
  return `A job like this usually runs ${fmtRange(quote)} (${quote.disclaimer}).`;
}
