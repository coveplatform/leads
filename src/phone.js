export function normalizePhone(input, defaultCountryCode = "+61") {
  if (!input || typeof input !== "string") return "";

  const trimmed = input.trim();
  const withPlus = trimmed.startsWith("+");
  const digitsOnly = trimmed.replace(/\D/g, "");

  if (!digitsOnly) return "";

  if (withPlus) {
    return `+${digitsOnly}`;
  }

  if (trimmed.startsWith("00")) {
    return `+${digitsOnly.slice(2)}`;
  }

  // AU-friendly default conversion: 04xxxxxxxx -> +614xxxxxxxx
  if (digitsOnly.startsWith("0") && defaultCountryCode.startsWith("+")) {
    return `${defaultCountryCode}${digitsOnly.slice(1)}`;
  }

  // Fallback: assume already country-prefixed digits.
  return `+${digitsOnly}`;
}
