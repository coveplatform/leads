/** Server-side environment helpers. No secrets exist in this prototype. */

export function allowLocalhostEmbeds(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.DIG_ALLOW_LOCALHOST_EMBED === "1" || process.env.DIG_ALLOW_LOCALHOST_EMBED === "true";
}

/** Public origin for building absolute embed snippets in docs; falls back to a placeholder. */
export function publicAppOrigin(): string {
  return process.env.NEXT_PUBLIC_DIG_APP_ORIGIN?.replace(/\/$/, "") || "https://YOUR-DIG-HOST.example";
}
