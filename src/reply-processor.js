// Rule-based pre-processor for inbound SMS replies.
// Runs before option matching (flow-engine matchOption) — handles special
// intents, retry tracking, and free text quality checks.

// ─── Special Intent Patterns ───

const CALL_ME_PATTERNS = [
  /\b(just\s+)?call\s+me\b/i,
  /\bring\s+me\b/i,
  /\bphone\s+me\b/i,
  /\bcall\s+(me\s+)?back\b/i,
  /\bspeak\s+to\s+(a\s+)?(someone|person|human)\b/i,
  /\btalk\s+to\s+(a\s+)?(someone|person|human)\b/i,
  /\bcan\s+(someone|you)\s+call\b/i,
  /\bwould\s+rather\s+(speak|talk|call)\b/i,
  /\bprefer\s+to\s+(speak|talk|call)\b/i,
  /\bjust\s+(speak|talk)\b/i,
];

const CONFUSED_PATTERNS = [
  /^who\s+is\s+this/i,
  /^who\s+are\s+you/i,
  /^what\s+is\s+this/i,
  /^what\s+number\s+is\s+this/i,
  /^i\s+don.?t\s+(understand|get\s+(this|it))/i,
  /^\?{2,}$/,
  /^huh\??$/i,
  /^what\??$/i,
  /^(um+|uh+)\??$/i,
];

const PRICE_PATTERNS = [
  /^how\s+much/i,
  /^what\s+do\s+you\s+charge/i,
  /^what\s+are\s+your\s+(prices?|rates?|costs?|fees?)/i,
  /^(is\s+it|are\s+you)\s+(expensive|cheap|free)/i,
  /^how\s+expensive/i,
  /^what.s\s+the\s+(cost|price|rate|fee)/i,
];

// Stock non-answers for free text steps
const NON_ANSWER_PATTERN = /^(yes|no|nope|yep|yeah|nah|ok|okay|sure|k|yup|uh\s*huh|roger|fine|right|correct|sounds\s+good|got\s+it|thanks|ty)$/i;

// ─── Exports ───

/**
 * Detect special intent before normal flow processing.
 * @returns {'call_me' | 'confused' | 'price_question' | null}
 */
export function detectSpecialIntent(text) {
  const t = (text || "").trim();
  if (!t) return null;
  if (CALL_ME_PATTERNS.some((p) => p.test(t))) return "call_me";
  if (CONFUSED_PATTERNS.some((p) => p.test(t))) return "confused";
  if (PRICE_PATTERNS.some((p) => p.test(t))) return "price_question";
  return null;
}

/**
 * For free text steps: detect if the reply isn't a real answer.
 * Returns true if the reply is a stock non-answer or too short to be useful.
 */
export function isMeaninglessReply(text) {
  const t = (text || "").trim();
  if (t.length < 3) return true;
  if (NON_ANSWER_PATTERN.test(t)) return true;
  return false;
}

// ─── Retry Tracking ───
// Stored inside lead.answers as _retries: { "stepNumber": count }
// No migration needed — answers is JSONB and we namespace under _retries.

export const MAX_RETRIES_MULTIPLE_CHOICE = 2;
export const MAX_RETRIES_FREE_TEXT = 1; // Only re-prompt once on free text

export function getRetryCount(answers, stepNumber) {
  return answers?._retries?.[String(stepNumber)] || 0;
}

export function incrementRetryAnswers(answers, stepNumber) {
  const retries = { ...(answers?._retries || {}) };
  retries[String(stepNumber)] = (retries[String(stepNumber)] || 0) + 1;
  return { ...(answers || {}), _retries: retries };
}
