import type { CatalogSnapshot, Crate, RecordItem, Store, ThemeTokens } from "@/domain/types";

export const theme: ThemeTokens = {
  background: "#1d1e20",
  surface: "#282a2d",
  surfaceRaised: "#333539",
  foreground: "#f0ede8",
  foregroundMuted: "#b4b0aa",
  accent: "#d29a68",
  accentForeground: "#201b17",
  border: "#4b4b4a",
  focusRing: "#ffcb90",
  fontDisplay: "Arial, sans-serif",
  fontBody: "Arial, sans-serif",
  buttonRadius: 8,
  cardRadius: 10,
  coverRadius: 3,
  shadowStyle: "soft",
  headerStyle: "minimal",
};

export const store: Store = {
  id: "store-test",
  slug: "test-store",
  name: "Test Store",
  headline: "Testing records.",
  description: "Fictional test shop.",
  logoUrl: null,
  logoVariant: "auto",
  currency: "AUD",
  country: "Australia",
  allowedEmbedOrigins: ["https://shop.example"],
  theme,
  crateIds: ["c-all", "c-house", "c-new", "c-cheap"],
};

let n = 0;
export function rec(overrides: Partial<RecordItem> = {}): RecordItem {
  n += 1;
  const id = overrides.id ?? `t-${String(n).padStart(3, "0")}`;
  return {
    id,
    storeId: "store-test",
    artist: "Artist A",
    title: `Title ${n}`,
    label: "Label X",
    catalogueNumber: `LX-${n}`,
    releaseYear: 1995,
    format: "12-inch",
    genres: ["House"],
    styles: ["Deep House"],
    tags: ["house"],
    bpm: 120,
    conditionMedia: "NM",
    conditionSleeve: "VG+",
    priceMinor: 2500,
    currency: "AUD",
    stockStatus: "available",
    newArrival: false,
    staffPick: false,
    artworkUrl: `/covers/${id}.svg`,
    tracklist: [{ position: "A1", title: "Mix", durationSec: 300 }],
    description: "Fictional.",
    preview: { type: "local-demo", url: "/demo-audio/demo-loop-01.wav", durationSec: 8 },
    productUrl: null,
    createdAt: `2026-01-${String(Math.min(28, n)).padStart(2, "0")}T00:00:00Z`,
    ...overrides,
  };
}

export const crates: Crate[] = [
  { id: "c-all", storeId: "store-test", name: "All Records", description: "", coverRecordIds: [], definition: {}, displayOrder: 0 },
  { id: "c-house", storeId: "store-test", name: "House", description: "", coverRecordIds: [], definition: { genres: ["House"] }, displayOrder: 1 },
  { id: "c-new", storeId: "store-test", name: "New Arrivals", description: "", coverRecordIds: [], definition: { newArrival: true }, displayOrder: 2 },
  { id: "c-cheap", storeId: "store-test", name: "Under $30", description: "", coverRecordIds: [], definition: { maxPriceMinor: 3000 }, displayOrder: 3 },
];

export function makeSnapshot(records: RecordItem[]): CatalogSnapshot {
  return { store, crates, records };
}

export function sampleRecords(): RecordItem[] {
  n = 0;
  return [
    rec({ id: "r1", artist: "Glass Circuit", title: "Night Index EP", label: "Subfloor", releaseYear: 1997, genres: ["House"], styles: ["Deep House"], priceMinor: 3800, newArrival: true, bpm: 122 }),
    rec({ id: "r2", artist: "Glass Circuit", title: "Soft Machines", label: "Inner Orbit", releaseYear: 1999, genres: ["House"], styles: ["Deep House", "Garage"], priceMinor: 2200, bpm: 124 }),
    rec({ id: "r3", artist: "Quiet Harbour", title: "Tidal Phase", label: "Subfloor", releaseYear: 2004, genres: ["Techno"], styles: ["Dub Techno"], priceMinor: 4500, preview: null, bpm: 128 }),
    rec({ id: "r4", artist: "Night Transit", title: "Warehouse Method", label: "Late Signal", releaseYear: 1991, genres: ["Techno"], styles: ["Acid"], priceMinor: 1800, stockStatus: "sold", bpm: 130 }),
    rec({ id: "r5", artist: "Signal Drift", title: "Rare Frequency", label: "Inner Orbit", releaseYear: 2015, genres: ["Ambient"], styles: ["Atmospheric"], priceMinor: 2900, bpm: null, format: "LP", conditionMedia: "VG", artworkUrl: null }),
    rec({ id: "r6", artist: "Quiet Harbour", title: "Night Transit Dubs", label: "Subfloor", releaseYear: 1996, genres: ["House"], styles: ["Dub Techno"], priceMinor: 5200, newArrival: true, staffPick: true, bpm: 121, format: "7-inch" }),
  ];
}
