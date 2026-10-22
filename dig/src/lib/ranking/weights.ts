import type { DigDistance, DigMode, RelationType } from "@/domain/types";
import type { Band } from "./types";

export const STRONG_RELATIONS: ReadonlySet<RelationType> = new Set([
  "same_label",
  "same_artist",
  "artist_alias",
  "remixed_by",
  "same_release",
  "collaborated_with",
  "producer_overlap",
]);

/** How well each relation serves each mode (0..1). Starter heuristics; see ADR-0003. */
export const MODE_ALIGNMENT: Record<DigMode, Record<RelationType, number>> = {
  connections: {
    same_label: 1,
    same_artist: 0.9,
    artist_alias: 1,
    remixed_by: 1,
    same_release: 0.8,
    collaborated_with: 0.9,
    producer_overlap: 0.8,
    curated_together: 0.3,
    same_era_scene: 0.3,
    tag_similarity: 0.2,
    similar_sound_unverified: 0.1,
  },
  feeling: {
    tag_similarity: 1,
    similar_sound_unverified: 0.9,
    curated_together: 0.8,
    same_era_scene: 0.5,
    same_label: 0.4,
    same_artist: 0.3,
    artist_alias: 0.3,
    remixed_by: 0.4,
    same_release: 0.3,
    collaborated_with: 0.3,
    producer_overlap: 0.3,
  },
  era_scene: {
    same_era_scene: 1,
    same_label: 0.7,
    curated_together: 0.6,
    tag_similarity: 0.5,
    same_release: 0.5,
    same_artist: 0.4,
    artist_alias: 0.4,
    remixed_by: 0.3,
    collaborated_with: 0.4,
    producer_overlap: 0.4,
    similar_sound_unverified: 0.2,
  },
  unexpected: {
    similar_sound_unverified: 0.9,
    producer_overlap: 0.8,
    collaborated_with: 0.7,
    artist_alias: 0.7,
    curated_together: 0.6,
    tag_similarity: 0.4,
    same_era_scene: 0.4,
    same_label: 0.3,
    remixed_by: 0.3,
    same_artist: 0.2,
    same_release: 0.1,
  },
};

/** Candidate allocation targets per distance (fractions of a page). */
export const DISTANCE_ALLOCATION: Record<DigDistance, Record<Band, number>> = {
  focused: { close: 0.8, adjacent: 0.18, far: 0.02 },
  explore: { close: 0.6, adjacent: 0.3, far: 0.1 },
  wild: { close: 0.25, adjacent: 0.4, far: 0.35 },
};

export const SCORE_WEIGHTS = {
  connection_relevance: 0.3,
  mode_alignment: 0.2,
  session_positive_affinity: 0.13,
  provenance_confidence: 0.12,
  curated_quality: 0.1,
  source_playability: 0.08,
  novelty: 0.07,
} as const;

export const PERSONALISATION_CAP = 0.05;
export const PERSONALISATION_STRENGTH: Record<"off" | "light" | "moderate", number> = {
  off: 0,
  light: 0.5,
  moderate: 1,
};

/** Session signal scale (blueprint §12.5). */
export const SIGNALS = {
  pass: -0.05,
  keep: 0.4,
  love: 0.9,
  wrong_direction: -0.8,
  revisit: 0.25,
  keep_stable: 0.15,
  love_stable: 0.8,
} as const;

export function provenanceConfidence(p: string): "verified" | "curated" | "inferred" {
  if (p === "verified_metadata" || p === "licensed_data") return "verified";
  if (p === "human_curator") return "curated";
  return "inferred";
}
