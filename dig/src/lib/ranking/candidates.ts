import type { Catalogue } from "@/lib/catalogue/graph";
import type { Band, Path, RankContext } from "./types";
import { STRONG_RELATIONS } from "./weights";

/** Classify a path into a distance band from graph structure only. */
export function bandOf(path: Path): Band {
  if (path.hops.length === 1) {
    const h = path.hops[0]!;
    if (h.relation === "similar_sound_unverified") return "far";
    if (STRONG_RELATIONS.has(h.relation)) return "close";
    return "adjacent";
  }
  const allStrong = path.hops.every((h) => STRONG_RELATIONS.has(h.relation));
  const anyInferred = path.hops.some(
    (h) => h.relation === "similar_sound_unverified" || h.provenance === "inferred",
  );
  if (allStrong) return "adjacent";
  if (anyInferred) return "far";
  return path.hops.length === 2 ? "adjacent" : "far";
}

/**
 * Collect 1- and 2-hop paths from the current recording, keeping, for each
 * reachable recording, the single best path (highest product of edge weights,
 * ties broken deterministically by edge id).
 */
export function retrievePaths(cat: Catalogue, ctx: RankContext): Map<string, Path> {
  const start = ctx.currentRecordingId;
  const banned = new Set([...ctx.session.visited, ...ctx.session.excluded, start]);
  const best = new Map<string, Path>();
  const consider = (p: Path) => {
    if (banned.has(p.target)) return;
    const prev = best.get(p.target);
    if (
      !prev ||
      pathStrength(p) > pathStrength(prev) ||
      (pathStrength(p) === pathStrength(prev) && pathKey(p) < pathKey(prev))
    )
      best.set(p.target, p);
  };
  const firstHops = cat.adjacency.get(start) ?? [];
  for (const a of firstHops) {
    const hop = {
      edgeId: a.edge.id,
      relation: a.edge.relationType,
      from: start,
      to: a.to,
      forward: a.forward,
      weight: a.edge.weight,
      confidence: a.edge.confidence,
      provenance: a.edge.provenance,
    };
    consider({ hops: [hop], target: a.to });
    for (const b of cat.adjacency.get(a.to) ?? []) {
      if (b.to === start) continue;
      const hop2 = {
        edgeId: b.edge.id,
        relation: b.edge.relationType,
        from: a.to,
        to: b.to,
        forward: b.forward,
        weight: b.edge.weight,
        confidence: b.edge.confidence,
        provenance: b.edge.provenance,
      };
      consider({ hops: [hop, hop2], target: b.to });
    }
  }
  // Curated sets containing the current record also propose their members.
  for (const setId of cat.recordingCurations.get(start) ?? []) {
    const set = cat.curations.get(setId);
    if (!set) continue;
    for (const member of set.items) {
      if (member === start) continue;
      const edge = firstHops.find(
        (a) => a.to === member && a.edge.relationType === "curated_together",
      );
      if (edge) continue; // already a 1-hop curated edge
      consider({
        hops: [
          {
            edgeId: `curation:${setId}`,
            relation: "curated_together",
            from: start,
            to: member,
            forward: true,
            weight: 0.6,
            confidence: 0.8,
            provenance: "human_curator",
          },
        ],
        target: member,
      });
    }
  }
  return best;
}

export function pathStrength(p: Path): number {
  return p.hops.reduce((acc, h) => acc * h.weight, 1) * (p.hops.length === 2 ? 0.6 : 1);
}

export function pathKey(p: Path): string {
  return p.hops.map((h) => h.edgeId).join(">");
}
