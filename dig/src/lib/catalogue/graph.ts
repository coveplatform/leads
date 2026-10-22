/**
 * In-memory view of the catalogue graph.
 *
 * Postgres is the source of truth; this loader snapshots the (bounded, Phase 1)
 * catalogue so the ranking engine can run as pure, deterministic functions.
 * ADR-0002 documents when to swap in SQL retrieval.
 */
import type { Db } from "@/lib/db/client";
import type {
  Artist,
  Label,
  MusicEdge,
  MusicSource,
  RecordCard,
  Recording,
  RelationType,
  Release,
  Tag,
} from "@/domain/types";

export interface Adjacent {
  edge: MusicEdge;
  /** The recording on the other end. */
  to: string;
  /** true when `to` is edge.to (we travelled from→to). */
  forward: boolean;
}

export interface Catalogue {
  recordings: Map<string, Recording>;
  artists: Map<string, Artist>;
  labels: Map<string, Label>;
  releases: Map<string, Release>;
  tags: Map<string, Tag>;
  sources: Map<string, MusicSource[]>; // by recording id
  sourceById: Map<string, MusicSource>;
  credits: Map<string, Array<{ artistId: string; role: string }>>;
  recordingTags: Map<string, string[]>; // recording -> tag ids
  recordingRelease: Map<string, string>; // recording -> release id
  adjacency: Map<string, Adjacent[]>;
  curations: Map<string, { slug: string; title: string; items: string[] }>;
  recordingCurations: Map<string, string[]>; // recording -> curation set ids
  aliasGroup: Map<string, string>; // artist -> group root
  loadedAt: number;
}

const g = globalThis as unknown as { __digCatalogue?: Promise<Catalogue> | undefined };

export function invalidateCatalogue(): void {
  g.__digCatalogue = undefined;
}

export function getCatalogue(db: Db): Promise<Catalogue> {
  if (!g.__digCatalogue) {
    g.__digCatalogue = loadCatalogue(db);
    g.__digCatalogue.catch(() => (g.__digCatalogue = undefined));
  }
  return g.__digCatalogue;
}

type Row = Record<string, unknown>;
const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));

export async function loadCatalogue(db: Db): Promise<Catalogue> {
  const [rec, art, aliases, lab, rel, relRec, tags, etags, cred, src, edges, csets, citems, arel] =
    await Promise.all([
      db.query<Row>("SELECT * FROM recordings WHERE visibility = 'public'"),
      db.query<Row>("SELECT * FROM artists WHERE status = 'active'"),
      db.query<Row>("SELECT * FROM artist_aliases"),
      db.query<Row>("SELECT * FROM labels"),
      db.query<Row>("SELECT * FROM releases"),
      db.query<Row>("SELECT * FROM release_recordings"),
      db.query<Row>("SELECT * FROM tags"),
      db.query<Row>("SELECT * FROM entity_tags WHERE entity_type = 'recording'"),
      db.query<Row>("SELECT * FROM recording_artists"),
      db.query<Row>(
        "SELECT * FROM music_sources WHERE target_type IN ('recording','mix','unresolved')",
      ),
      db.query<Row>(
        "SELECT * FROM music_edges WHERE from_type = 'recording' AND to_type = 'recording'",
      ),
      db.query<Row>("SELECT * FROM curation_sets"),
      db.query<Row>(
        "SELECT * FROM curation_items WHERE recording_id IS NOT NULL ORDER BY set_id, position",
      ),
      db.query<Row>("SELECT * FROM artist_relations WHERE type IN ('alias','member_of')"),
    ]);

  const aliasMap = new Map<string, string[]>();
  for (const a of aliases.rows) {
    const id = String(a.artist_id);
    aliasMap.set(id, [...(aliasMap.get(id) ?? []), String(a.alias)]);
  }
  const artists = new Map<string, Artist>();
  for (const a of art.rows) {
    const id = String(a.id);
    artists.set(id, {
      id,
      name: String(a.name),
      aliases: aliasMap.get(id) ?? [],
      country: (a.country as string | null) ?? null,
    });
  }
  const labels = new Map<string, Label>();
  for (const l of lab.rows)
    labels.set(String(l.id), {
      id: String(l.id),
      name: String(l.name),
      country: (l.country as string | null) ?? null,
    });
  const releases = new Map<string, Release>();
  for (const r of rel.rows) {
    releases.set(String(r.id), {
      id: String(r.id),
      title: String(r.title),
      releaseType: String(r.release_type),
      labelId: (r.label_id as string | null) ?? null,
      catalogueNumber: (r.catalogue_number as string | null) ?? null,
      releaseYear:
        r.release_year === null || r.release_year === undefined ? null : Number(r.release_year),
      country: (r.country as string | null) ?? null,
      artworkUrl: (r.artwork_url as string | null) ?? null,
    });
  }
  const recordingRelease = new Map<string, string>();
  for (const rr of relRec.rows)
    recordingRelease.set(String(rr.recording_id), String(rr.release_id));
  const tagMap = new Map<string, Tag>();
  for (const t of tags.rows)
    tagMap.set(String(t.id), {
      id: String(t.id),
      slug: String(t.slug),
      name: String(t.name),
      kind: t.kind as Tag["kind"],
    });
  const recordingTags = new Map<string, string[]>();
  for (const et of etags.rows) {
    const id = String(et.entity_id);
    recordingTags.set(id, [...(recordingTags.get(id) ?? []), String(et.tag_id)]);
  }
  const credits = new Map<string, Array<{ artistId: string; role: string }>>();
  for (const c of cred.rows) {
    const id = String(c.recording_id);
    credits.set(id, [
      ...(credits.get(id) ?? []),
      { artistId: String(c.artist_id), role: String(c.role) },
    ]);
  }
  const recordings = new Map<string, Recording>();
  for (const r of rec.rows) {
    recordings.set(String(r.id), {
      id: String(r.id),
      title: String(r.canonical_title),
      disambiguation: (r.disambiguation as string | null) ?? null,
      year:
        r.first_release_year === null || r.first_release_year === undefined
          ? null
          : Number(r.first_release_year),
      primaryArtistId: (r.primary_artist_id as string | null) ?? null,
      metadataConfidence: num(r.metadata_confidence),
      isDemo: Boolean(r.is_demo),
    });
  }
  const sources = new Map<string, MusicSource[]>();
  const sourceById = new Map<string, MusicSource>();
  for (const s of src.rows) {
    const ms = rowToSource(s);
    sourceById.set(ms.id, ms);
    if (ms.targetId && ms.targetType === "recording")
      sources.set(ms.targetId, [...(sources.get(ms.targetId) ?? []), ms]);
  }
  for (const list of sources.values())
    list.sort((a, b) => playRank(a) - playRank(b) || a.id.localeCompare(b.id));

  const adjacency = new Map<string, Adjacent[]>();
  for (const e of edges.rows) {
    const edge: MusicEdge = {
      id: String(e.id),
      fromType: String(e.from_type),
      fromId: String(e.from_id),
      toType: String(e.to_type),
      toId: String(e.to_id),
      relationType: e.relation_type as RelationType,
      weight: num(e.weight),
      provenance: e.provenance as MusicEdge["provenance"],
      provenanceRef: (e.provenance_ref as string | null) ?? null,
      confidence: num(e.confidence),
      explanationTemplate: (e.explanation_template as string | null) ?? null,
    };
    if (!recordings.has(edge.fromId) || !recordings.has(edge.toId)) continue;
    adjacency.set(edge.fromId, [
      ...(adjacency.get(edge.fromId) ?? []),
      { edge, to: edge.toId, forward: true },
    ]);
    adjacency.set(edge.toId, [
      ...(adjacency.get(edge.toId) ?? []),
      { edge, to: edge.fromId, forward: false },
    ]);
  }
  for (const list of adjacency.values()) list.sort((a, b) => a.edge.id.localeCompare(b.edge.id));

  const curations = new Map<string, { slug: string; title: string; items: string[] }>();
  for (const c of csets.rows)
    curations.set(String(c.id), { slug: String(c.slug), title: String(c.title), items: [] });
  const recordingCurations = new Map<string, string[]>();
  for (const ci of citems.rows) {
    const set = curations.get(String(ci.set_id));
    const rid = String(ci.recording_id);
    if (!set) continue;
    set.items.push(rid);
    recordingCurations.set(rid, [...(recordingCurations.get(rid) ?? []), String(ci.set_id)]);
  }

  const parent = new Map<string, string>();
  const find = (x: string): string => {
    const p = parent.get(x) ?? x;
    if (p === x) return x;
    const r = find(p);
    parent.set(x, r);
    return r;
  };
  for (const r of arel.rows)
    parent.set(find(String(r.from_artist_id)), find(String(r.to_artist_id)));
  const aliasGroup = new Map<string, string>();
  for (const id of artists.keys()) aliasGroup.set(id, find(id));

  return {
    recordings,
    artists,
    labels,
    releases,
    tags: tagMap,
    sources,
    sourceById,
    credits,
    recordingTags,
    recordingRelease,
    adjacency,
    curations,
    recordingCurations,
    aliasGroup,
    loadedAt: Date.now(),
  };
}

export function rowToSource(s: Row): MusicSource {
  return {
    id: String(s.id),
    provider: s.provider as MusicSource["provider"],
    externalId: (s.external_id as string | null) ?? null,
    canonicalUrl: String(s.canonical_url),
    targetType: s.target_type as MusicSource["targetType"],
    targetId: (s.target_id as string | null) ?? null,
    displayTitle: (s.display_title as string | null) ?? null,
    displayArtist: (s.display_artist as string | null) ?? null,
    thumbnailUrl: (s.thumbnail_url as string | null) ?? null,
    embedType: s.embed_type as MusicSource["embedType"],
    embedUrl: (s.embed_url as string | null) ?? null,
    playability: s.playability as MusicSource["playability"],
    rightsStatus: String(s.rights_status),
    attribution: (s.attribution as string | null) ?? null,
  };
}

function playRank(s: MusicSource): number {
  return { embeddable: 0, external_only: 1, unknown: 2, unavailable: 3 }[s.playability];
}

export function buildCard(cat: Catalogue, recordingId: string): RecordCard | null {
  const recording = cat.recordings.get(recordingId);
  if (!recording) return null;
  const artist = recording.primaryArtistId
    ? (cat.artists.get(recording.primaryArtistId) ?? null)
    : null;
  const credits = (cat.credits.get(recordingId) ?? [])
    .filter((c) => c.role !== "primary")
    .map((c) => ({ artist: cat.artists.get(c.artistId), role: c.role }))
    .filter((c): c is { artist: Artist; role: string } => Boolean(c.artist));
  const releaseId = cat.recordingRelease.get(recordingId);
  const release = releaseId ? (cat.releases.get(releaseId) ?? null) : null;
  const label = release?.labelId ? (cat.labels.get(release.labelId) ?? null) : null;
  const tags = (cat.recordingTags.get(recordingId) ?? [])
    .map((t) => cat.tags.get(t))
    .filter((t): t is Tag => Boolean(t));
  const sources = cat.sources.get(recordingId) ?? [];
  return { recording, artist, credits, release, label, tags, source: sources[0] ?? null, sources };
}

export function recordingLabelId(cat: Catalogue, recordingId: string): string | null {
  const rel = cat.recordingRelease.get(recordingId);
  return rel ? (cat.releases.get(rel)?.labelId ?? null) : null;
}

export function recordingPeople(cat: Catalogue, recordingId: string): string[] {
  return (cat.credits.get(recordingId) ?? []).map((c) => c.artistId);
}
