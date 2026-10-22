import { z } from "zod";

/**
 * Runtime-validated model contracts for DIG Crates.
 * Everything here is fixture-backed demo data; see the blueprint section 8.1.
 */

export const VIEW_MODES = ["crate", "wall", "listen"] as const;
export const FORMATS = ["LP", "12-inch", "7-inch", "EP"] as const;
export const CONDITIONS = ["M", "NM", "VG+", "VG", "G+", "G"] as const;
export const CURRENCIES = ["AUD", "GBP", "EUR", "USD"] as const;
export const SORT_KEYS = ["recent", "price-asc", "price-desc", "year-asc", "year-desc", "artist-az", "random"] as const;

export type ViewMode = (typeof VIEW_MODES)[number];
export type Format = (typeof FORMATS)[number];
export type Condition = (typeof CONDITIONS)[number];
export type Currency = (typeof CURRENCIES)[number];
export type SortKey = (typeof SORT_KEYS)[number];

const hexColour = z
  .string()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Colour must be a #rgb or #rrggbb hex value");

/** Font families are plain family lists only; never arbitrary CSS. */
export const fontFamily = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[A-Za-z0-9 ,'"-]+$/, "Font family may only contain letters, digits, spaces, commas, quotes and hyphens");

export const ThemeTokensSchema = z.object({
  background: hexColour,
  surface: hexColour,
  surfaceRaised: hexColour,
  foreground: hexColour,
  foregroundMuted: hexColour,
  accent: hexColour,
  accentForeground: hexColour,
  border: hexColour,
  focusRing: hexColour,
  fontDisplay: fontFamily,
  fontBody: fontFamily,
  buttonRadius: z.number().int().min(0).max(40),
  cardRadius: z.number().int().min(0).max(40),
  coverRadius: z.number().int().min(0).max(40),
  shadowStyle: z.enum(["none", "soft", "strong"]),
  headerStyle: z.enum(["minimal", "editorial", "bold"]),
});
export type ThemeTokens = z.infer<typeof ThemeTokensSchema>;

/** Logo and asset URLs must be same-origin relative paths in the demo. */
const assetPath = z.string().regex(/^\/[A-Za-z0-9/_.-]*$/, "Asset URLs must be relative paths");

export const StoreSchema = z.object({
  id: z.string().min(1),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1).max(80),
  headline: z.string().max(160),
  description: z.string().max(400),
  logoUrl: assetPath.nullable(),
  logoVariant: z.enum(["light", "dark", "auto"]).default("auto"),
  currency: z.enum(CURRENCIES),
  country: z.string(),
  allowedEmbedOrigins: z.array(z.string().url()).max(20),
  theme: ThemeTokensSchema,
  crateIds: z.array(z.string()),
});
export type Store = z.infer<typeof StoreSchema>;

export const TrackSchema = z.object({
  position: z.string().max(8),
  title: z.string().max(120),
  durationSec: z.number().int().nonnegative().optional(),
});

export const PreviewSchema = z
  .object({
    type: z.literal("local-demo"),
    url: assetPath,
    durationSec: z.number().positive(),
  })
  .nullable();

export const RecordItemSchema = z.object({
  id: z.string().min(1),
  storeId: z.string().min(1),
  artist: z.string().min(1).max(120),
  title: z.string().min(1).max(160),
  label: z.string().min(1).max(80),
  catalogueNumber: z.string().max(40),
  releaseYear: z.number().int().min(1900).max(2100),
  format: z.enum(FORMATS),
  genres: z.array(z.string()).min(1),
  styles: z.array(z.string()),
  tags: z.array(z.string()),
  bpm: z.number().int().positive().nullable().optional(),
  conditionMedia: z.enum(CONDITIONS),
  conditionSleeve: z.enum(CONDITIONS),
  priceMinor: z.number().int().nonnegative(),
  currency: z.enum(CURRENCIES),
  stockStatus: z.enum(["available", "sold"]),
  newArrival: z.boolean(),
  staffPick: z.boolean(),
  artworkUrl: assetPath.nullable(),
  tracklist: z.array(TrackSchema),
  description: z.string().max(600).optional(),
  preview: PreviewSchema,
  productUrl: z.string().url().nullable(),
  /** Optional explicit staff-curated links to other record ids in the same store. */
  staffLinks: z.array(z.string()).optional(),
  createdAt: z.string().datetime(),
});
export type RecordItem = z.infer<typeof RecordItemSchema>;

export const CrateDefinitionSchema = z.object({
  genres: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  newArrival: z.boolean().optional(),
  staffPick: z.boolean().optional(),
  maxPriceMinor: z.number().int().nonnegative().optional(),
});

export const CrateSchema = z.object({
  id: z.string().min(1),
  storeId: z.string().min(1),
  name: z.string().min(1).max(60),
  description: z.string().max(200),
  coverRecordIds: z.array(z.string()).max(8),
  definition: CrateDefinitionSchema,
  displayOrder: z.number().int(),
});
export type Crate = z.infer<typeof CrateSchema>;

export const SeedFileSchema = z.object({
  schemaVersion: z.literal(1),
  disclaimer: z.string(),
  stores: z.array(StoreSchema),
  crates: z.array(CrateSchema),
  records: z.array(RecordItemSchema),
});
export type SeedFile = z.infer<typeof SeedFileSchema>;

export const RecordFiltersSchema = z.object({
  genre: z.array(z.string().max(40)).max(20),
  style: z.array(z.string().max(40)).max(20),
  yearFrom: z.number().int().min(1900).max(2100).optional(),
  yearTo: z.number().int().min(1900).max(2100).optional(),
  priceMinMinor: z.number().int().nonnegative().optional(),
  priceMaxMinor: z.number().int().nonnegative().optional(),
  formats: z.array(z.enum(FORMATS)).max(4),
  condition: z.array(z.enum(CONDITIONS)).max(6),
  previewOnly: z.boolean(),
  availableOnly: z.boolean(),
});
export type RecordFilters = z.infer<typeof RecordFiltersSchema>;

export const EMPTY_FILTERS: RecordFilters = {
  genre: [],
  style: [],
  formats: [],
  condition: [],
  previewOnly: false,
  availableOnly: false,
};

export interface CatalogSnapshot {
  store: Store;
  crates: Crate[];
  records: RecordItem[];
}

export interface CatalogQuery {
  crateId?: string | null;
  query?: string;
  filters?: Partial<RecordFilters>;
  sort?: SortKey;
  sortSeed?: string;
  limit?: number;
  cursor?: string;
}

export interface RelatedRecord {
  record: RecordItem;
  score: number;
  reasons: string[];
}

export interface CatalogRepository {
  listStores(): Promise<Store[]>;
  getStore(slug: string): Promise<Store | null>;
  listCrates(storeId: string): Promise<Crate[]>;
  listRecords(
    storeId: string,
    q: CatalogQuery,
  ): Promise<{ items: RecordItem[]; total: number; nextCursor?: string }>;
  getRecord(storeId: string, recordId: string): Promise<RecordItem | null>;
  related(storeId: string, recordId: string, options?: { availableOnly?: boolean }): Promise<RelatedRecord[]>;
  /** Full catalogue snapshot for the client-side browsing engine. */
  getSnapshot(slug: string): Promise<CatalogSnapshot | null>;
}
