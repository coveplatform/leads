import { parsePhoneNumberFromString } from "libphonenumber-js/max";

const COUNTRY_BY_CODE = { "+61": "AU", "+64": "NZ", "+1": "US", "+44": "GB" };

function parse(input, defaultCountryCode) {
  if (!input || typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  const country = COUNTRY_BY_CODE[defaultCountryCode] || "AU";
  let candidate = trimmed;
  if (candidate.startsWith("00")) candidate = `+${candidate.slice(2)}`;

  let parsed = parsePhoneNumberFromString(candidate, country);
  // "614xxxxxxxx" without the + reads as a national number; retry as international.
  if ((!parsed || !parsed.isValid()) && /^\d{10,15}$/.test(candidate.replace(/[\s()-]/g, ""))) {
    const intl = parsePhoneNumberFromString(`+${candidate.replace(/[\s()-]/g, "")}`);
    if (intl?.isValid()) parsed = intl;
  }
  return parsed || null;
}

// Any reasonable way of writing a phone number → E.164 ("+61412345678"), or ""
// if it can't be a phone number. Handles 0412…, 04 1234 5678, +614…, 614…,
// 0061… and AU landlines (07 3333 4444). Lenient on purpose: a caller on a
// number range newer than our metadata must still get texted back.
export function normalizePhone(input, defaultCountryCode = "+61") {
  const parsed = parse(input, defaultCountryCode);
  return parsed && (parsed.isValid() || parsed.isPossible()) ? parsed.number : "";
}

// Strict check for numbers we type in ourselves (owner phones in client configs).
export function isValidPhone(input, defaultCountryCode = "+61") {
  return !!parse(input, defaultCountryCode)?.isValid();
}

// E.164 → how an Australian would write it ("0412 345 678", "07 3333 4444").
export function formatPhoneDisplay(e164) {
  if (!e164) return "";
  const parsed = parsePhoneNumberFromString(String(e164));
  if (!parsed) return String(e164);
  if (parsed.countryCallingCode !== "61") return parsed.formatInternational();
  const n = String(parsed.nationalNumber);
  // Mobiles as 0412 345 678 — also for ranges newer than the metadata.
  if (/^4\d{8}$/.test(n)) return `0${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}`;
  return parsed.country === "AU" ? parsed.formatNational() : `0${n}`;
}

// E.164 → digits for a carrier dial code ("+61412345678" → "0412345678").
export function toLocalDigits(e164) {
  const parsed = parsePhoneNumberFromString(String(e164 || ""));
  if (!parsed) return String(e164 || "");
  return parsed.countryCallingCode === "61" ? `0${parsed.nationalNumber}` : parsed.number;
}
