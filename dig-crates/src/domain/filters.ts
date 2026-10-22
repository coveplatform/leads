import { EMPTY_FILTERS, FORMATS, CONDITIONS, SORT_KEYS, type RecordFilters, type SortKey, type Format, type Condition } from "./types";

export function isDefaultFilters(filters: RecordFilters): boolean {
  return countActiveFilters(filters) === 0;
}

/** Number of distinct filter groups that are active, used for badges and the "too many filters" hint. */
export function countActiveFilters(filters: RecordFilters): number {
  let count = 0;
  if (filters.genre.length) count += 1;
  if (filters.style.length) count += 1;
  if (filters.yearFrom !== undefined || filters.yearTo !== undefined) count += 1;
  if (filters.priceMinMinor !== undefined || filters.priceMaxMinor !== undefined) count += 1;
  if (filters.formats.length) count += 1;
  if (filters.condition.length) count += 1;
  if (filters.previewOnly) count += 1;
  if (filters.availableOnly) count += 1;
  return count;
}

export interface FilterChip {
  key: string;
  label: string;
  /** Returns the filters with this chip removed. */
  remove: (f: RecordFilters) => RecordFilters;
}

export function filterChips(filters: RecordFilters, formatMinor: (minor: number) => string): FilterChip[] {
  const chips: FilterChip[] = [];
  for (const g of filters.genre) {
    chips.push({ key: `genre:${g}`, label: g, remove: (f) => ({ ...f, genre: f.genre.filter((x) => x !== g) }) });
  }
  for (const s of filters.style) {
    chips.push({ key: `style:${s}`, label: s, remove: (f) => ({ ...f, style: f.style.filter((x) => x !== s) }) });
  }
  if (filters.yearFrom !== undefined || filters.yearTo !== undefined) {
    const label =
      filters.yearFrom !== undefined && filters.yearTo !== undefined
        ? `${filters.yearFrom}–${filters.yearTo}`
        : filters.yearFrom !== undefined
          ? `From ${filters.yearFrom}`
          : `Up to ${filters.yearTo}`;
    chips.push({ key: "year", label, remove: (f) => ({ ...f, yearFrom: undefined, yearTo: undefined }) });
  }
  if (filters.priceMinMinor !== undefined || filters.priceMaxMinor !== undefined) {
    const label =
      filters.priceMinMinor !== undefined && filters.priceMaxMinor !== undefined
        ? `${formatMinor(filters.priceMinMinor)}–${formatMinor(filters.priceMaxMinor)}`
        : filters.priceMinMinor !== undefined
          ? `From ${formatMinor(filters.priceMinMinor)}`
          : `Under ${formatMinor(filters.priceMaxMinor ?? 0)}`;
    chips.push({ key: "price", label, remove: (f) => ({ ...f, priceMinMinor: undefined, priceMaxMinor: undefined }) });
  }
  for (const fm of filters.formats) {
    chips.push({ key: `format:${fm}`, label: fm, remove: (f) => ({ ...f, formats: f.formats.filter((x) => x !== fm) }) });
  }
  for (const c of filters.condition) {
    chips.push({ key: `cond:${c}`, label: `Media ${c}`, remove: (f) => ({ ...f, condition: f.condition.filter((x) => x !== c) }) });
  }
  if (filters.previewOnly) chips.push({ key: "preview", label: "With preview", remove: (f) => ({ ...f, previewOnly: false }) });
  if (filters.availableOnly) chips.push({ key: "available", label: "In stock only", remove: (f) => ({ ...f, availableOnly: false }) });
  return chips;
}

/** Decade presets for the year filter. */
export function decadePresets(years: number[]): Array<{ label: string; from: number; to: number }> {
  if (!years.length) return [];
  const min = Math.min(...years);
  const max = Math.max(...years);
  const start = Math.floor(min / 10) * 10;
  const presets: Array<{ label: string; from: number; to: number }> = [];
  for (let d = start; d <= max; d += 10) {
    presets.push({ label: `${String(d).slice(2)}s`, from: d, to: d + 9 });
  }
  return presets;
}

const num = (v: string | null | undefined): number | undefined => {
  if (v === null || v === undefined || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

const list = (v: string | null | undefined): string[] =>
  v ? v.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 20) : [];

/** Parse URLSearchParams into a filters object. Invalid values are dropped rather than throwing. */
export function filtersFromSearchParams(params: URLSearchParams): RecordFilters {
  return {
    genre: list(params.get("genre")),
    style: list(params.get("style")),
    yearFrom: num(params.get("yearFrom")),
    yearTo: num(params.get("yearTo")),
    priceMinMinor: num(params.get("priceMin")),
    priceMaxMinor: num(params.get("priceMax")),
    formats: list(params.get("format")).filter((f): f is Format => (FORMATS as readonly string[]).includes(f)),
    condition: list(params.get("condition")).filter((c): c is Condition => (CONDITIONS as readonly string[]).includes(c)),
    previewOnly: params.get("preview") === "1",
    availableOnly: params.get("available") === "1",
  };
}

export function filtersToSearchParams(filters: RecordFilters, params = new URLSearchParams()): URLSearchParams {
  const set = (k: string, v: string | undefined) => {
    if (v === undefined || v === "") params.delete(k);
    else params.set(k, v);
  };
  set("genre", filters.genre.join(",") || undefined);
  set("style", filters.style.join(",") || undefined);
  set("yearFrom", filters.yearFrom?.toString());
  set("yearTo", filters.yearTo?.toString());
  set("priceMin", filters.priceMinMinor?.toString());
  set("priceMax", filters.priceMaxMinor?.toString());
  set("format", filters.formats.join(",") || undefined);
  set("condition", filters.condition.join(",") || undefined);
  set("preview", filters.previewOnly ? "1" : undefined);
  set("available", filters.availableOnly ? "1" : undefined);
  return params;
}

export function parseSortKey(value: string | null | undefined, fallback: SortKey = "recent"): SortKey {
  return value && (SORT_KEYS as readonly string[]).includes(value) ? (value as SortKey) : fallback;
}

export const SORT_LABELS: Record<SortKey, string> = {
  recent: "Recently added",
  "price-asc": "Price: low to high",
  "price-desc": "Price: high to low",
  "year-asc": "Year: oldest first",
  "year-desc": "Year: newest first",
  "artist-az": "Artist A–Z",
  random: "Shuffle (seeded)",
};

export { EMPTY_FILTERS };
