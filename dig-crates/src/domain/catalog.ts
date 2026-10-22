import { seededUnit } from "./hash";
import { EMPTY_FILTERS, type Crate, type RecordFilters, type RecordItem, type SortKey } from "./types";

/** Does a record belong to a curated crate according to the crate's definition? */
export function matchesCrate(record: RecordItem, crate: Crate | null | undefined): boolean {
  if (!crate) return true;
  const def = crate.definition;
  if (def.genres?.length && !def.genres.some((g) => record.genres.includes(g))) return false;
  if (def.tags?.length && !def.tags.some((t) => record.tags.includes(t))) return false;
  if (def.newArrival !== undefined && record.newArrival !== def.newArrival) return false;
  if (def.staffPick !== undefined && record.staffPick !== def.staffPick) return false;
  if (def.maxPriceMinor !== undefined && record.priceMinor > def.maxPriceMinor) return false;
  return true;
}

export function matchesFilters(record: RecordItem, filters: RecordFilters): boolean {
  if (filters.genre.length && !filters.genre.some((g) => record.genres.includes(g))) return false;
  if (filters.style.length && !filters.style.some((s) => record.styles.includes(s))) return false;
  if (filters.yearFrom !== undefined && record.releaseYear < filters.yearFrom) return false;
  if (filters.yearTo !== undefined && record.releaseYear > filters.yearTo) return false;
  if (filters.priceMinMinor !== undefined && record.priceMinor < filters.priceMinMinor) return false;
  if (filters.priceMaxMinor !== undefined && record.priceMinor > filters.priceMaxMinor) return false;
  if (filters.formats.length && !filters.formats.includes(record.format)) return false;
  if (filters.condition.length && !filters.condition.includes(record.conditionMedia)) return false;
  if (filters.previewOnly && !record.preview) return false;
  if (filters.availableOnly && record.stockStatus !== "available") return false;
  return true;
}

export function normaliseQuery(query: string): string[] {
  return query
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
    .slice(0, 8);
}

const haystackCache = new WeakMap<RecordItem, string>();

export function recordHaystack(record: RecordItem): string {
  let hay = haystackCache.get(record);
  if (!hay) {
    hay = [record.artist, record.title, record.label, record.catalogueNumber, ...record.genres, ...record.styles, String(record.releaseYear)]
      .join(" \u0001 ")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "");
    haystackCache.set(record, hay);
  }
  return hay;
}

/** Case-insensitive, partial, token-based AND match across artist/title/label/cat no./genre/style. */
export function matchesQuery(record: RecordItem, tokens: string[]): boolean {
  if (!tokens.length) return true;
  const hay = recordHaystack(record);
  return tokens.every((t) => hay.includes(t));
}

function compareStrings(a: string, b: string): number {
  return a.localeCompare(b, "en", { sensitivity: "base" });
}

export function comparatorFor(sort: SortKey, seed: string): (a: RecordItem, b: RecordItem) => number {
  const byId = (a: RecordItem, b: RecordItem) => compareStrings(a.id, b.id);
  switch (sort) {
    case "recent":
      return (a, b) => compareStrings(b.createdAt, a.createdAt) || byId(a, b);
    case "price-asc":
      return (a, b) => a.priceMinor - b.priceMinor || byId(a, b);
    case "price-desc":
      return (a, b) => b.priceMinor - a.priceMinor || byId(a, b);
    case "year-asc":
      return (a, b) => a.releaseYear - b.releaseYear || byId(a, b);
    case "year-desc":
      return (a, b) => b.releaseYear - a.releaseYear || byId(a, b);
    case "artist-az":
      return (a, b) => compareStrings(a.artist, b.artist) || compareStrings(a.title, b.title) || byId(a, b);
    case "random":
      return (a, b) => seededUnit(seed, a.id) - seededUnit(seed, b.id) || byId(a, b);
  }
}

export interface QueryInput {
  crate?: Crate | null;
  query?: string;
  filters?: RecordFilters;
  sort?: SortKey;
  sortSeed?: string;
}

/** Apply crate scope, search, filters and sort. Pure and deterministic. */
export function applyQuery(records: RecordItem[], input: QueryInput): RecordItem[] {
  const tokens = normaliseQuery(input.query ?? "");
  const filters = input.filters ?? EMPTY_FILTERS;
  const matched = records.filter(
    (r) => matchesCrate(r, input.crate) && matchesFilters(r, filters) && matchesQuery(r, tokens),
  );
  // Array.prototype.sort is stable; comparators also fall back to id for determinism.
  return matched.sort(comparatorFor(input.sort ?? "recent", input.sortSeed ?? "seed"));
}

/** Count of records matching a crate's definition (ignoring search/filters). */
export function countForCrate(records: RecordItem[], crate: Crate): number {
  let n = 0;
  for (const r of records) if (matchesCrate(r, crate)) n += 1;
  return n;
}

/** Facet values available in a store catalogue, for building filter controls. */
export function catalogFacets(records: RecordItem[]) {
  const genres = new Map<string, number>();
  const styles = new Map<string, number>();
  const years: number[] = [];
  let minPrice = Number.POSITIVE_INFINITY;
  let maxPrice = 0;
  for (const r of records) {
    for (const g of r.genres) genres.set(g, (genres.get(g) ?? 0) + 1);
    for (const s of r.styles) styles.set(s, (styles.get(s) ?? 0) + 1);
    years.push(r.releaseYear);
    if (r.priceMinor < minPrice) minPrice = r.priceMinor;
    if (r.priceMinor > maxPrice) maxPrice = r.priceMinor;
  }
  const sortedEntries = (m: Map<string, number>) =>
    [...m.entries()].sort((a, b) => b[1] - a[1] || compareStrings(a[0], b[0])).map(([value, count]) => ({ value, count }));
  return {
    genres: sortedEntries(genres),
    styles: sortedEntries(styles),
    years,
    minYear: years.length ? Math.min(...years) : undefined,
    maxYear: years.length ? Math.max(...years) : undefined,
    minPriceMinor: Number.isFinite(minPrice) ? minPrice : 0,
    maxPriceMinor: maxPrice,
  };
}

export function recordsById(records: RecordItem[]): Map<string, RecordItem> {
  const map = new Map<string, RecordItem>();
  for (const r of records) map.set(r.id, r);
  return map;
}
