import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const GUEST_COOKIE = "dig_guest";

function secret(): string {
  const s = process.env.DIG_SESSION_SECRET;
  if (s && s.length >= 16) return s;
  if (process.env.NODE_ENV === "production" && process.env.DIG_ALLOW_DEV_SECRET !== "1") {
    throw new Error("DIG_SESSION_SECRET must be set in production");
  }
  return "dig-dev-secret-not-for-production";
}

export function mintGuestToken(): string {
  const raw = randomBytes(24).toString("base64url");
  const sig = createHmac("sha256", secret()).update(raw).digest("base64url").slice(0, 22);
  return `${raw}.${sig}`;
}

export function verifyGuestToken(token: string | undefined | null): string | null {
  if (!token) return null;
  const [raw, sig] = token.split(".");
  if (!raw || !sig) return null;
  const expected = createHmac("sha256", secret()).update(raw).digest("base64url").slice(0, 22);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return token;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function readCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

export function guestCookieHeader(token: string): string {
  const days = Number(process.env.DIG_GUEST_TTL_DAYS ?? 180);
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${GUEST_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${days * 86400}; HttpOnly; SameSite=Lax${secure}`;
}

export function clearGuestCookieHeader(): string {
  return `${GUEST_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`;
}
