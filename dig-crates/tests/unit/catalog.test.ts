import { describe, expect, it } from "vitest";
import { applyQuery, catalogFacets, countForCrate, matchesQuery, normaliseQuery } from "@/domain/catalog";
import { EMPTY_FILTERS } from "@/domain/types";
import { crates, sampleRecords } from "./helpers";

const records = sampleRecords();
const all = crates[0]!;
const house = crates[1]!;

describe("search", () => {
  it("normalises queries into lowercase tokens", () => {
    expect(normaliseQuery("  Night  INDEX ")).toEqual(["night", "index"]);
    expect(normaliseQuery("Café")).toEqual(["cafe"]);
  });
  it("matches partial tokens across artist, title, label and catalogue number (AND semantics)", () => {
    const r = records[0]!;
    expect(matchesQuery(r, ["night"])).toBe(true);
    expect(matchesQuery(r, ["glass", "night"])).toBe(true);
    expect(matchesQuery(r, ["glass", "warehouse"])).toBe(false);
    expect(matchesQuery(r, ["subfl"])).toBe(true);
    expect(matchesQuery(r, ["lx-1"])).toBe(true);
  });
  it("search is case-insensitive and narrows results", () => {
    const ids = applyQuery(records, { crate: all, query: "NIGHT" }).map((r) => r.id);
    expect(ids.sort()).toEqual(["r1", "r4", "r6"]);
  });
});

describe("crates and filters", () => {
  it("applies crate definitions", () => {
    expect(countForCrate(records, house)).toBe(3);
    expect(countForCrate(records, crates[2]!)).toBe(2);
    expect(countForCrate(records, crates[3]!)).toBe(3);
  });
  it("applies every filter group", () => {
    const run = (f: Partial<typeof EMPTY_FILTERS>) => applyQuery(records, { crate: all, filters: { ...EMPTY_FILTERS, ...f } }).map((r) => r.id).sort();
    expect(run({ genre: ["Techno"] })).toEqual(["r3", "r4"]);
    expect(run({ style: ["Garage", "Acid"] })).toEqual(["r2", "r4"]);
    expect(run({ yearFrom: 1996, yearTo: 1999 })).toEqual(["r1", "r2", "r6"]);
    expect(run({ priceMinMinor: 3000, priceMaxMinor: 4600 })).toEqual(["r1", "r3"]);
    expect(run({ formats: ["LP", "7-inch"] })).toEqual(["r5", "r6"]);
    expect(run({ condition: ["VG"] })).toEqual(["r5"]);
    expect(run({ previewOnly: true })).toEqual(["r1", "r2", "r4", "r5", "r6"]);
    expect(run({ availableOnly: true })).toEqual(["r1", "r2", "r3", "r5", "r6"]);
  });
  it("conflicting filters yield an empty result rather than throwing", () => {
    expect(applyQuery(records, { crate: house, filters: { ...EMPTY_FILTERS, genre: ["Ambient"] } })).toEqual([]);
  });
});

describe("sorting", () => {
  const ids = (sort: Parameters<typeof applyQuery>[1]["sort"], seed = "s") => applyQuery(records, { crate: all, sort, sortSeed: seed }).map((r) => r.id);
  it("sorts by recency, price, year and artist deterministically", () => {
    expect(ids("recent")).toEqual(["r6", "r5", "r4", "r3", "r2", "r1"]);
    expect(ids("price-asc")).toEqual(["r4", "r2", "r5", "r1", "r3", "r6"]);
    expect(ids("price-desc")).toEqual(["r6", "r3", "r1", "r5", "r2", "r4"]);
    expect(ids("year-asc")).toEqual(["r4", "r6", "r1", "r2", "r3", "r5"]);
    expect(ids("year-desc")).toEqual(["r5", "r3", "r2", "r1", "r6", "r4"]);
    expect(ids("artist-az")).toEqual(["r1", "r2", "r4", "r6", "r3", "r5"]);
  });
  it("seeded shuffle is stable for the same seed and differs across seeds", () => {
    const a = ids("random", "seed-1");
    const b = ids("random", "seed-1");
    const c = ids("random", "seed-2");
    expect(a).toEqual(b);
    expect(a.slice().sort()).toEqual(["r1", "r2", "r3", "r4", "r5", "r6"]);
    expect(a).not.toEqual(c);
  });
});

describe("facets", () => {
  it("summarises genres, styles, years and prices", () => {
    const f = catalogFacets(records);
    expect(f.genres[0]).toEqual({ value: "House", count: 3 });
    expect(f.minYear).toBe(1991);
    expect(f.maxYear).toBe(2015);
    expect(f.minPriceMinor).toBe(1800);
    expect(f.maxPriceMinor).toBe(5200);
  });
});
