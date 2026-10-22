import type { Db } from "@/lib/db/client";
import { buildCard, getCatalogue, rowToSource } from "@/lib/catalogue/graph";
import { ApiError } from "@/lib/api/errors";
import type { MusicSource, RecordCard } from "@/domain/types";
import { playerConfigForSource } from "@/lib/providers/player";

type Row = Record<string, unknown>;

export interface Crate {
  id: string;
  title: string;
  description: string | null;
  isSystem: boolean;
  systemKey: string | null;
  itemCount: number;
  createdAt: string;
}

export interface CrateItem {
  id: string;
  crateId: string;
  recordingId: string | null;
  sourceId: string | null;
  importedUrl: string | null;
  notes: string | null;
  tags: string[];
  status: string;
  loved: boolean;
  savedAt: string;
  card: RecordCard | null;
  source: MusicSource | null;
  player: ReturnType<typeof playerConfigForSource>;
}

function crateFromRow(r: Row): Crate {
  return {
    id: String(r.id),
    title: String(r.title),
    description: (r.description as string | null) ?? null,
    isSystem: Boolean(r.is_system),
    systemKey: (r.system_key as string | null) ?? null,
    itemCount: Number(r.item_count ?? 0),
    createdAt: new Date(String(r.created_at)).toISOString(),
  };
}

export async function allFindsId(db: Db, principalId: string): Promise<string> {
  const r = await db.query<{ id: string }>(
    "SELECT id FROM crates WHERE principal_id = $1 AND system_key = 'all_finds'",
    [principalId],
  );
  if (r.rows[0]) return r.rows[0].id;
  const c = await db.query<{ id: string }>(
    `INSERT INTO crates (principal_id, title, description, is_system, system_key) VALUES ($1,'All Finds','Everything you keep lands here first.',true,'all_finds')
     ON CONFLICT (principal_id, system_key) WHERE system_key IS NOT NULL DO UPDATE SET updated_at = now() RETURNING id`,
    [principalId],
  );
  return c.rows[0]!.id;
}

export async function listCrates(
  db: Db,
  principalId: string,
): Promise<{ crates: Crate[]; views: Array<{ key: string; title: string; count: number }> }> {
  await allFindsId(db, principalId);
  const r = await db.query<Row>(
    `SELECT c.*, (SELECT count(*) FROM crate_items ci WHERE ci.crate_id = c.id) AS item_count
       FROM crates c WHERE c.principal_id = $1 ORDER BY c.is_system DESC, c.created_at`,
    [principalId],
  );
  const loved = await db.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM crate_items ci JOIN crates c ON c.id = ci.crate_id WHERE c.principal_id = $1 AND ci.loved`,
    [principalId],
  );
  const inv = await db.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM crate_items ci JOIN crates c ON c.id = ci.crate_id WHERE c.principal_id = $1 AND (ci.status = 'to_investigate' OR (ci.recording_id IS NULL))`,
    [principalId],
  );
  return {
    crates: r.rows.map(crateFromRow),
    views: [
      { key: "loved", title: "Loved", count: Number(loved.rows[0]?.n ?? 0) },
      { key: "to_investigate", title: "To Investigate", count: Number(inv.rows[0]?.n ?? 0) },
    ],
  };
}

export async function createCrate(
  db: Db,
  principalId: string,
  input: { title: string; description?: string },
): Promise<Crate> {
  const r = await db.query<Row>(
    `INSERT INTO crates (principal_id, title, description) VALUES ($1,$2,$3) RETURNING *, 0 AS item_count`,
    [principalId, input.title.trim(), input.description ?? null],
  );
  return crateFromRow(r.rows[0]!);
}

export async function requireCrate(db: Db, principalId: string, crateId: string): Promise<Crate> {
  if (!/^[0-9a-f-]{36}$/.test(crateId)) throw new ApiError("NOT_FOUND", "No such crate");
  const r = await db.query<Row>(
    `SELECT c.*, (SELECT count(*) FROM crate_items ci WHERE ci.crate_id = c.id) AS item_count FROM crates c WHERE id = $1`,
    [crateId],
  );
  const c = r.rows[0];
  if (!c) throw new ApiError("NOT_FOUND", "No such crate");
  if (String(c.principal_id) !== principalId)
    throw new ApiError("FORBIDDEN", "That crate belongs to someone else");
  return crateFromRow(c);
}

export async function patchCrate(
  db: Db,
  principalId: string,
  crateId: string,
  patch: { title?: string; description?: string | null },
): Promise<Crate> {
  const c = await requireCrate(db, principalId, crateId);
  if (c.isSystem && patch.title !== undefined)
    throw new ApiError("CONFLICT", "System crates can't be renamed");
  if (patch.title !== undefined)
    await db.query("UPDATE crates SET title = $2, updated_at = now() WHERE id = $1", [
      crateId,
      patch.title.trim(),
    ]);
  if (patch.description !== undefined)
    await db.query("UPDATE crates SET description = $2, updated_at = now() WHERE id = $1", [
      crateId,
      patch.description,
    ]);
  return requireCrate(db, principalId, crateId);
}

export async function deleteCrate(db: Db, principalId: string, crateId: string): Promise<void> {
  const c = await requireCrate(db, principalId, crateId);
  if (c.isSystem) throw new ApiError("CONFLICT", "All Finds can't be deleted");
  await db.query("DELETE FROM crates WHERE id = $1", [crateId]);
}

async function hydrate(db: Db, rows: Row[]): Promise<CrateItem[]> {
  const cat = await getCatalogue(db);
  const sourceIds = rows.map((r) => r.music_source_id).filter(Boolean) as string[];
  const sources = new Map<string, MusicSource>();
  if (sourceIds.length) {
    const sr = await db.query<Row>(`SELECT * FROM music_sources WHERE id = ANY($1::uuid[])`, [
      sourceIds,
    ]);
    for (const s of sr.rows) sources.set(String(s.id), rowToSource(s));
  }
  return rows.map((r) => {
    const recordingId = (r.recording_id as string | null) ?? null;
    const card = recordingId ? buildCard(cat, recordingId) : null;
    const source = r.music_source_id
      ? (sources.get(String(r.music_source_id)) ?? null)
      : (card?.source ?? null);
    return {
      id: String(r.id),
      crateId: String(r.crate_id),
      recordingId,
      sourceId: (r.music_source_id as string | null) ?? null,
      importedUrl: (r.imported_url as string | null) ?? null,
      notes: (r.notes as string | null) ?? null,
      tags: (r.tags as string[] | null) ?? [],
      status: String(r.status),
      loved: Boolean(r.loved),
      savedAt: new Date(String(r.saved_at)).toISOString(),
      card,
      source,
      player: playerConfigForSource(source),
    };
  });
}

export type Sort = "saved_desc" | "saved_asc" | "title" | "artist" | "year";

export async function listItems(
  db: Db,
  principalId: string,
  crateId: string,
  opts: {
    sort?: Sort;
    q?: string;
    view?: "loved" | "to_investigate";
    limit?: number;
    cursor?: string | null;
  } = {},
): Promise<{ crate: Crate; items: CrateItem[]; hasMore: boolean; nextCursor: string | null }> {
  const crate = await requireCrate(db, principalId, crateId);
  const limit = Math.min(200, Math.max(1, opts.limit ?? 100));
  const params: unknown[] = [crateId, limit + 1];
  let where = "ci.crate_id = $1";
  if (opts.view === "loved") where += " AND ci.loved";
  if (opts.view === "to_investigate")
    where += " AND (ci.status = 'to_investigate' OR ci.recording_id IS NULL)";
  if (opts.cursor && (opts.sort ?? "saved_desc") === "saved_desc") {
    params.push(opts.cursor);
    where += ` AND ci.saved_at < $${params.length}`;
  }
  const r = await db.query<Row>(
    `SELECT ci.* FROM crate_items ci WHERE ${where} ORDER BY ci.saved_at DESC LIMIT $2`,
    params,
  );
  let items = await hydrate(db, r.rows.slice(0, limit));
  if (opts.q) {
    const q = opts.q.toLowerCase();
    items = items.filter((i) =>
      [
        i.card?.recording.title,
        i.card?.artist?.name,
        i.card?.label?.name,
        i.source?.displayTitle,
        i.importedUrl,
        i.notes,
        ...i.tags,
      ].some((v) => v?.toLowerCase().includes(q)),
    );
  }
  const key = (i: CrateItem) => ({
    title: i.card?.recording.title ?? i.source?.displayTitle ?? i.importedUrl ?? "",
    artist: i.card?.artist?.name ?? i.source?.displayArtist ?? "",
    year: i.card?.recording.year ?? 0,
  });
  switch (opts.sort) {
    case "saved_asc":
      items.reverse();
      break;
    case "title":
      items.sort((a, b) => key(a).title.localeCompare(key(b).title));
      break;
    case "artist":
      items.sort((a, b) => key(a).artist.localeCompare(key(b).artist));
      break;
    case "year":
      items.sort((a, b) => key(a).year - key(b).year);
      break;
  }
  return {
    crate,
    items,
    hasMore: r.rows.length > limit,
    nextCursor: r.rows.length > limit ? (items[items.length - 1]?.savedAt ?? null) : null,
  };
}

/** Idempotent save of a catalogue recording into All Finds (and optionally a chosen crate). */
export async function keepRecording(
  db: Db,
  principalId: string,
  recordingId: string,
  opts: { loved?: boolean; sessionId?: string; crateId?: string; notes?: string } = {},
): Promise<CrateItem> {
  const crateId = opts.crateId ?? (await allFindsId(db, principalId));
  if (opts.crateId) await requireCrate(db, principalId, opts.crateId);
  const cat = await getCatalogue(db);
  const source = cat.sources.get(recordingId)?.[0] ?? null;
  const r = await db.query<Row>(
    `INSERT INTO crate_items (crate_id, recording_id, music_source_id, imported_url, notes, loved, status)
     VALUES ($1,$2,$3,$4,$5,$6, CASE WHEN $6 THEN 'loved' ELSE 'saved' END)
     ON CONFLICT (crate_id, recording_id) WHERE recording_id IS NOT NULL
     DO UPDATE SET loved = crate_items.loved OR EXCLUDED.loved, updated_at = now(),
                   status = CASE WHEN (crate_items.loved OR EXCLUDED.loved) AND crate_items.status = 'saved' THEN 'loved' ELSE crate_items.status END
     RETURNING *`,
    [
      crateId,
      recordingId,
      source?.id ?? null,
      source?.canonicalUrl ?? null,
      opts.notes ?? null,
      Boolean(opts.loved),
    ],
  );
  return (await hydrate(db, [r.rows[0]!]))[0]!;
}

/** Save an imported/unresolved source (keeps the original link even if never identified). */
export async function keepSource(
  db: Db,
  principalId: string,
  sourceId: string,
  opts: { crateId?: string; notes?: string } = {},
): Promise<CrateItem> {
  const crateId = opts.crateId ?? (await allFindsId(db, principalId));
  if (opts.crateId) await requireCrate(db, principalId, opts.crateId);
  const sr = await db.query<Row>("SELECT * FROM music_sources WHERE id = $1", [sourceId]);
  const src = sr.rows[0];
  if (!src) throw new ApiError("NOT_FOUND", "Unknown source");
  const recordingId =
    src.target_type === "recording" ? ((src.target_id as string | null) ?? null) : null;
  if (recordingId)
    return keepRecording(db, principalId, recordingId, { crateId, notes: opts.notes });
  const r = await db.query<Row>(
    `INSERT INTO crate_items (crate_id, music_source_id, imported_url, notes, status) VALUES ($1,$2,$3,$4,'to_investigate')
     ON CONFLICT (crate_id, music_source_id) WHERE recording_id IS NULL AND music_source_id IS NOT NULL DO UPDATE SET updated_at = now() RETURNING *`,
    [crateId, sourceId, String(src.canonical_url), opts.notes ?? null],
  );
  return (await hydrate(db, [r.rows[0]!]))[0]!;
}

export async function patchItem(
  db: Db,
  principalId: string,
  crateId: string,
  itemId: string,
  patch: {
    notes?: string | null;
    tags?: string[];
    status?: string;
    loved?: boolean;
    moveToCrateId?: string;
    copyToCrateId?: string;
  },
): Promise<CrateItem> {
  await requireCrate(db, principalId, crateId);
  const r = await db.query<Row>("SELECT * FROM crate_items WHERE id = $1 AND crate_id = $2", [
    itemId,
    crateId,
  ]);
  const item = r.rows[0];
  if (!item) throw new ApiError("NOT_FOUND", "No such item");
  if (patch.copyToCrateId) {
    await requireCrate(db, principalId, patch.copyToCrateId);
    if (item.recording_id)
      await keepRecording(db, principalId, String(item.recording_id), {
        crateId: patch.copyToCrateId,
        loved: Boolean(item.loved),
      });
    else if (item.music_source_id)
      await keepSource(db, principalId, String(item.music_source_id), {
        crateId: patch.copyToCrateId,
      });
  }
  if (patch.moveToCrateId && patch.moveToCrateId !== crateId) {
    await requireCrate(db, principalId, patch.moveToCrateId);
    const dup = await db.query<{ id: string }>(
      "SELECT id FROM crate_items WHERE crate_id = $1 AND recording_id IS NOT DISTINCT FROM $2 AND recording_id IS NOT NULL",
      [patch.moveToCrateId, item.recording_id ?? null],
    );
    if (dup.rows[0]) await db.query("DELETE FROM crate_items WHERE id = $1", [itemId]);
    else
      await db.query("UPDATE crate_items SET crate_id = $2, updated_at = now() WHERE id = $1", [
        itemId,
        patch.moveToCrateId,
      ]);
    const moved = await db.query<Row>("SELECT * FROM crate_items WHERE id = $1", [
      dup.rows[0]?.id ?? itemId,
    ]);
    return (await hydrate(db, [moved.rows[0]!]))[0]!;
  }
  const sets: string[] = [];
  const vals: unknown[] = [itemId];
  if (patch.notes !== undefined) {
    vals.push(patch.notes);
    sets.push(`notes = $${vals.length}`);
  }
  if (patch.tags !== undefined) {
    vals.push(
      patch.tags
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 30),
    );
    sets.push(`tags = $${vals.length}::text[]`);
  }
  if (patch.status !== undefined) {
    vals.push(patch.status);
    sets.push(`status = $${vals.length}`);
  }
  if (patch.loved !== undefined) {
    vals.push(patch.loved);
    sets.push(`loved = $${vals.length}`);
  }
  if (sets.length)
    await db.query(
      `UPDATE crate_items SET ${sets.join(", ")}, updated_at = now() WHERE id = $1`,
      vals,
    );
  const out = await db.query<Row>("SELECT * FROM crate_items WHERE id = $1", [itemId]);
  return (await hydrate(db, [out.rows[0]!]))[0]!;
}

export async function deleteItem(
  db: Db,
  principalId: string,
  crateId: string,
  itemId: string,
): Promise<void> {
  await requireCrate(db, principalId, crateId);
  const r = await db.query("DELETE FROM crate_items WHERE id = $1 AND crate_id = $2", [
    itemId,
    crateId,
  ]);
  if (r.rowCount === 0) throw new ApiError("NOT_FOUND", "No such item");
}

export async function exportCrates(
  db: Db,
  principalId: string,
  format: "json" | "csv",
  crateId?: string,
): Promise<{ body: string; contentType: string; filename: string }> {
  const { crates } = await listCrates(db, principalId);
  const target = crateId ? crates.filter((c) => c.id === crateId) : crates;
  const all: Array<Record<string, unknown>> = [];
  for (const c of target) {
    const { items } = await listItems(db, principalId, c.id, { limit: 200 });
    for (const i of items) {
      all.push({
        crate: c.title,
        title: i.card?.recording.title ?? i.source?.displayTitle ?? "",
        version: i.card?.recording.disambiguation ?? "",
        artist: i.card?.artist?.name ?? i.source?.displayArtist ?? "",
        release: i.card?.release?.title ?? "",
        label: i.card?.label?.name ?? "",
        year: i.card?.recording.year ?? "",
        source_url: i.source?.canonicalUrl ?? i.importedUrl ?? "",
        provider: i.source?.provider ?? "",
        status: i.status,
        loved: i.loved,
        tags: i.tags.join("|"),
        notes: i.notes ?? "",
        saved_at: i.savedAt,
      });
    }
  }
  const stamp = new Date().toISOString().slice(0, 10);
  if (format === "json")
    return {
      body: JSON.stringify({ exportedAt: new Date().toISOString(), items: all }, null, 2),
      contentType: "application/json",
      filename: `dig-crates-${stamp}.json`,
    };
  const cols = [
    "crate",
    "title",
    "version",
    "artist",
    "release",
    "label",
    "year",
    "source_url",
    "provider",
    "status",
    "loved",
    "tags",
    "notes",
    "saved_at",
  ];
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const body = [cols.join(","), ...all.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
  return { body, contentType: "text/csv; charset=utf-8", filename: `dig-crates-${stamp}.csv` };
}
