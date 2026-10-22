import type { CSSProperties } from "react";
import { ThemeTokensSchema, type ThemeTokens } from "@/domain/types";

/**
 * Theme tokens become scoped CSS custom properties on the DIG root element.
 * Values are validated (hex colours, plain font family lists, bounded radii) so tenant
 * configuration can never inject arbitrary CSS.
 */

export const FONT_OPTIONS: Array<{ label: string; value: string }> = [
  { label: "System sans", value: "system-ui, sans-serif" },
  { label: "Arial", value: "Arial, sans-serif" },
  { label: "Arial Black", value: "Arial Black, Arial, sans-serif" },
  { label: "Helvetica", value: "Helvetica Neue, Helvetica, Arial, sans-serif" },
  { label: "Verdana", value: "Verdana, sans-serif" },
  { label: "Trebuchet", value: "Trebuchet MS, sans-serif" },
  { label: "Georgia (serif)", value: "Georgia, serif" },
  { label: "Palatino (serif)", value: "Palatino Linotype, Palatino, serif" },
  { label: "Times (serif)", value: "Times New Roman, Times, serif" },
  { label: "Courier (mono)", value: "Courier New, Courier, monospace" },
];

export function themeToCssVars(theme: ThemeTokens): CSSProperties {
  const vars: Record<string, string> = {
    "--dig-bg": theme.background,
    "--dig-surface": theme.surface,
    "--dig-surface-raised": theme.surfaceRaised,
    "--dig-fg": theme.foreground,
    "--dig-fg-muted": theme.foregroundMuted,
    "--dig-accent": theme.accent,
    "--dig-accent-fg": theme.accentForeground,
    "--dig-border": theme.border,
    "--dig-focus": theme.focusRing,
    "--dig-font-display": theme.fontDisplay,
    "--dig-font-body": theme.fontBody,
    "--dig-radius-button": `${theme.buttonRadius}px`,
    "--dig-radius-card": `${theme.cardRadius}px`,
    "--dig-radius-cover": `${theme.coverRadius}px`,
    "--dig-shadow": shadowFor(theme.shadowStyle),
    "--dig-shadow-strong": shadowFor(theme.shadowStyle, true),
  };
  return vars as CSSProperties;
}

function shadowFor(style: ThemeTokens["shadowStyle"], strong = false): string {
  switch (style) {
    case "none":
      return "none";
    case "soft":
      return strong ? "0 18px 40px rgba(0,0,0,0.28)" : "0 6px 18px rgba(0,0,0,0.16)";
    case "strong":
      return strong ? "0 26px 60px rgba(10,20,60,0.35)" : "0 10px 28px rgba(10,20,60,0.22)";
  }
}

export function themeClassNames(theme: ThemeTokens): string {
  return `dig-root dig-header-${theme.headerStyle} dig-shadow-${theme.shadowStyle}`;
}

/** Parse a hex colour into [r, g, b] (0–255). Accepts #rgb and #rrggbb. */
export function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1]!;
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function relativeLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.x contrast ratio between two hex colours, 1–21. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export interface ContrastCheck {
  pair: string;
  ratio: number;
  passesAA: boolean;
  passesAALarge: boolean;
}

/** Contrast checks the theme lab shows; AA for body text is 4.5:1, large text 3:1. */
export function themeContrastChecks(theme: ThemeTokens): ContrastCheck[] {
  const pairs: Array<[string, string, string]> = [
    ["Text on background", theme.foreground, theme.background],
    ["Text on surface", theme.foreground, theme.surface],
    ["Text on raised surface", theme.foreground, theme.surfaceRaised],
    ["Muted text on background", theme.foregroundMuted, theme.background],
    ["Muted text on surface", theme.foregroundMuted, theme.surface],
    ["Accent button label", theme.accentForeground, theme.accent],
    ["Accent on background", theme.accent, theme.background],
    ["Focus ring on background", theme.focusRing, theme.background],
  ];
  return pairs.map(([pair, fg, bg]) => {
    const ratio = contrastRatio(fg, bg);
    return { pair, ratio, passesAA: ratio >= 4.5, passesAALarge: ratio >= 3 };
  });
}

/** Themes are "accessible enough" for the lab when core text and button pairs reach AA. */
export function themeIsAccessible(theme: ThemeTokens): boolean {
  const checks = themeContrastChecks(theme);
  const required = ["Text on background", "Text on surface", "Accent button label"];
  return checks.filter((c) => required.includes(c.pair)).every((c) => c.passesAA);
}

/** Merge a partial override into a base theme, dropping anything that fails validation. */
export function mergeThemeOverride(base: ThemeTokens, override: unknown): { theme: ThemeTokens; rejectedKeys: string[] } {
  if (!override || typeof override !== "object") return { theme: base, rejectedKeys: [] };
  const candidate = { ...base, ...(override as Record<string, unknown>) };
  const parsed = ThemeTokensSchema.safeParse(candidate);
  if (parsed.success) return { theme: parsed.data, rejectedKeys: [] };
  const rejected = new Set(parsed.error.issues.map((i) => String(i.path[0])));
  const cleaned: Record<string, unknown> = { ...candidate };
  for (const key of rejected) cleaned[key] = (base as Record<string, unknown>)[key];
  const second = ThemeTokensSchema.safeParse(cleaned);
  return { theme: second.success ? second.data : base, rejectedKeys: [...rejected] };
}

/** Decode a theme override passed in a URL (`?theme=<base64url json>`); invalid input yields null. */
export function decodeThemeParam(value: string | null | undefined): Record<string, unknown> | null {
  if (!value || value.length > 4000) return null;
  try {
    const json = typeof atob === "function"
      ? atob(value.replace(/-/g, "+").replace(/_/g, "/"))
      : Buffer.from(value, "base64url").toString("utf8");
    const parsed: unknown = JSON.parse(json);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function encodeThemeParam(theme: Partial<ThemeTokens>): string {
  const json = JSON.stringify(theme);
  const b64 = typeof btoa === "function" ? btoa(json) : Buffer.from(json, "utf8").toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
