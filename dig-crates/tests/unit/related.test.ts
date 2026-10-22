import { describe, expect, it } from "vitest";
import { diversify, NEARBY_LABEL, relatedRecords, scoreRelation } from "@/domain/related";
import { rec, sampleRecords } from "./helpers";

describe("scoreRelation", () => {
  const seed = rec({ id: "s", artist: "A", label: "L", genres: ["House"], styles: ["Deep", "Dub"], releaseYear: 2000, bpm: 120 });
  it("awards each rule its documented weight with a factual reason", () => {
    expect(scoreRelation(seed, rec({ artist: "A", label: "Z", genres: ["X"], styles: [], releaseYear: 1950, bpm: 200 }))).toEqual({ score: 10, reasons: ["Same artist"] });
    expect(scoreRelation(seed, rec({ artist: "B", label: "L", genres: ["X"], styles: [], releaseYear: 1950, bpm: 200 }))).toEqual({ score: 8, reasons: ["Same label: L"] });
    expect(scoreRelation(seed, rec({ artist: "B", label: "Z", genres: ["House"], styles: [], releaseYear: 1950, bpm: 200 })).score).toBe(6);
    expect(scoreRelation(seed, rec({ artist: "B", label: "Z", genres: ["X"], styles: ["Deep"], releaseYear: 1950, bpm: 200 })).score).toBe(4);
    expect(scoreRelation(seed, rec({ artist: "B", label: "Z", genres: ["X"], styles: ["Deep", "Dub", "Other"], releaseYear: 1950, bpm: 200 })).score).toBe(8);
  });
  it("year proximity is not cumulative and tempo needs both BPMs", () => {
    expect(scoreRelation(seed, rec({ artist: "B", label: "Z", genres: ["X"], styles: [], releaseYear: 2003, bpm: 200 })).score).toBe(3);
    expect(scoreRelation(seed, rec({ artist: "B", label: "Z", genres: ["X"], styles: [], releaseYear: 2006, bpm: 200 })).score).toBe(2);
    expect(scoreRelation(seed, rec({ artist: "B", label: "Z", genres: ["X"], styles: [], releaseYear: 2010, bpm: 200 })).score).toBe(0);
    expect(scoreRelation(seed, rec({ artist: "B", label: "Z", genres: ["X"], styles: [], releaseYear: 2010, bpm: 126 })).score).toBe(2);
    expect(scoreRelation(seed, rec({ artist: "B", label: "Z", genres: ["X"], styles: [], releaseYear: 2010, bpm: null })).score).toBe(0);
  });
  it("staff links only count when explicitly present in fixture metadata", () => {
    expect(scoreRelation(seed, rec({ id: "x", artist: "B", label: "Z", genres: ["X"], styles: [], releaseYear: 2010 })).reasons).not.toContain("Staff-connected pick");
    const linked = rec({ id: "s2", artist: "A", label: "L", genres: ["House"], styles: [], releaseYear: 2000, staffLinks: ["y"] });
    expect(scoreRelation(linked, rec({ id: "y", artist: "B", label: "Z", genres: ["X"], styles: [], releaseYear: 2010 })).reasons).toContain("Staff-connected pick");
  });
});

describe("relatedRecords", () => {
  const records = sampleRecords();
  const seed = records[0]!; // r1 Glass Circuit / Subfloor / House / 1997
  it("excludes the seed, sold records, other stores and duplicates", () => {
    const other = rec({ id: "o1", storeId: "store-other", artist: "Glass Circuit", label: "Subfloor" });
    const dup = { ...records[1]! };
    const out = relatedRecords(seed, [...records, other, dup]);
    const ids = out.map((r) => r.record.id);
    expect(ids).not.toContain("r1");
    expect(ids).not.toContain("r4");
    expect(ids).not.toContain("o1");
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("includes sold records only when availableOnly is disabled", () => {
    expect(relatedRecords(seed, records, { availableOnly: false }).map((r) => r.record.id)).toContain("r4");
  });
  it("ranks the strongest connection first with explanations from matched fields", () => {
    const out = relatedRecords(seed, records);
    expect(out[0]!.record.id).toBe("r2");
    expect(out[0]!.reasons).toEqual(expect.arrayContaining(["Same artist", "Also House", "Similar style: Deep House", "Within 3 years (1999)", "Similar tempo (124 BPM)"]));
  });
  it("relaxes the threshold and labels weak matches when fewer than four good matches exist", () => {
    const s = rec({ id: "s", artist: "A", label: "L", genres: ["House"], styles: ["Deep"], releaseYear: 2000, bpm: 120 });
    const strong = rec({ id: "strong", artist: "A", label: "L", genres: ["House"], styles: [], releaseYear: 2000, bpm: 120 });
    const weak = rec({ id: "weak", artist: "B", label: "Z", genres: ["Other"], styles: [], releaseYear: 2005, bpm: 90 }); // same era only: +2
    const none = rec({ id: "none", artist: "C", label: "Y", genres: ["Other"], styles: [], releaseYear: 1950, bpm: null });
    const out = relatedRecords(s, [strong, weak, none]);
    expect(out.map((r) => r.record.id)).toEqual(["strong", "weak"]);
    expect(out[0]!.reasons[0]).not.toBe(NEARBY_LABEL);
    expect(out[1]!.reasons).toEqual([NEARBY_LABEL, "Same era (2005)"]);
    // With four or more good matches, weak ones are not padded in.
    const goods = ["g1", "g2", "g3", "g4"].map((id) => rec({ id, artist: "A", label: "L", genres: ["House"], styles: [], releaseYear: 2000 }));
    expect(relatedRecords(s, [...goods, weak]).map((r) => r.record.id)).not.toContain("weak");
  });
  it("returns nothing when no metadata connects, rather than fabricating", () => {
    const lonely = rec({ id: "z", artist: "Nobody", label: "Nowhere", genres: ["Polka"], styles: ["Oompah"], releaseYear: 1950, bpm: null });
    expect(relatedRecords(lonely, records)).toEqual([]);
  });
  it("is deterministic across calls", () => {
    expect(relatedRecords(seed, records).map((r) => r.record.id)).toEqual(relatedRecords(seed, records).map((r) => r.record.id));
  });
});

describe("diversify", () => {
  it("caps a label at two and an artist at three within the top eight when alternatives exist", () => {
    const items = Array.from({ length: 12 }, (_, i) => ({
      record: rec({ id: `d${i}`, label: i < 6 ? "Same" : `L${i}`, artist: i < 5 ? "Same" : `A${i}` }),
      score: 20 - i,
      reasons: ["x"],
    }));
    const top8 = diversify(items, 12).slice(0, 8);
    expect(top8.filter((r) => r.record.label === "Same").length).toBe(2);
    expect(top8.filter((r) => r.record.artist === "Same").length).toBeLessThanOrEqual(3);
    expect(new Set(top8.map((r) => r.record.artist)).size).toBeGreaterThanOrEqual(3);
    expect(diversify(items, 12).length).toBe(12);
  });
});
