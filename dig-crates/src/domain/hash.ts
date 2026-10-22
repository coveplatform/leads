/** Small, dependency-free stable string hash (FNV-1a, 32-bit). */
export function stableHash(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** Deterministic pseudo-random in [0, 1) derived from a seed and a key. */
export function seededUnit(seed: string, key: string): number {
  return stableHash(`${seed}::${key}`) / 0x100000000;
}

export function randomSeed(): string {
  const bytes = new Uint32Array(2);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    bytes[0] = Math.floor(Math.random() * 0xffffffff);
    bytes[1] = Math.floor(Math.random() * 0xffffffff);
  }
  return `${(bytes[0] ?? 0).toString(36)}${(bytes[1] ?? 0).toString(36)}`;
}
