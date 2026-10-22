import type { Crate, RecordItem, SeedFile, Store } from "@/domain/types";
import { stableHash } from "@/domain/hash";
export const STRESS_STORE_SLUG = "stress-test";

/**
 * Deterministically derives a 5,000-record store from the Basement Wax fixture so Wall Mode
 * virtualisation and filter performance can be exercised. Developer-only; hidden from the hub's
 * main store list and never represented as a real shop.
 */
export const STRESS_RECORD_COUNT = 5000;

export function buildStressStore(seed: SeedFile): { store: Store; crates: Crate[]; records: RecordItem[] } {
  const base = seed.stores.find((s) => s.slug === "basement-wax") ?? seed.stores[0];
  if (!base) throw new Error("Seed has no stores");
  const baseRecords = seed.records.filter((r) => r.storeId === base.id);
  const storeId = "store-stress-test";
  const store: Store = {
    ...base,
    id: storeId,
    slug: STRESS_STORE_SLUG,
    name: "Stress Test Wax",
    headline: "5,000 fictional records for performance testing.",
    description: "A developer fixture derived from Basement Wax. Not a real shop.",
    logoUrl: null,
    crateIds: [],
  };

  const records: RecordItem[] = [];
  for (let i = 0; i < STRESS_RECORD_COUNT; i += 1) {
    const source = baseRecords[i % baseRecords.length]!;
    const h = stableHash(`stress-${i}`);
    const id = `st-${String(i + 1).padStart(4, "0")}`;
    records.push({
      ...source,
      id,
      storeId,
      title: `${source.title} ${Math.floor(i / baseRecords.length) + 1}`,
      releaseYear: 1985 + (h % 40),
      priceMinor: (12 + (h % 90)) * 100,
      stockStatus: h % 19 === 0 ? "sold" : "available",
      newArrival: h % 6 === 0,
      staffPick: h % 11 === 0,
      preview: h % 4 === 0 ? null : source.preview,
      artworkUrl: h % 53 === 0 ? null : source.artworkUrl,
      description: undefined,
      tracklist: source.tracklist.slice(0, 2),
      createdAt: new Date(Date.UTC(2026, 0, 1) + (h % 300) * 86_400_000).toISOString(),
    });
  }

  const genres = [...new Set(baseRecords.flatMap((r) => r.genres))];
  const crates: Crate[] = [
    { id: `${STRESS_STORE_SLUG}-all`, storeId, name: "All Records", description: "All 5,000 fictional records", coverRecordIds: records.slice(0, 4).map((r) => r.id), definition: {}, displayOrder: 0 },
    { id: `${STRESS_STORE_SLUG}-new`, storeId, name: "New Arrivals", description: "Recently added", coverRecordIds: records.filter((r) => r.newArrival).slice(0, 4).map((r) => r.id), definition: { newArrival: true }, displayOrder: 1 },
    ...genres.map((g, i) => ({
      id: `${STRESS_STORE_SLUG}-${g.toLowerCase()}`,
      storeId,
      name: g,
      description: `Explore the ${g} crate`,
      coverRecordIds: records.filter((r) => r.genres.includes(g)).slice(0, 4).map((r) => r.id),
      definition: { genres: [g] },
      displayOrder: 2 + i,
    })),
  ];
  store.crateIds = crates.map((c) => c.id);
  return { store, crates, records };
}
