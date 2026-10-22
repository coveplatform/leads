import seedJson from "./fixtures/demo-seed.json";
import { applyQuery } from "@/domain/catalog";
import { relatedRecords } from "@/domain/related";
import {
  EMPTY_FILTERS,
  SeedFileSchema,
  type CatalogQuery,
  type CatalogRepository,
  type CatalogSnapshot,
  type Crate,
  type RecordItem,
  type RelatedRecord,
  type SeedFile,
  type Store,
} from "@/domain/types";
import { buildStressStore, STRESS_STORE_SLUG } from "./stress-fixture";
export { STRESS_STORE_SLUG };

/**
 * Fixture-backed CatalogRepository. The seed JSON is validated once with Zod at first use.
 * This is the only module that knows data comes from a JSON file; the UI never imports it.
 */

export const DEMO_RECORD_LIMIT_MAX = 100;
export const DEMO_RECORD_LIMIT_DEFAULT = 24;



interface LoadedSeed {
  seed: SeedFile;
  storesBySlug: Map<string, Store>;
  storesById: Map<string, Store>;
  cratesByStore: Map<string, Crate[]>;
  recordsByStore: Map<string, RecordItem[]>;
}

let loaded: LoadedSeed | null = null;

function load(): LoadedSeed {
  if (loaded) return loaded;
  const parsed = SeedFileSchema.safeParse(seedJson);
  if (!parsed.success) {
    throw new Error(`demo-seed.json failed validation: ${parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  }
  const seed = parsed.data;
  const stress = buildStressStore(seed);
  const stores = [...seed.stores, stress.store];
  const crates = [...seed.crates, ...stress.crates];
  const records = [...seed.records, ...stress.records];

  const storesBySlug = new Map<string, Store>();
  const storesById = new Map<string, Store>();
  for (const s of stores) {
    storesBySlug.set(s.slug, s);
    storesById.set(s.id, s);
  }
  const cratesByStore = new Map<string, Crate[]>();
  for (const c of crates) {
    if (!storesById.has(c.storeId)) continue;
    const arr = cratesByStore.get(c.storeId) ?? [];
    arr.push(c);
    cratesByStore.set(c.storeId, arr);
  }
  for (const arr of cratesByStore.values()) arr.sort((a, b) => a.displayOrder - b.displayOrder);

  const recordsByStore = new Map<string, RecordItem[]>();
  const seenIds = new Set<string>();
  for (const r of records) {
    if (!storesById.has(r.storeId)) continue;
    if (seenIds.has(r.id)) throw new Error(`Duplicate record id in fixtures: ${r.id}`);
    seenIds.add(r.id);
    const arr = recordsByStore.get(r.storeId) ?? [];
    arr.push(r);
    recordsByStore.set(r.storeId, arr);
  }
  loaded = { seed: { ...seed, stores, crates, records }, storesBySlug, storesById, cratesByStore, recordsByStore };
  return loaded;
}

function encodeCursor(offset: number): string {
  return Buffer.from(String(offset), "utf8").toString("base64url");
}

function decodeCursor(cursor: string | undefined): number {
  if (!cursor) return 0;
  const raw = Buffer.from(cursor, "base64url").toString("utf8");
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > 1_000_000) throw new RangeError("Invalid cursor");
  return n;
}

export const demoRepository: CatalogRepository = {
  async listStores() {
    return load().seed.stores.filter((s) => s.slug !== STRESS_STORE_SLUG);
  },
  async getStore(slug) {
    return load().storesBySlug.get(slug) ?? null;
  },
  async listCrates(storeId) {
    return load().cratesByStore.get(storeId) ?? [];
  },
  async listRecords(storeId, q) {
    const data = load();
    const records = data.recordsByStore.get(storeId) ?? [];
    const crates = data.cratesByStore.get(storeId) ?? [];
    const crate = q.crateId ? (crates.find((c) => c.id === q.crateId) ?? null) : null;
    if (q.crateId && !crate) return { items: [], total: 0 };
    const ordered = applyQuery(records, {
      crate,
      query: q.query,
      filters: { ...EMPTY_FILTERS, ...(q.filters ?? {}) },
      sort: q.sort,
      sortSeed: q.sortSeed,
    });
    const limit = Math.min(Math.max(1, q.limit ?? DEMO_RECORD_LIMIT_DEFAULT), DEMO_RECORD_LIMIT_MAX);
    const offset = decodeCursor(q.cursor);
    const items = ordered.slice(offset, offset + limit).filter((r) => r.storeId === storeId);
    const nextOffset = offset + limit;
    return {
      items,
      total: ordered.length,
      nextCursor: nextOffset < ordered.length ? encodeCursor(nextOffset) : undefined,
    };
  },
  async getRecord(storeId, recordId) {
    const record = (load().recordsByStore.get(storeId) ?? []).find((r) => r.id === recordId) ?? null;
    return record && record.storeId === storeId ? record : null;
  },
  async related(storeId, recordId, options) {
    const records = load().recordsByStore.get(storeId) ?? [];
    const seed = records.find((r) => r.id === recordId);
    if (!seed || seed.storeId !== storeId) return [];
    const results: RelatedRecord[] = relatedRecords(seed, records, { availableOnly: options?.availableOnly ?? true });
    return results.filter((r) => r.record.storeId === storeId);
  },
  async getSnapshot(slug): Promise<CatalogSnapshot | null> {
    const data = load();
    const store = data.storesBySlug.get(slug);
    if (!store) return null;
    return {
      store,
      crates: data.cratesByStore.get(store.id) ?? [],
      records: data.recordsByStore.get(store.id) ?? [],
    };
  },
};

export function getSeedDisclaimer(): string {
  return load().seed.disclaimer;
}

export type { CatalogQuery };
