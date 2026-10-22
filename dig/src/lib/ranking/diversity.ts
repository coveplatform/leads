import type { Catalogue } from "@/lib/catalogue/graph";
import { recordingLabelId } from "@/lib/catalogue/graph";
import type { Band, RankContext } from "./types";
import type { Scored } from "./score";
import { DISTANCE_ALLOCATION } from "./weights";

/**
 * Pick a page honouring distance allocation targets and light diversity:
 * within a page, at most 2 per artist (unless the chosen mode is Connections
 * and the path is an artist/alias link — a deliberate deep artist dig) and at
 * most 4 per label outside Connections mode. Deterministic.
 */
export function selectPage(
  cat: Catalogue,
  ranked: Scored[],
  bands: Map<string, Band>,
  ctx: RankContext,
): Scored[] {
  const alloc = DISTANCE_ALLOCATION[ctx.distance];
  const target: Record<Band, number> = {
    close: Math.round(alloc.close * ctx.pageSize),
    adjacent: Math.round(alloc.adjacent * ctx.pageSize),
    far: Math.max(
      0,
      ctx.pageSize -
        Math.round(alloc.close * ctx.pageSize) -
        Math.round(alloc.adjacent * ctx.pageSize),
    ),
  };
  const byBand: Record<Band, Scored[]> = { close: [], adjacent: [], far: [] };
  for (const s of ranked) byBand[bands.get(s.recordingId) ?? "adjacent"].push(s);

  const page: Scored[] = [];
  const artistCount = new Map<string, number>();
  const labelCount = new Map<string, number>();
  const tryAdd = (s: Scored): boolean => {
    const rec = cat.recordings.get(s.recordingId);
    const artist = rec?.primaryArtistId ?? "";
    const label = recordingLabelId(cat, s.recordingId) ?? "";
    const artistLink = s.path.hops.every(
      (h) =>
        h.relation === "same_artist" ||
        h.relation === "artist_alias" ||
        h.relation === "remixed_by",
    );
    const artistCap = ctx.mode === "connections" && artistLink ? Infinity : 2;
    const labelCap = ctx.mode === "connections" ? Infinity : 4;
    if (artist && (artistCount.get(artist) ?? 0) >= artistCap) return false;
    if (label && (labelCount.get(label) ?? 0) >= labelCap) return false;
    page.push(s);
    if (artist) artistCount.set(artist, (artistCount.get(artist) ?? 0) + 1);
    if (label) labelCount.set(label, (labelCount.get(label) ?? 0) + 1);
    return true;
  };

  const take = (band: Band, n: number) => {
    let taken = 0;
    for (const s of byBand[band]) {
      if (taken >= n || page.length >= ctx.pageSize) break;
      if (page.includes(s)) continue;
      if (tryAdd(s)) taken++;
    }
  };
  take("close", target.close);
  take("adjacent", target.adjacent);
  take("far", target.far);
  // Backfill from any band, best score first, if a band ran dry.
  for (const s of ranked) {
    if (page.length >= ctx.pageSize) break;
    if (!page.includes(s)) tryAdd(s);
  }
  // Final order within the page: by score desc, id asc (stable, deterministic).
  return page.sort((a, b) => b.score - a.score || a.recordingId.localeCompare(b.recordingId));
}
