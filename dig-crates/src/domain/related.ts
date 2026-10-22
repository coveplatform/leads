import { stableHash } from "./hash";
import { matchesCrate } from "./catalog";
import type { Crate, RecordItem, RelatedRecord } from "./types";

/**
 * Dig Around This: deterministic, explainable, same-store-only recommendations.
 * See blueprint section 9 for the weights; every rule here is unit tested.
 */

export const GOOD_SCORE_THRESHOLD = 6;
export const WEAK_SCORE_THRESHOLD = 2;
export const NEARBY_LABEL = "Nearby style";

export interface RelatedOptions {
  /** Exclude sold records (default true). */
  availableOnly?: boolean;
  /** Optional crate scope. */
  crate?: Crate | null;
  /** Number of results to return (default 12). */
  limit?: number;
}

export function scoreRelation(seed: RecordItem, candidate: RecordItem): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  if (candidate.artist === seed.artist) {
    score += 10;
    reasons.push("Same artist");
  }
  if (candidate.label === seed.label) {
    score += 8;
    reasons.push(`Same label: ${seed.label}`);
  }
  const seedGenre = seed.genres[0];
  const candGenre = candidate.genres[0];
  if (seedGenre && candGenre && seedGenre === candGenre) {
    score += 6;
    reasons.push(`Also ${seedGenre}`);
  }
  const sharedStyles = candidate.styles.filter((s) => seed.styles.includes(s));
  if (sharedStyles.length) {
    const styleScore = Math.min(8, sharedStyles.length * 4);
    score += styleScore;
    reasons.push(`Similar style: ${sharedStyles.slice(0, 2).join(", ")}`);
  }
  const yearGap = Math.abs(candidate.releaseYear - seed.releaseYear);
  if (yearGap <= 3) {
    score += 3;
    reasons.push(yearGap === 0 ? `Same year (${seed.releaseYear})` : `Within 3 years (${candidate.releaseYear})`);
  } else if (yearGap <= 7) {
    score += 2;
    reasons.push(`Same era (${candidate.releaseYear})`);
  }
  if (typeof seed.bpm === "number" && typeof candidate.bpm === "number" && Math.abs(seed.bpm - candidate.bpm) <= 8) {
    score += 2;
    reasons.push(`Similar tempo (${candidate.bpm} BPM)`);
  }
  if (seed.staffLinks?.includes(candidate.id) || candidate.staffLinks?.includes(seed.id)) {
    score += 2;
    reasons.push("Staff-connected pick");
  }
  return { score, reasons };
}

function tieBreak(seedId: string, a: RelatedRecord, b: RelatedRecord): number {
  return (
    b.score - a.score ||
    stableHash(`${seedId}|${a.record.id}`) - stableHash(`${seedId}|${b.record.id}`) ||
    a.record.id.localeCompare(b.record.id)
  );
}

/**
 * Promote diversity among the leading results: at most 2 per label and at most 3 per artist
 * within the top 8, provided enough other candidates exist. Skipped items are appended after.
 */
export function diversify(sorted: RelatedRecord[], limit: number): RelatedRecord[] {
  const picked: RelatedRecord[] = [];
  const skipped: RelatedRecord[] = [];
  const labelCount = new Map<string, number>();
  const artistCount = new Map<string, number>();
  for (const item of sorted) {
    if (picked.length >= 8) {
      skipped.push(item);
      continue;
    }
    const lc = labelCount.get(item.record.label) ?? 0;
    const ac = artistCount.get(item.record.artist) ?? 0;
    if (lc >= 2 || ac >= 3) {
      skipped.push(item);
      continue;
    }
    labelCount.set(item.record.label, lc + 1);
    artistCount.set(item.record.artist, ac + 1);
    picked.push(item);
  }
  return [...picked, ...skipped].slice(0, limit);
}

export function relatedRecords(
  seed: RecordItem,
  pool: RecordItem[],
  options: RelatedOptions = {},
): RelatedRecord[] {
  const availableOnly = options.availableOnly ?? true;
  const limit = options.limit ?? 12;
  const seen = new Set<string>([seed.id]);
  const scored: RelatedRecord[] = [];

  for (const candidate of pool) {
    if (candidate.storeId !== seed.storeId) continue; // never leave the store
    if (seen.has(candidate.id)) continue; // never the seed, never duplicates
    seen.add(candidate.id);
    if (availableOnly && candidate.stockStatus !== "available") continue;
    if (options.crate && !matchesCrate(candidate, options.crate)) continue;
    const { score, reasons } = scoreRelation(seed, candidate);
    if (score <= 0) continue;
    scored.push({ record: candidate, score, reasons });
  }

  scored.sort((a, b) => tieBreak(seed.id, a, b));
  const good = scored.filter((s) => s.score >= GOOD_SCORE_THRESHOLD);
  if (good.length >= 4) return diversify(good, limit);

  // Relax: include weaker metadata matches, honestly labelled.
  const weak = scored
    .filter((s) => s.score < GOOD_SCORE_THRESHOLD && s.score >= WEAK_SCORE_THRESHOLD)
    .map((s) => ({ ...s, reasons: [NEARBY_LABEL, ...s.reasons] }));
  return diversify([...good, ...weak], limit);
}
