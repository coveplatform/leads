import { z } from "zod";
import { RecordFiltersSchema, SORT_KEYS, VIEW_MODES, ThemeTokensSchema, type ThemeTokens } from "@/domain/types";
import type { PersistedSession } from "@/domain/browse-reducer";

/**
 * Versioned localStorage persistence scoped by store slug. Everything read back is validated;
 * malformed or stale data is discarded rather than crashing the page.
 */

const SLUG = /^[a-z0-9-]{1,64}$/;

export const pileKey = (slug: string) => `digcrates:pile:${slug}:v1`;
export const sessionKey = (slug: string) => `digcrates:session:${slug}:v1`;
export const themeDraftKey = (slug: string) => `digcrates:theme-draft:${slug}:v1`;
export const SORT_SEED_KEY = "digcrates:sortseed:v1";

const PileSchema = z.object({ version: z.literal(1), recordIds: z.array(z.string().max(64)).max(500) });

const SessionSchema = z.object({
  version: z.literal(1),
  crateId: z.string().max(80).nullable(),
  viewMode: z.enum(VIEW_MODES),
  query: z.string().max(120),
  filters: RecordFiltersSchema,
  sort: z.enum(SORT_KEYS),
  focusedRecordId: z.string().max(64).nullable(),
  cratePositions: z.record(z.string().max(80), z.string().max(64)).default({}),
  savedAt: z.string(),
});

function storage(kind: "local" | "session" = "local"): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

function readJson(key: string, kind: "local" | "session" = "local"): unknown {
  try {
    const raw = storage(kind)?.getItem(key);
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown, kind: "local" | "session" = "local"): void {
  try {
    storage(kind)?.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore quota / privacy mode failures */
  }
}

export function parsePile(raw: unknown): string[] {
  const parsed = PileSchema.safeParse(raw);
  if (!parsed.success) return [];
  return [...new Set(parsed.data.recordIds)];
}

export function loadPile(slug: string): string[] {
  if (!SLUG.test(slug)) return [];
  return parsePile(readJson(pileKey(slug)));
}

export function savePile(slug: string, recordIds: string[]): void {
  if (!SLUG.test(slug)) return;
  writeJson(pileKey(slug), { version: 1, recordIds: [...new Set(recordIds)].slice(0, 500) });
}

export function parseSession(raw: unknown): PersistedSession | null {
  const parsed = SessionSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function loadSession(slug: string): PersistedSession | null {
  if (!SLUG.test(slug)) return null;
  return parseSession(readJson(sessionKey(slug)));
}

export function saveSession(slug: string, session: PersistedSession): void {
  if (!SLUG.test(slug)) return;
  writeJson(sessionKey(slug), session);
}

export function clearSession(slug: string): void {
  try {
    storage()?.removeItem(sessionKey(slug));
  } catch {
    /* ignore */
  }
}

export function loadThemeDraft(slug: string): ThemeTokens | null {
  const parsed = ThemeTokensSchema.safeParse(readJson(themeDraftKey(slug)));
  return parsed.success ? parsed.data : null;
}

export function saveThemeDraft(slug: string, theme: ThemeTokens): void {
  writeJson(themeDraftKey(slug), theme);
}

export function clearThemeDraft(slug: string): void {
  try {
    storage()?.removeItem(themeDraftKey(slug));
  } catch {
    /* ignore */
  }
}

/** The seeded-shuffle seed persists for the browser session so random order stays stable. */
export function loadOrCreateSortSeed(create: () => string): string {
  const existing = readJson(SORT_SEED_KEY, "session");
  if (typeof existing === "string" && existing.length > 0 && existing.length < 64) return existing;
  const seed = create();
  writeJson(SORT_SEED_KEY, seed, "session");
  return seed;
}
