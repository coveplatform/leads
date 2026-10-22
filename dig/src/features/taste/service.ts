import type { Db } from "@/lib/db/client";
import type { Catalogue } from "@/lib/catalogue/graph";
import { recordingLabelId, recordingPeople } from "@/lib/catalogue/graph";
import { EMPTY_TASTE, SIGNALS, type StableTaste } from "@/lib/ranking";
import { ApiError } from "@/lib/api/errors";

export interface Profile {
  principalId: string;
  handle: string | null;
  homeRegion: string | null;
  personalizationOptIn: boolean;
  personalizationStrength: "off" | "light" | "moderate";
  onboardingComplete: boolean;
  reducedMotion: boolean;
  highContrast: boolean;
}

type Row = Record<string, unknown>;

export async function getProfile(db: Db, principalId: string): Promise<Profile> {
  const r = await db.query<Row>("SELECT * FROM profiles WHERE principal_id = $1", [principalId]);
  const p = r.rows[0];
  if (!p) throw new ApiError("NOT_FOUND", "Profile not found");
  return {
    principalId,
    handle: (p.handle as string | null) ?? null,
    homeRegion: (p.home_region as string | null) ?? null,
    personalizationOptIn: Boolean(p.personalization_opt_in),
    personalizationStrength: p.personalization_strength as Profile["personalizationStrength"],
    onboardingComplete: Boolean(p.onboarding_complete),
    reducedMotion: Boolean(p.reduced_motion),
    highContrast: Boolean(p.high_contrast),
  };
}

export async function patchProfile(
  db: Db,
  principalId: string,
  patch: Partial<Omit<Profile, "principalId">>,
): Promise<Profile> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  const map: Record<string, string> = {
    handle: "handle",
    homeRegion: "home_region",
    personalizationOptIn: "personalization_opt_in",
    personalizationStrength: "personalization_strength",
    onboardingComplete: "onboarding_complete",
    reducedMotion: "reduced_motion",
    highContrast: "high_contrast",
  };
  for (const [k, col] of Object.entries(map)) {
    const v = (patch as Record<string, unknown>)[k];
    if (v !== undefined) {
      vals.push(v);
      sets.push(`${col} = $${vals.length}`);
    }
  }
  if (sets.length) {
    vals.push(principalId);
    await db.query(
      `UPDATE profiles SET ${sets.join(", ")}, updated_at = now() WHERE principal_id = $${vals.length}`,
      vals,
    );
  }
  return getProfile(db, principalId);
}

/** Record a stable signal only when the user has opted in. Returns true if written. */
export async function recordStableSignal(
  db: Db,
  cat: Catalogue,
  principalId: string,
  recordingId: string,
  type: "love" | "keep",
  eventId: string | null,
): Promise<boolean> {
  const profile = await getProfile(db, principalId);
  if (!profile.personalizationOptIn || profile.personalizationStrength === "off") return false;
  const strength = type === "love" ? SIGNALS.love_stable : SIGNALS.keep_stable;
  const rows: Array<[string, string]> = [["recording", recordingId]];
  for (const t of cat.recordingTags.get(recordingId) ?? []) rows.push(["tag", t]);
  for (const a of recordingPeople(cat, recordingId)) rows.push(["artist", a]);
  const label = recordingLabelId(cat, recordingId);
  if (label) rows.push(["label", label]);
  for (const [et, eid] of rows) {
    await db.query(
      `INSERT INTO taste_signals (principal_id, entity_type, entity_id, signal_type, strength, provenance_event_id) VALUES ($1,$2,$3,$4,$5,$6)`,
      [principalId, et, eid, type, strength.toFixed(3), eventId],
    );
  }
  return true;
}

/** Aggregate stable taste with slow decay (half-life ~180 days). Empty unless opted in. */
export async function loadStableTaste(db: Db, principalId: string): Promise<StableTaste> {
  const profile = await getProfile(db, principalId);
  if (!profile.personalizationOptIn || profile.personalizationStrength === "off")
    return EMPTY_TASTE;
  const r = await db.query<{
    entity_type: string;
    entity_id: string;
    strength: string;
    created_at: string;
  }>(
    "SELECT entity_type, entity_id, strength, created_at FROM taste_signals WHERE principal_id = $1 ORDER BY created_at DESC LIMIT 2000",
    [principalId],
  );
  const taste: StableTaste = {
    enabled: true,
    strength: profile.personalizationStrength,
    tagAffinity: {},
    artistAffinity: {},
    labelAffinity: {},
  };
  const now = Date.now();
  for (const row of r.rows) {
    const ageDays = (now - new Date(row.created_at).getTime()) / 86_400_000;
    const decayed = Number(row.strength) * Math.pow(0.5, ageDays / 180);
    const bucket =
      row.entity_type === "tag"
        ? taste.tagAffinity
        : row.entity_type === "artist"
          ? taste.artistAffinity
          : row.entity_type === "label"
            ? taste.labelAffinity
            : null;
    if (!bucket) continue;
    bucket[row.entity_id] = Math.max(
      -1,
      Math.min(1, (bucket[row.entity_id] ?? 0) + decayed * 0.25),
    );
  }
  return taste;
}

export async function tasteSummary(db: Db, cat: Catalogue, principalId: string) {
  const taste = await loadStableTaste(db, principalId);
  const count = await db.query<{ n: string }>(
    "SELECT count(*)::text AS n FROM taste_signals WHERE principal_id = $1",
    [principalId],
  );
  const top = (m: Record<string, number>, name: (id: string) => string | undefined) =>
    Object.entries(m)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([id, v]) => ({ id, name: name(id) ?? id, affinity: Math.round(v * 100) / 100 }));
  return {
    enabled: taste.enabled,
    strength: taste.strength,
    signalCount: Number(count.rows[0]?.n ?? 0),
    tags: top(taste.tagAffinity, (id) => cat.tags.get(id)?.name),
    artists: top(taste.artistAffinity, (id) => cat.artists.get(id)?.name),
    labels: top(taste.labelAffinity, (id) => cat.labels.get(id)?.name),
  };
}

export async function clearStableTaste(db: Db, principalId: string): Promise<void> {
  await db.query("DELETE FROM taste_signals WHERE principal_id = $1", [principalId]);
}
