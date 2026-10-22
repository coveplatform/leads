import type { Db } from "@/lib/db/client";
import { buildCard, getCatalogue } from "@/lib/catalogue/graph";
import type { RecordCard } from "@/domain/types";

type Row = Record<string, unknown>;

export interface SearchResults {
  query: string;
  recordings: RecordCard[];
  artists: Array<{ id: string; name: string; aliases: string[]; recordingCount: number }>;
  labels: Array<{ id: string; name: string; recordingCount: number }>;
  releases: Array<{ id: string; title: string; year: number | null; label: string | null }>;
  tags: Array<{ id: string; slug: string; name: string; kind: string; recordingCount: number }>;
  imports: Array<{ id: string; title: string | null; url: string; status: string }>;
}

export async function search(
  db: Db,
  principalId: string,
  q: string,
  opts: {
    type?: string;
    yearFrom?: number;
    yearTo?: number;
    limit?: number;
    tag?: string;
    playable?: boolean;
  } = {},
): Promise<SearchResults> {
  const cat = await getCatalogue(db);
  const term = q.trim();
  const like = `%${term.replace(/[%_]/g, "")}%`;
  const limit = Math.min(50, Math.max(1, opts.limit ?? 20));
  const empty: SearchResults = {
    query: term,
    recordings: [],
    artists: [],
    labels: [],
    releases: [],
    tags: [],
    imports: [],
  };
  if (term.length < 1 && !opts.tag) return empty;
  const want = (t: string) => !opts.type || opts.type === t;

  if (want("recording")) {
    const params: unknown[] = [like, limit];
    let where = `(r.canonical_title ILIKE $1 OR a.name ILIKE $1 OR EXISTS (SELECT 1 FROM artist_aliases aa WHERE aa.artist_id = a.id AND aa.alias ILIKE $1)
                 OR EXISTS (SELECT 1 FROM release_recordings rr JOIN releases rel ON rel.id = rr.release_id LEFT JOIN labels l ON l.id = rel.label_id WHERE rr.recording_id = r.id AND (rel.title ILIKE $1 OR l.name ILIKE $1)))`;
    if (term.length === 0) where = "true";
    if (opts.yearFrom) {
      params.push(opts.yearFrom);
      where += ` AND r.first_release_year >= $${params.length}`;
    }
    if (opts.yearTo) {
      params.push(opts.yearTo);
      where += ` AND r.first_release_year <= $${params.length}`;
    }
    if (opts.tag) {
      params.push(opts.tag);
      where += ` AND EXISTS (SELECT 1 FROM entity_tags et JOIN tags t ON t.id = et.tag_id WHERE et.entity_type = 'recording' AND et.entity_id = r.id AND t.slug = $${params.length})`;
    }
    const r = await db.query<Row>(
      `SELECT r.id FROM recordings r LEFT JOIN artists a ON a.id = r.primary_artist_id WHERE r.visibility = 'public' AND ${where}
       ORDER BY (r.canonical_title ILIKE $1) DESC, r.metadata_confidence DESC, r.canonical_title LIMIT $2`,
      params,
    );
    empty.recordings = r.rows
      .map((row) => buildCard(cat, String(row.id)))
      .filter((c): c is RecordCard => Boolean(c))
      .filter(
        (c) =>
          !opts.playable ||
          c.source?.playability === "embeddable" ||
          c.source?.playability === "external_only",
      );
  }
  if (term.length && want("artist")) {
    const r = await db.query<Row>(
      `SELECT a.id, a.name, (SELECT count(*) FROM recording_artists ra WHERE ra.artist_id = a.id) AS n FROM artists a
       WHERE a.name ILIKE $1 OR EXISTS (SELECT 1 FROM artist_aliases aa WHERE aa.artist_id = a.id AND aa.alias ILIKE $1) ORDER BY a.name LIMIT $2`,
      [like, limit],
    );
    empty.artists = r.rows.map((row) => ({
      id: String(row.id),
      name: String(row.name),
      aliases: cat.artists.get(String(row.id))?.aliases ?? [],
      recordingCount: Number(row.n),
    }));
  }
  if (term.length && want("label")) {
    const r = await db.query<Row>(
      `SELECT l.id, l.name, (SELECT count(*) FROM release_recordings rr JOIN releases rel ON rel.id = rr.release_id WHERE rel.label_id = l.id) AS n FROM labels l WHERE l.name ILIKE $1 ORDER BY l.name LIMIT $2`,
      [like, limit],
    );
    empty.labels = r.rows.map((row) => ({
      id: String(row.id),
      name: String(row.name),
      recordingCount: Number(row.n),
    }));
  }
  if (term.length && want("release")) {
    const r = await db.query<Row>(
      `SELECT rel.id, rel.title, rel.release_year, l.name AS label FROM releases rel LEFT JOIN labels l ON l.id = rel.label_id WHERE rel.title ILIKE $1 ORDER BY rel.title LIMIT $2`,
      [like, limit],
    );
    empty.releases = r.rows.map((row) => ({
      id: String(row.id),
      title: String(row.title),
      year: row.release_year === null ? null : Number(row.release_year),
      label: (row.label as string | null) ?? null,
    }));
  }
  if (term.length && want("tag")) {
    const r = await db.query<Row>(
      `SELECT t.*, (SELECT count(*) FROM entity_tags et WHERE et.tag_id = t.id) AS n FROM tags t WHERE t.name ILIKE $1 OR t.slug ILIKE $1 ORDER BY t.name LIMIT $2`,
      [like, limit],
    );
    empty.tags = r.rows.map((row) => ({
      id: String(row.id),
      slug: String(row.slug),
      name: String(row.name),
      kind: String(row.kind),
      recordingCount: Number(row.n),
    }));
  }
  if (term.length && want("import")) {
    const r = await db.query<Row>(
      `SELECT id, original_url, status, user_title, extracted_metadata FROM imports WHERE principal_id = $3 AND (original_url ILIKE $1 OR user_title ILIKE $1 OR extracted_metadata->>'title' ILIKE $1) ORDER BY created_at DESC LIMIT $2`,
      [like, limit, principalId],
    );
    empty.imports = r.rows.map((row) => {
      const meta = (
        typeof row.extracted_metadata === "string"
          ? JSON.parse(row.extracted_metadata)
          : row.extracted_metadata
      ) as { title?: string };
      return {
        id: String(row.id),
        title: (row.user_title as string | null) ?? meta.title ?? null,
        url: String(row.original_url),
        status: String(row.status),
      };
    });
  }
  return empty;
}

export async function recordingsByEntity(
  db: Db,
  kind: "artist" | "label" | "tag",
  id: string,
): Promise<RecordCard[]> {
  const cat = await getCatalogue(db);
  const out: RecordCard[] = [];
  for (const rec of cat.recordings.values()) {
    const card = buildCard(cat, rec.id);
    if (!card) continue;
    if (
      kind === "artist" &&
      (card.artist?.id === id || card.credits.some((c) => c.artist.id === id))
    )
      out.push(card);
    if (kind === "label" && card.label?.id === id) out.push(card);
    if (kind === "tag" && card.tags.some((t) => t.id === id || t.slug === id)) out.push(card);
  }
  return out.sort(
    (a, b) =>
      (a.recording.year ?? 9999) - (b.recording.year ?? 9999) ||
      a.recording.title.localeCompare(b.recording.title),
  );
}
