/** Simple in-process sliding window: 120 requests / minute / principal. */
const WINDOW_MS = 60_000;
const LIMIT = Number(process.env.DIG_RATE_LIMIT ?? 120);
const buckets = new Map<string, number[]>();

export function rateLimit(key: string, now = Date.now()): { ok: boolean; retryAfter: number } {
  const arr = (buckets.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (arr.length >= LIMIT) {
    buckets.set(key, arr);
    return { ok: false, retryAfter: Math.ceil((WINDOW_MS - (now - arr[0]!)) / 1000) };
  }
  arr.push(now);
  buckets.set(key, arr);
  if (buckets.size > 10_000) buckets.clear();
  return { ok: true, retryAfter: 0 };
}
