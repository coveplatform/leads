import type { Catalogue } from "@/lib/catalogue/graph";
import { recordingLabelId, recordingPeople } from "@/lib/catalogue/graph";
import type { Path, RankContext } from "./types";
import {
  MODE_ALIGNMENT,
  PERSONALISATION_CAP,
  PERSONALISATION_STRENGTH,
  SCORE_WEIGHTS,
  provenanceConfidence,
} from "./weights";
import { pathStrength } from "./candidates";

const clamp = (x: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));

function affinity(map: Record<string, number>, keys: string[]): number {
  if (keys.length === 0) return 0;
  let sum = 0;
  for (const k of keys) sum += map[k] ?? 0;
  return clamp(sum / keys.length, -1, 1);
}

export interface Scored {
  recordingId: string;
  path: Path;
  score: number;
  trace: Record<string, number>;
}

export function scoreCandidate(cat: Catalogue, path: Path, ctx: RankContext): Scored {
  const id = path.target;
  const tags = cat.recordingTags.get(id) ?? [];
  const people = recordingPeople(cat, id);
  const label = recordingLabelId(cat, id);
  const labelKeys = label ? [label] : [];

  const connection_relevance = clamp(
    pathStrength(path) * (ctx.mode === "unexpected" && path.hops.length === 2 ? 1.6 : 1),
  );
  const mode_alignment = path.hops.reduce(
    (acc, h) => Math.min(acc, MODE_ALIGNMENT[ctx.mode][h.relation]),
    1,
  );
  const s = ctx.session;
  const session_positive_affinity = clamp(
    (affinity(s.tagAffinity, tags) +
      affinity(s.artistAffinity, people) +
      affinity(s.labelAffinity, labelKeys) +
      1) /
      2,
  );
  const provenance_confidence =
    path.hops.reduce((acc, h) => Math.min(acc, h.confidence), 1) *
    (path.hops.every((h) => provenanceConfidence(h.provenance) !== "inferred") ? 1 : 0.7);
  const curated_quality = clamp((cat.recordingCurations.get(id)?.length ?? 0) / 2);
  const src = cat.sources.get(id)?.[0];
  const source_playability = src
    ? ({ embeddable: 1, external_only: 0.7, unknown: 0.4, unavailable: 0.1 } as const)[
        src.playability
      ]
    : 0.2;
  const seenPeople = new Set(ctx.session.visited.flatMap((v) => recordingPeople(cat, v)));
  const novelty = people.length && people.every((p) => seenPeople.has(p)) ? 0.2 : 1;

  let personalisation_bonus = 0;
  if (ctx.taste.enabled && ctx.taste.strength !== "off") {
    const t =
      (affinity(ctx.taste.tagAffinity, tags) +
        affinity(ctx.taste.artistAffinity, people) +
        affinity(ctx.taste.labelAffinity, labelKeys)) /
      3;
    personalisation_bonus = clamp(
      t * PERSONALISATION_CAP * PERSONALISATION_STRENGTH[ctx.taste.strength],
      -PERSONALISATION_CAP,
      PERSONALISATION_CAP,
    );
  }

  const repeated_artist_penalty = people.some((p) => (s.artistAffinity[p] ?? 0) < -0.3) ? 0.1 : 0;
  const visited_penalty = s.visited.includes(id) ? 1 : 0;
  const session_wrong_direction_penalty = clamp(
    Math.max(...path.hops.map((h) => s.rejectedEdgeTypes[h.relation] ?? 0), 0) * 0.3 +
      (tags.length ? Math.max(...tags.map((t) => s.rejectedTags[t] ?? 0), 0) : 0) * 0.3,
  );
  const very_common_overexposure_penalty = 0; // no popularity data in Phase 1; never invented

  const score =
    SCORE_WEIGHTS.connection_relevance * connection_relevance +
    SCORE_WEIGHTS.mode_alignment * mode_alignment +
    SCORE_WEIGHTS.session_positive_affinity * session_positive_affinity +
    SCORE_WEIGHTS.provenance_confidence * provenance_confidence +
    SCORE_WEIGHTS.curated_quality * curated_quality +
    SCORE_WEIGHTS.source_playability * source_playability +
    SCORE_WEIGHTS.novelty * novelty +
    personalisation_bonus -
    repeated_artist_penalty -
    visited_penalty -
    session_wrong_direction_penalty -
    very_common_overexposure_penalty;

  return {
    recordingId: id,
    path,
    score: Math.round(score * 10000) / 10000,
    trace: {
      connection_relevance,
      mode_alignment,
      session_positive_affinity,
      provenance_confidence,
      curated_quality,
      source_playability,
      novelty,
      personalisation_bonus,
      repeated_artist_penalty,
      visited_penalty,
      session_wrong_direction_penalty,
    },
  };
}
