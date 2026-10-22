import { describe, expect, it } from "vitest";
import { mintGuestToken, verifyGuestToken, hashToken, readCookie } from "@/lib/auth/guest";

describe("guest tokens", () => {
  it("round-trips and rejects tampering", () => {
    const t = mintGuestToken();
    expect(verifyGuestToken(t)).toBe(t);
    expect(verifyGuestToken(t.slice(0, -1) + (t.endsWith("a") ? "b" : "a"))).toBeNull();
    expect(verifyGuestToken("garbage")).toBeNull();
    expect(hashToken(t)).toHaveLength(64);
  });
  it("Edge-minted tokens (Web Crypto HMAC) verify on the Node side", async () => {
    // Mirror src/middleware.ts: HMAC-SHA256(secret, raw) base64url, 22 chars.
    const raw = "abcdefghijklmnopqrstuvwxyz012345";
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode("dig-dev-secret-not-for-production"),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sig = new Uint8Array(
      await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw)),
    );
    const b64 = Buffer.from(sig).toString("base64url").slice(0, 22);
    expect(verifyGuestToken(`${raw}.${b64}`)).toBe(`${raw}.${b64}`);
  });
  it("reads a cookie out of a header", () => {
    expect(readCookie("a=1; dig_guest=x%2Ey; b=2", "dig_guest")).toBe("x.y");
    expect(readCookie(null, "dig_guest")).toBeUndefined();
  });
});
