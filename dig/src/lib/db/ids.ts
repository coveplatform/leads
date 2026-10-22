import { createHash } from "node:crypto";

/** Deterministic UUID (v5-style, SHA-1 based) so re-seeding is idempotent. */
export function stableId(namespace: string, key: string): string {
  const h = createHash("sha1").update(`${namespace}:${key}`).digest("hex");
  const hex = h.slice(0, 32).split("");
  hex[12] = "5";
  hex[16] = ((parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
  const s = hex.join("");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}
