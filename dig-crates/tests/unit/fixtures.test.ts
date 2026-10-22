import { describe, expect, it } from "vitest";
import { demoRepository, STRESS_STORE_SLUG } from "@/data/demo-repository";
import { relatedRecords } from "@/domain/related";
import { countForCrate } from "@/domain/catalog";

describe("demo fixtures", () => {
  it("validates and exposes three fictional stores plus the hidden stress store", async () => {
    const stores = await demoRepository.listStores();
    expect(stores.map((s) => s.slug)).toEqual(["basement-wax", "sunday-records", "signal-records"]);
    expect(stores.some((s) => s.slug === STRESS_STORE_SLUG)).toBe(false);
    const stress = await demoRepository.getSnapshot(STRESS_STORE_SLUG);
    expect(stress?.records.length).toBe(5000);
  });

  it("has 180 records and 9 crates per store, with the expected edge cases", async () => {
    for (const slug of ["basement-wax", "sunday-records", "signal-records"]) {
      const snap = await demoRepository.getSnapshot(slug);
      expect(snap).not.toBeNull();
      expect(snap!.records.length).toBe(180);
      expect(snap!.crates.length).toBe(9);
      expect(snap!.records.every((r) => r.storeId === snap!.store.id)).toBe(true);
      const noPreview = snap!.records.filter((r) => !r.preview).length / 180;
      expect(noPreview).toBeGreaterThan(0.15);
      expect(noPreview).toBeLessThan(0.25);
      expect(snap!.records.some((r) => r.artworkUrl === null)).toBe(true);
      expect(snap!.records.some((r) => r.stockStatus === "sold")).toBe(true);
      for (const crate of snap!.crates) expect(countForCrate(snap!.records, crate)).toBeGreaterThan(0);
    }
  });

  it("never returns another store's records from store-scoped queries", async () => {
    const bw = await demoRepository.getStore("basement-wax");
    const sr = await demoRepository.getStore("sunday-records");
    expect(await demoRepository.getRecord(bw!.id, "su-001")).toBeNull();
    expect(await demoRepository.getRecord(sr!.id, "su-001")).not.toBeNull();
    const page = await demoRepository.listRecords(bw!.id, { limit: 100 });
    expect(page.items.every((r) => r.storeId === bw!.id)).toBe(true);
    expect(page.total).toBe(180);
    expect(await demoRepository.related(bw!.id, "su-001")).toEqual([]);
  });

  it("paginates with bounded limits and cursors", async () => {
    const bw = await demoRepository.getStore("basement-wax");
    const first = await demoRepository.listRecords(bw!.id, { limit: 1000 });
    expect(first.items.length).toBe(100);
    expect(first.nextCursor).toBeTruthy();
    const second = await demoRepository.listRecords(bw!.id, { limit: 100, cursor: first.nextCursor });
    expect(second.items.length).toBe(80);
    expect(second.nextCursor).toBeUndefined();
    expect(new Set([...first.items, ...second.items].map((r) => r.id)).size).toBe(180);
  });

  it("produces plausible multi-path related results on the real catalogue", async () => {
    const snap = await demoRepository.getSnapshot("basement-wax");
    const seed = snap!.records.find((r) => r.id === "ba-002")!;
    const related = relatedRecords(seed, snap!.records);
    expect(related.length).toBeGreaterThanOrEqual(8);
    expect(related.every((r) => r.record.id !== seed.id)).toBe(true);
    expect(related.every((r) => r.record.stockStatus === "available")).toBe(true);
    expect(related.every((r) => r.reasons.length > 0)).toBe(true);
    const artists = new Set(related.slice(0, 8).map((r) => r.record.artist));
    expect(artists.size).toBeGreaterThanOrEqual(3);
  });
});
