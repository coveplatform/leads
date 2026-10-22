import type { Currency } from "./types";

const LOCALE_BY_CURRENCY: Record<Currency, string> = {
  AUD: "en-AU",
  GBP: "en-GB",
  EUR: "de-IE",
  USD: "en-US",
};

const formatterCache = new Map<string, Intl.NumberFormat>();

function formatter(currency: Currency, locale?: string): Intl.NumberFormat {
  const key = `${currency}:${locale ?? ""}`;
  let fmt = formatterCache.get(key);
  if (!fmt) {
    fmt = new Intl.NumberFormat(locale ?? LOCALE_BY_CURRENCY[currency], {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    formatterCache.set(key, fmt);
  }
  return fmt;
}

/** Format an integer minor-unit amount (cents/pence) as a currency string. */
export function formatPrice(priceMinor: number, currency: Currency, locale?: string): string {
  if (!Number.isFinite(priceMinor)) return "—";
  return formatter(currency, locale).format(Math.round(priceMinor) / 100);
}

/** Sum of minor units, safe for integer arithmetic. */
export function sumMinor(values: number[]): number {
  return values.reduce((acc, v) => acc + (Number.isFinite(v) ? Math.round(v) : 0), 0);
}

/** Parse a user-typed major-unit amount ("29.50") into minor units, or undefined when blank/invalid. */
export function parseMajorToMinor(input: string): number | undefined {
  const trimmed = input.trim().replace(/[^0-9.]/g, "");
  if (!trimmed) return undefined;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0) return undefined;
  return Math.round(value * 100);
}
