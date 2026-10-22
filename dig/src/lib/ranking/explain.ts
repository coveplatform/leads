import type { Catalogue } from "@/lib/catalogue/graph";
import { recordingLabelId } from "@/lib/catalogue/graph";
import type { ExplanationStep, RecommendationExplanation, RelationType } from "@/domain/types";
import type { Band, Path, RankContext } from "./types";
import { provenanceConfidence } from "./weights";

function nameOf(cat: Catalogue, id: string): string {
  const r = cat.recordings.get(id);
  if (!r) return "unknown";
  const a = r.primaryArtistId ? cat.artists.get(r.primaryArtistId)?.name : undefined;
  return a ? `${a} – ${r.title}` : r.title;
}

function yearPhrase(cat: Catalogue, from: string, to: string): string {
  const a = cat.recordings.get(from)?.year;
  const b = cat.recordings.get(to)?.year;
  if (!a || !b) return "";
  const d = b - a;
  if (d === 0) return ", the same year";
  if (Math.abs(d) === 1) return d > 0 ? ", a year later" : ", a year earlier";
  return d > 0 ? `, ${d} years later` : `, ${-d} years earlier`;
}

/** Plain-language headline for one hop. Verified/curated facts stay factual; inferred links hedge. */
export function hopHeadline(cat: Catalogue, hop: Path["hops"][number]): string {
  const conf = provenanceConfidence(hop.provenance);
  const rel: RelationType = hop.relation;
  const label = (() => {
    const l = recordingLabelId(cat, hop.to);
    return l ? cat.labels.get(l)?.name : undefined;
  })();
  const toArtist = (() => {
    const r = cat.recordings.get(hop.to);
    return r?.primaryArtistId ? cat.artists.get(r.primaryArtistId)?.name : undefined;
  })();
  const fromArtist = (() => {
    const r = cat.recordings.get(hop.from);
    return r?.primaryArtistId ? cat.artists.get(r.primaryArtistId)?.name : undefined;
  })();
  switch (rel) {
    case "same_release":
      return "On the same release";
    case "same_label":
      return `Released on ${label ?? "the same label"}${yearPhrase(cat, hop.from, hop.to)}`;
    case "same_artist":
      return `Also by ${toArtist ?? "the same artist"}`;
    case "artist_alias":
      return fromArtist && toArtist && fromArtist !== toArtist
        ? `${fromArtist} also records as ${toArtist}`
        : "Same producer under another name";
    case "remixed_by": {
      const remixer = cat.credits
        .get(hop.forward ? hop.to : hop.from)
        ?.find((c) => c.role === "remixer");
      const name = remixer ? cat.artists.get(remixer.artistId)?.name : undefined;
      return hop.forward
        ? `Remixed by ${name ?? toArtist ?? "another producer"}`
        : `The original of this remix`;
    }
    case "collaborated_with":
      return `${fromArtist ?? "This artist"} has worked with ${toArtist ?? "this artist"}`;
    case "producer_overlap":
      return "Shares people behind the desk";
    case "same_era_scene":
      return `Same scene, ${cat.recordings.get(hop.to)?.year ?? "same era"}`;
    case "curated_together":
      return "Selected alongside this record by an editor";
    case "tag_similarity":
      return "Similar atmosphere (tag overlap)";
    case "similar_sound_unverified":
      return conf === "inferred" ? "Similar atmosphere (editor's wildcard)" : "Similar atmosphere";
  }
}

export function buildExplanation(
  cat: Catalogue,
  path: Path,
  ctx: RankContext,
  band: Band,
): RecommendationExplanation {
  const steps: ExplanationStep[] = path.hops.map((h) => ({
    fromId: h.from,
    fromLabel: nameOf(cat, h.from),
    relation: h.relation,
    toId: h.to,
    toLabel: nameOf(cat, h.to),
    confidence: provenanceConfidence(h.provenance),
  }));
  const first = path.hops[0]!;
  let headline = hopHeadline(cat, first);
  if (path.hops.length === 2) {
    const second = path.hops[1]!;
    headline = `${hopHeadline(cat, first)} → ${hopHeadline(cat, second).charAt(0).toLowerCase()}${hopHeadline(cat, second).slice(1)}`;
  }
  const isWildcard = band === "far" && steps.some((s) => s.confidence === "inferred");
  if (isWildcard)
    headline = `Editor's wildcard: ${headline.charAt(0).toLowerCase()}${headline.slice(1)}`;
  return { headline, steps, mode: ctx.mode, distance: ctx.distance, band, isWildcard };
}
