import { NextResponse, type NextRequest } from "next/server";

/**
 * Sets the signed guest cookie on the first page response, so every API call
 * the page makes already carries one identity. Without this, parallel first
 * requests would each mint a different guest and race for the cookie.
 *
 * Runs on the Edge runtime, so the HMAC uses Web Crypto; the Node side
 * (src/lib/auth/guest.ts) verifies the same format.
 */
const COOKIE = "dig_guest";

function secret(): string {
  const s = process.env.DIG_SESSION_SECRET;
  if (s && s.length >= 16) return s;
  return "dig-dev-secret-not-for-production";
}

function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function mint(): Promise<string> {
  const rawBytes = new Uint8Array(24);
  crypto.getRandomValues(rawBytes);
  const raw = b64url(rawBytes);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw)));
  return `${raw}.${b64url(sig).slice(0, 22)}`;
}

export async function middleware(req: NextRequest) {
  if (req.cookies.get(COOKIE)?.value) return NextResponse.next();
  const token = await mint();
  const res = NextResponse.next();
  const days = Number(process.env.DIG_GUEST_TTL_DAYS ?? 180);
  res.cookies.set(COOKIE, token, {
    path: "/",
    maxAge: days * 86400,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  // Let the rendered page's own requests see it immediately.
  res.headers.append("vary", "cookie");
  return res;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|icon.svg|manifest.webmanifest|sw.js).*)"],
};
