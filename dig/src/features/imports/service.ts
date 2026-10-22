import type { Db } from "@/lib/db/client";
import {
  buildCard,
  getCatalogue,
  invalidateCatalogue,
  rowToSource,
  type Catalogue,
} from "@/lib/catalogue/graph";
import { ApiError } from "@/lib/api/errors";
import type { MusicSource, RecordCard, ResolveResult } from "@/domain/types";
import {
  InvalidUrlError,
  defaultDeps,
  normaliseForMatch,
  parseUserUrl,
  providerFor,
  type ProviderDeps,
} from "@/lib/providers";
import { playerConfigForSource } from "@/lib/providers/player";

type Row = Record<string, unknown>;

export interface MatchCandidate {
  recordingId: string;
  confidence: number;
  reason: string;
  card: RecordCard | null;
}

export interface ImportRecord {
  id: string;
  originalUrl: string;
  normalizedUrl: string;
  provider: string;
  status: "identified" | "needs_confirmation" | "unresolved" | "unsupported" | "failed_retryable";
  kind: "recording" | "release" | "mix" | "unresolved";
  title: string | null;
  artist: string | null;
  thumbnailUrl: string | null;
  confidence: number | null;
  errorCode: string | null;
  unsupportedReason: string | null;
  userTitle: string | null;
  userNotes: string | null;
  resolvedRecordingId: string | null;
  sourceId: string | null;
  source: MusicSource | null;
  player: ReturnType<typeof playerConfigForSource>;
  matchCandidates: MatchCandidate[];
  card: RecordCard | null;
  createdAt: string;
}

/** Thresholds (blueprint §11): placeholders to calibrate, not probabilities. */
export const THRESHOLDS = { auto: 0.92, confirm: 0.65 } as const;

export function matchAgainstCatalogue(
  cat: Catalogue,
  r: ResolveResult,
  existingSourceTarget: string | null,
): MatchCandidate[] {
  const out: MatchCandidate[] = [];
  if (existingSourceTarget)
    out.push({
      recordingId: existingSourceTarget,
      confidence: 0.96,
      reason: "This exact link is already attached to a record",
      card: buildCard(cat, existingSourceTarget),
    });
  if (!r.title) return out;
  const t = normaliseForMatch(r.title);
  const a = r.artist ? normaliseForMatch(r.artist) : null;
  for (const rec of cat.recordings.values()) {
    const rt = normaliseForMatch(rec.title + (rec.disambiguation ? ` ${rec.disambiguation}` : ""));
    const rtBare = normaliseForMatch(rec.title);
    const artist = rec.primaryArtistId ? cat.artists.get(rec.primaryArtistId) : undefined;
    const names = artist ? [artist.name, ...artist.aliases].map(normaliseForMatch) : [];
    const titleHit =
      t === rt ? 1 : t === rtBare ? 0.85 : t.includes(rtBare) && rtBare.length > 4 ? 0.6 : 0;
    if (!titleHit) continue;
    const artistHit = a
      ? names.includes(a)
        ? 1
        : names.some((n) => a.includes(n) || n.includes(a))
          ? 0.7
          : 0
      : 0.3;
    const conf = Math.round(Math.min(0.9, 0.35 * titleHit + 0.55 * artistHit) * 100) / 100;
    if (conf < 0.3) continue;
    const reason =
      artistHit >= 1 && titleHit >= 1
        ? "Artist and title match"
        : artistHit >= 1
          ? "Artist matches; title differs in version"
          : titleHit >= 1
            ? "Title matches; artist unconfirmed"
            : "Loose title match";
    out.push({ recordingId: rec.id, confidence: conf, reason, card: buildCard(cat, rec.id) });
  }
  return out
    .sort((x, y) => y.confidence - x.confidence || x.recordingId.localeCompare(y.recordingId))
    .slice(0, 5);
}

function toRecord(row: Row, cat: Catalogue, source: MusicSource | null): ImportRecord {
  const meta = (
    typeof row.extracted_metadata === "string"
      ? JSON.parse(row.extracted_metadata)
      : row.extracted_metadata
  ) as Record<string, unknown>;
  const cands = (
    typeof row.match_candidates === "string"
      ? JSON.parse(row.match_candidates)
      : row.match_candidates
  ) as Array<{ recordingId: string; confidence: number; reason: string }>;
  const resolved = (row.resolved_entity_id as string | null) ?? null;
  return {
    id: String(row.id),
    originalUrl: String(row.original_url),
    normalizedUrl: String(row.normalized_url),
    provider: String(row.provider),
    status: row.status as ImportRecord["status"],
    kind: row.kind as ImportRecord["kind"],
    title: (meta.title as string | undefined) ?? null,
    artist: (meta.artist as string | undefined) ?? null,
    thumbnailUrl: (meta.thumbnailUrl as string | undefined) ?? null,
    confidence:
      row.confidence === null || row.confidence === undefined ? null : Number(row.confidence),
    errorCode: (row.error_code as string | null) ?? null,
    unsupportedReason: (meta.unsupportedReason as string | undefined) ?? null,
    userTitle: (row.user_title as string | null) ?? null,
    userNotes: (row.user_notes as string | null) ?? null,
    resolvedRecordingId: resolved,
    sourceId: (row.music_source_id as string | null) ?? null,
    source,
    player: playerConfigForSource(source),
    matchCandidates: cands.map((c) => ({ ...c, card: buildCard(cat, c.recordingId) })),
    card: resolved ? buildCard(cat, resolved) : null,
    createdAt: new Date(String(row.created_at)).toISOString(),
  };
}

async function upsertSource(db: Db, r: ResolveResult, targetId: string | null): Promise<string> {
  const embedType =
    r.provider === "youtube" || r.provider === "soundcloud" || r.provider === "bandcamp"
      ? r.provider
      : "none";
  const playability =
    r.playback === "embed" ? "embeddable" : r.playback === "external" ? "external_only" : "unknown";
  const targetType = targetId ? "recording" : r.kind === "mix" ? "mix" : "unresolved";
  if (r.externalId) {
    const existing = await db.query<{ id: string }>(
      "SELECT id FROM music_sources WHERE provider = $1 AND external_id = $2",
      [r.provider, r.externalId],
    );
    if (existing.rows[0]) {
      if (targetId)
        await db.query(
          "UPDATE music_sources SET target_type = 'recording', target_id = $2, updated_at = now() WHERE id = $1",
          [existing.rows[0].id, targetId],
        );
      return existing.rows[0].id;
    }
  }
  const ins = await db.query<{ id: string }>(
    `INSERT INTO music_sources (provider, external_id, canonical_url, target_type, target_id, display_title, display_artist, thumbnail_url, embed_type, embed_url, playability, rights_status, attribution, last_verified_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, CASE WHEN $6::text IS NULL THEN NULL ELSE now() END) RETURNING id`,
    [
      r.provider,
      r.externalId ?? null,
      r.canonicalUrl,
      targetType,
      targetId,
      r.title ?? null,
      r.artist ?? null,
      r.thumbnailUrl ?? null,
      r.playback === "embed" ? embedType : "none",
      r.embedUrl ?? null,
      playability,
      r.playback === "embed" ? "provider_embed" : "link_only",
      r.attribution ?? null,
    ],
  );
  return ins.rows[0]!.id;
}

export async function submitImports(
  db: Db,
  principalId: string,
  urls: string[],
  deps: ProviderDeps = defaultDeps(),
): Promise<ImportRecord[]> {
  const cat = await getCatalogue(db);
  const out: ImportRecord[] = [];
  for (const raw of urls.slice(0, 20)) {
    let url: URL;
    try {
      url = parseUserUrl(raw);
    } catch (e) {
      const row = await db.query<Row>(
        `INSERT INTO imports (principal_id, original_url, normalized_url, provider, status, kind, extracted_metadata, error_code) VALUES ($1,$2,$2,'generic','unsupported','unresolved',$3::jsonb,'VALIDATION') RETURNING *`,
        [
          principalId,
          raw.slice(0, 2000),
          JSON.stringify({
            unsupportedReason: e instanceof InvalidUrlError ? e.message : "Invalid URL",
          }),
        ],
      );
      out.push(toRecord(row.rows[0]!, cat, null));
      continue;
    }
    const provider = providerFor(url);
    let r: ResolveResult;
    let status: ImportRecord["status"];
    try {
      r = await provider.resolve(url, deps);
    } catch {
      r = {
        originalUrl: raw,
        canonicalUrl: url.toString(),
        provider: provider.name,
        confidence: 0,
        kind: "unresolved",
        playback: "external",
        requiresConfirmation: false,
        unsupportedReason: "Provider unavailable; kept the link, try again later",
      };
    }
    const existing = r.externalId
      ? await db.query<{ target_id: string | null; target_type: string }>(
          "SELECT target_id, target_type FROM music_sources WHERE provider = $1 AND external_id = $2",
          [r.provider, r.externalId],
        )
      : { rows: [] as Array<{ target_id: string | null; target_type: string }> };
    const existingTarget =
      existing.rows[0]?.target_type === "recording" ? existing.rows[0].target_id : null;
    const candidates = r.kind === "mix" ? [] : matchAgainstCatalogue(cat, r, existingTarget);
    const top = candidates[0];
    let resolved: string | null = null;
    let confidence = top?.confidence ?? r.confidence;
    if (r.unsupportedReason && r.kind === "unresolved" && !r.externalId) status = "unsupported";
    else if (r.kind === "mix") status = "unresolved";
    else if (top && top.confidence >= THRESHOLDS.auto) {
      status = "identified";
      resolved = top.recordingId;
    } else if (top && top.confidence >= THRESHOLDS.confirm) status = "needs_confirmation";
    else status = "unresolved";
    if (r.unsupportedReason?.startsWith("Provider unavailable")) {
      status = "failed_retryable";
      confidence = 0;
    }
    const sourceId = await upsertSource(db, r, resolved);
    const row = await db.query<Row>(
      `INSERT INTO imports (principal_id, original_url, normalized_url, provider, status, kind, extracted_metadata, match_candidates, resolved_entity_id, music_source_id, confidence, error_code)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10,$11,$12) RETURNING *`,
      [
        principalId,
        raw.slice(0, 2000),
        r.canonicalUrl,
        r.provider,
        status,
        r.kind,
        JSON.stringify({
          title: r.title,
          artist: r.artist,
          thumbnailUrl: r.thumbnailUrl,
          unsupportedReason: r.unsupportedReason,
          startSeconds: r.startSeconds,
          attribution: r.attribution,
        }),
        JSON.stringify(candidates.map(({ card: _c, ...rest }) => rest)),
        resolved,
        sourceId,
        confidence === undefined ? null : Math.round(confidence * 100) / 100,
        status === "failed_retryable" ? "PROVIDER_UNAVAILABLE" : null,
      ],
    );
    const src = await db.query<Row>("SELECT * FROM music_sources WHERE id = $1", [sourceId]);
    out.push(toRecord(row.rows[0]!, cat, src.rows[0] ? rowToSource(src.rows[0]) : null));
  }
  if (out.some((i) => i.status === "identified")) invalidateCatalogue();
  return out;
}

export async function listImports(
  db: Db,
  principalId: string,
  status?: string,
): Promise<ImportRecord[]> {
  const cat = await getCatalogue(db);
  const params: unknown[] = [principalId];
  let where = "i.principal_id = $1";
  if (status) {
    params.push(status);
    where += ` AND i.status = $${params.length}`;
  }
  const r = await db.query<Row>(
    `SELECT i.*, row_to_json(s.*) AS src FROM imports i LEFT JOIN music_sources s ON s.id = i.music_source_id WHERE ${where} ORDER BY i.created_at DESC LIMIT 200`,
    params,
  );
  return r.rows.map((row) =>
    toRecord(
      row,
      cat,
      row.src
        ? rowToSource((typeof row.src === "string" ? JSON.parse(row.src) : row.src) as Row)
        : null,
    ),
  );
}

async function requireImport(db: Db, principalId: string, id: string): Promise<Row> {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new ApiError("NOT_FOUND", "No such import");
  const r = await db.query<Row>("SELECT * FROM imports WHERE id = $1", [id]);
  const row = r.rows[0];
  if (!row) throw new ApiError("NOT_FOUND", "No such import");
  if (String(row.principal_id) !== principalId)
    throw new ApiError("FORBIDDEN", "That import belongs to someone else");
  return row;
}

/** User confirms (or rejects) a canonical match. entityId null => keep as Unidentified Find. */
export async function confirmImport(
  db: Db,
  principalId: string,
  id: string,
  entityId: string | null,
): Promise<ImportRecord> {
  const cat = await getCatalogue(db);
  const row = await requireImport(db, principalId, id);
  if (entityId && !cat.recordings.has(entityId))
    throw new ApiError("NOT_FOUND", "Unknown recording");
  if (entityId) {
    await db.query(
      "UPDATE imports SET status = 'identified', kind = 'recording', resolved_entity_id = $2, confidence = 1, updated_at = now() WHERE id = $1",
      [id, entityId],
    );
    if (row.music_source_id)
      await db.query(
        "UPDATE music_sources SET target_type = 'recording', target_id = $2, updated_at = now() WHERE id = $1",
        [row.music_source_id, entityId],
      );
    invalidateCatalogue();
  } else {
    await db.query(
      "UPDATE imports SET status = 'unresolved', resolved_entity_id = NULL, match_candidates = '[]'::jsonb, updated_at = now() WHERE id = $1",
      [id],
    );
  }
  return (await listImports(db, principalId)).find((i) => i.id === id)!;
}

export async function patchImport(
  db: Db,
  principalId: string,
  id: string,
  patch: { userTitle?: string | null; userNotes?: string | null },
): Promise<ImportRecord> {
  const row = await requireImport(db, principalId, id);
  if (patch.userTitle !== undefined) {
    await db.query("UPDATE imports SET user_title = $2, updated_at = now() WHERE id = $1", [
      id,
      patch.userTitle,
    ]);
    if (row.music_source_id && patch.userTitle)
      await db.query(
        "UPDATE music_sources SET display_title = $2 WHERE id = $1 AND target_type <> 'recording'",
        [row.music_source_id, patch.userTitle],
      );
  }
  if (patch.userNotes !== undefined)
    await db.query("UPDATE imports SET user_notes = $2, updated_at = now() WHERE id = $1", [
      id,
      patch.userNotes,
    ]);
  return (await listImports(db, principalId)).find((i) => i.id === id)!;
}

export async function deleteImport(db: Db, principalId: string, id: string): Promise<void> {
  await requireImport(db, principalId, id);
  await db.query("DELETE FROM imports WHERE id = $1", [id]);
}
