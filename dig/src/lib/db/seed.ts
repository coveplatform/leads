import type { Db } from "./client";
import { stableId } from "./ids";
import {
  DEMO_ARTISTS,
  DEMO_CURATIONS,
  DEMO_EDGES,
  DEMO_LABELS,
  DEMO_RECORDINGS,
  DEMO_RELATIONS,
  DEMO_TAGS,
  type DemoRecording,
} from "@/data/demo-catalogue";
import type { RelationType } from "@/domain/types";

const NS = "dig-demo-v1";
export const artistId = (k: string) => stableId(`${NS}:artist`, k);
export const labelId = (k: string) => stableId(`${NS}:label`, k);
export const recordingId = (k: string) => stableId(`${NS}:recording`, k);
export const tagId = (slug: string) => stableId(`${NS}:tag`, slug);
const releaseIdFor = (r: DemoRecording) =>
  stableId(`${NS}:release`, `${r.label ?? "nolabel"}::${r.release ?? r.title}::${r.artist}`);
const sourceId = (k: string, i: number) => stableId(`${NS}:source`, `${k}#${i}`);
const edgeId = (a: string, b: string, rel: string) => stableId(`${NS}:edge`, `${a}|${b}|${rel}`);
const curationId = (slug: string) => stableId(`${NS}:curation`, slug);

const STRONG: RelationType[] = [
  "same_label",
  "same_artist",
  "artist_alias",
  "remixed_by",
  "same_release",
  "collaborated_with",
  "producer_overlap",
];

interface EdgeRow {
  id: string;
  from: string;
  to: string;
  relation: RelationType;
  weight: number;
  provenance: "verified_metadata" | "licensed_data" | "human_curator" | "inferred";
  ref: string | null;
  confidence: number;
  template: string | null;
}

/** Union-find over alias / member_of relations: "same person" groups. */
function aliasGroups(): Map<string, string> {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    const p = parent.get(x) ?? x;
    if (p === x) return x;
    const r = find(p);
    parent.set(x, r);
    return r;
  };
  for (const a of DEMO_ARTISTS) parent.set(a.key, a.key);
  for (const r of DEMO_RELATIONS) {
    if (r.type === "alias" || r.type === "member_of") parent.set(find(r.from), find(r.to));
  }
  const out = new Map<string, string>();
  for (const a of DEMO_ARTISTS) out.set(a.key, find(a.key));
  return out;
}

export function deriveEdges(): EdgeRow[] {
  const edges = new Map<string, EdgeRow>();
  const groups = aliasGroups();
  const recs = DEMO_RECORDINGS;
  const add = (e: Omit<EdgeRow, "id">) => {
    const [a, b] = e.relation === "remixed_by" ? [e.from, e.to] : [e.from, e.to].sort();
    const id = edgeId(a!, b!, e.relation);
    if (!edges.has(id)) edges.set(id, { ...e, from: a!, to: b!, id });
  };
  const collab = new Set(
    DEMO_RELATIONS.filter((r) => r.type === "collaborated_with").flatMap((r) => [
      `${groups.get(r.from)}|${groups.get(r.to)}`,
      `${groups.get(r.to)}|${groups.get(r.from)}`,
    ]),
  );

  for (let i = 0; i < recs.length; i++) {
    const a = recs[i]!;
    const aTags = new Set(a.tags);
    const aPeople = new Set([a.artist, ...(a.credits ?? []).map((c) => c.artist)]);
    const aGroups = new Set([...aPeople].map((p) => groups.get(p) ?? p));
    for (let j = i + 1; j < recs.length; j++) {
      const b = recs[j]!;
      const bPeople = new Set([b.artist, ...(b.credits ?? []).map((c) => c.artist)]);
      const bGroups = new Set([...bPeople].map((p) => groups.get(p) ?? p));
      let strong = false;

      if (a.release && b.release && releaseIdFor(a) === releaseIdFor(b)) {
        add({
          from: a.key,
          to: b.key,
          relation: "same_release",
          weight: 0.9,
          provenance: "human_curator",
          ref: NS,
          confidence: 0.9,
          template: null,
        });
        strong = true;
      } else if (a.label && a.label === b.label) {
        const gap = a.year && b.year ? Math.abs(a.year - b.year) : 10;
        add({
          from: a.key,
          to: b.key,
          relation: "same_label",
          weight: gap <= 3 ? 0.85 : 0.7,
          provenance: "human_curator",
          ref: NS,
          confidence: 0.9,
          template: null,
        });
        strong = true;
      }
      if (a.artist === b.artist && a.artist !== "unknown") {
        add({
          from: a.key,
          to: b.key,
          relation: "same_artist",
          weight: 0.9,
          provenance: "human_curator",
          ref: NS,
          confidence: 0.95,
          template: null,
        });
        strong = true;
      } else if (
        [...aGroups].some((g) => bGroups.has(g)) &&
        a.artist !== "unknown" &&
        b.artist !== "unknown"
      ) {
        // Same person (or group member) under a different name — or a remixer credit.
        const remixer = (b.credits ?? []).find(
          (c) => c.role === "remixer" && aGroups.has(groups.get(c.artist) ?? c.artist),
        );
        const remixerRev = (a.credits ?? []).find(
          (c) => c.role === "remixer" && bGroups.has(groups.get(c.artist) ?? c.artist),
        );
        if (remixer && a.title !== b.title) {
          add({
            from: a.key,
            to: b.key,
            relation: "remixed_by",
            weight: 0.75,
            provenance: "human_curator",
            ref: NS,
            confidence: 0.85,
            template: null,
          });
        } else if (remixerRev && a.title !== b.title) {
          add({
            from: b.key,
            to: a.key,
            relation: "remixed_by",
            weight: 0.75,
            provenance: "human_curator",
            ref: NS,
            confidence: 0.85,
            template: null,
          });
        } else if (a.title === b.title) {
          // original and remix of the same title stay distinct; remixed_by via DEMO_EDGES
        } else {
          add({
            from: a.key,
            to: b.key,
            relation: "artist_alias",
            weight: 0.85,
            provenance: "human_curator",
            ref: NS,
            confidence: 0.9,
            template: null,
          });
        }
        strong = true;
      } else if ([...aGroups].some((g) => [...bGroups].some((h) => collab.has(`${g}|${h}`)))) {
        add({
          from: a.key,
          to: b.key,
          relation: "collaborated_with",
          weight: 0.6,
          provenance: "human_curator",
          ref: NS,
          confidence: 0.8,
          template: null,
        });
        strong = true;
      }

      const shared = a.tags.filter((t) => aTags.has(t) && b.tags.includes(t));
      const sceneShared = shared.filter(
        (t) =>
          ![
            "warm",
            "hypnotic",
            "melancholic",
            "raw",
            "dreamy",
            "driving",
            "atmospheric",
            "playful",
            "70s",
            "80s",
            "90s",
            "00s",
          ].includes(t),
      );
      if (a.year && b.year && Math.abs(a.year - b.year) <= 3 && sceneShared.length > 0 && !strong) {
        add({
          from: a.key,
          to: b.key,
          relation: "same_era_scene",
          weight: 0.55 + 0.1 * Math.min(sceneShared.length, 3) - 0.05 * Math.abs(a.year - b.year),
          provenance: "human_curator",
          ref: NS,
          confidence: 0.75,
          template: null,
        });
      }
      const union = new Set([...a.tags, ...b.tags]).size;
      const jaccard = union ? shared.length / union : 0;
      if (jaccard >= 0.5 && !strong) {
        add({
          from: a.key,
          to: b.key,
          relation: "tag_similarity",
          weight: Math.round(jaccard * 100) / 100,
          provenance: "inferred",
          ref: "tag-jaccard",
          confidence: 0.5,
          template: null,
        });
      }
    }
  }
  for (const c of DEMO_CURATIONS) {
    for (let i = 0; i < c.items.length; i++) {
      for (let j = i + 1; j < c.items.length; j++) {
        add({
          from: c.items[i]!.recording,
          to: c.items[j]!.recording,
          relation: "curated_together",
          weight: 0.65 - Math.min(0.2, Math.abs(i - j) * 0.03),
          provenance: "human_curator",
          ref: c.slug,
          confidence: 0.8,
          template: null,
        });
      }
    }
  }
  for (const e of DEMO_EDGES) {
    add({
      from: e.from,
      to: e.to,
      relation: e.relation,
      weight: e.weight ?? 0.5,
      provenance: e.provenance ?? "human_curator",
      ref: NS,
      confidence: e.provenance === "inferred" ? 0.4 : 0.8,
      template: e.note ?? null,
    });
  }
  return [...edges.values()];
}

export function isStrongRelation(rel: RelationType): boolean {
  return STRONG.includes(rel);
}

export async function isSeeded(db: Db): Promise<boolean> {
  const r = await db.query<{ n: string }>(
    "SELECT count(*)::text AS n FROM recordings WHERE is_demo",
  );
  return Number(r.rows[0]?.n ?? 0) > 0;
}

export async function seedDemo(db: Db): Promise<{ recordings: number; edges: number }> {
  await db.transaction(async (tx) => {
    for (const t of DEMO_TAGS) {
      await tx.query(
        `INSERT INTO tags (id, slug, name, kind) VALUES ($1,$2,$3,$4)
         ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, kind = EXCLUDED.kind`,
        [tagId(t.slug), t.slug, t.name, t.kind],
      );
    }
    for (const a of DEMO_ARTISTS) {
      await tx.query(
        `INSERT INTO artists (id, name, sort_name, country, provenance) VALUES ($1,$2,$3,$4,'human_curator')
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, country = EXCLUDED.country`,
        [artistId(a.key), a.name, a.name, a.country ?? null],
      );
      for (const alias of a.aliases ?? []) {
        await tx.query(
          `INSERT INTO artist_aliases (artist_id, alias) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
          [artistId(a.key), alias],
        );
      }
    }
    for (const r of DEMO_RELATIONS) {
      await tx.query(
        `INSERT INTO artist_relations (from_artist_id, to_artist_id, type, provenance) VALUES ($1,$2,$3,'human_curator') ON CONFLICT DO NOTHING`,
        [artistId(r.from), artistId(r.to), r.type],
      );
    }
    for (const l of DEMO_LABELS) {
      await tx.query(
        `INSERT INTO labels (id, name, country) VALUES ($1,$2,$3) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`,
        [labelId(l.key), l.name, l.country ?? null],
      );
    }
    for (const r of DEMO_RECORDINGS) {
      const rid = recordingId(r.key);
      await tx.query(
        `INSERT INTO recordings (id, canonical_title, disambiguation, first_release_year, primary_artist_id, metadata_confidence, is_demo)
         VALUES ($1,$2,$3,$4,$5,$6,true)
         ON CONFLICT (id) DO UPDATE SET canonical_title = EXCLUDED.canonical_title, disambiguation = EXCLUDED.disambiguation,
           first_release_year = EXCLUDED.first_release_year, primary_artist_id = EXCLUDED.primary_artist_id,
           metadata_confidence = EXCLUDED.metadata_confidence`,
        [
          rid,
          r.title,
          r.disambiguation ?? null,
          r.year ?? null,
          artistId(r.artist),
          r.confidence ?? 0.85,
        ],
      );
      await tx.query(
        `INSERT INTO recording_artists (recording_id, artist_id, role) VALUES ($1,$2,'primary') ON CONFLICT DO NOTHING`,
        [rid, artistId(r.artist)],
      );
      for (const c of r.credits ?? []) {
        await tx.query(
          `INSERT INTO recording_artists (recording_id, artist_id, role) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
          [rid, artistId(c.artist), c.role],
        );
      }
      if (r.release || r.label) {
        const relId = releaseIdFor(r);
        await tx.query(
          `INSERT INTO releases (id, title, release_type, label_id, catalogue_number, release_year, artwork_rights_state)
           VALUES ($1,$2,$3,$4,$5,$6,'none')
           ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, label_id = EXCLUDED.label_id, release_year = EXCLUDED.release_year`,
          [
            relId,
            r.release ?? r.title,
            r.releaseType ?? "single",
            r.label ? labelId(r.label) : null,
            r.catalogue ?? null,
            r.year ?? null,
          ],
        );
        await tx.query(
          `INSERT INTO release_recordings (release_id, recording_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
          [relId, rid],
        );
        if (r.label) {
          await tx.query(
            `INSERT INTO release_labels (release_id, label_id, catalogue_number) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
            [relId, labelId(r.label), r.catalogue ?? null],
          );
        }
      }
      for (const t of r.tags) {
        await tx.query(
          `INSERT INTO entity_tags (entity_type, entity_id, tag_id, provenance, confidence) VALUES ('recording',$1,$2,'human_curator',0.8) ON CONFLICT DO NOTHING`,
          [rid, tagId(t)],
        );
      }
      const artistName = DEMO_ARTISTS.find((a) => a.key === r.artist)?.name ?? "";
      const q = encodeURIComponent(
        `${artistName} ${r.title}${r.disambiguation ? " " + r.disambiguation : ""}`.trim(),
      );
      const sources = r.sources ?? [
        { provider: "demo" as const, playability: "external_only" as const },
      ];
      for (let i = 0; i < sources.length; i++) {
        const s = sources[i]!;
        await tx.query(
          `INSERT INTO music_sources (id, provider, external_id, canonical_url, target_type, target_id, display_title, display_artist,
             embed_type, embed_url, playability, rights_status, attribution)
           VALUES ($1,'demo',$2,$3,'recording',$4,$5,$6,'none',NULL,$7,'demo_placeholder',$8)
           ON CONFLICT (id) DO UPDATE SET canonical_url = EXCLUDED.canonical_url, playability = EXCLUDED.playability, attribution = EXCLUDED.attribution`,
          [
            sourceId(r.key, i),
            `${r.key}#${i}`,
            s.playability === "unavailable"
              ? `https://www.youtube.com/watch?v=demo-removed-${r.key}`
              : `https://www.youtube.com/results?search_query=${q}`,
            rid,
            r.title,
            artistName,
            s.playability,
            s.note ?? "Sample record: this opens a provider search, not a verified upload.",
          ],
        );
      }
    }
    for (const c of DEMO_CURATIONS) {
      const cid = curationId(c.slug);
      await tx.query(
        `INSERT INTO curation_sets (id, slug, title, description, curator, is_seed_route) VALUES ($1,$2,$3,$4,'DIG editors (demo)',$5)
         ON CONFLICT (slug) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description, is_seed_route = EXCLUDED.is_seed_route`,
        [cid, c.slug, c.title, c.description, c.seedRoute],
      );
      await tx.query(`DELETE FROM curation_items WHERE set_id = $1`, [cid]);
      for (let i = 0; i < c.items.length; i++) {
        const it = c.items[i]!;
        await tx.query(
          `INSERT INTO curation_items (set_id, recording_id, position, curator_note) VALUES ($1,$2,$3,$4)`,
          [cid, recordingId(it.recording), i, it.note ?? null],
        );
      }
    }
    const edges = deriveEdges();
    await tx.query(
      `DELETE FROM music_edges WHERE provenance_ref = $1 OR provenance_ref = 'tag-jaccard' OR provenance_ref IN (SELECT slug FROM curation_sets)`,
      [NS],
    );
    for (const e of edges) {
      await tx.query(
        `INSERT INTO music_edges (id, from_type, from_id, to_type, to_id, relation_type, weight, provenance, provenance_ref, confidence, explanation_template)
         VALUES ($1,'recording',$2,'recording',$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (id) DO NOTHING`,
        [
          e.id,
          recordingId(e.from),
          recordingId(e.to),
          e.relation,
          Math.max(0, Math.min(1, e.weight)).toFixed(2),
          e.provenance,
          e.ref,
          e.confidence.toFixed(2),
          e.template,
        ],
      );
    }
  });
  const edges = await db.query<{ n: string }>("SELECT count(*)::text AS n FROM music_edges");
  return { recordings: DEMO_RECORDINGS.length, edges: Number(edges.rows[0]?.n ?? 0) };
}
