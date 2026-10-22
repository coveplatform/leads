import type { DigDistance, DigMode, RelationType } from "@/domain/types";

/** Everything the ranking needs about the *current session* (never stable taste). */
export interface SessionState {
  seedRecordingId: string;
  visited: string[];
  excluded: string[];
  /** relation type -> accumulated penalty 0..1 (from Wrong direction) */
  rejectedEdgeTypes: Record<string, number>;
  /** tag id -> penalty 0..1 */
  rejectedTags: Record<string, number>;
  /** tag id -> affinity -1..1 (keep/love/pass within this session) */
  tagAffinity: Record<string, number>;
  artistAffinity: Record<string, number>;
  labelAffinity: Record<string, number>;
  consecutivePasses: number;
  wrongDirections: number;
}

/** Opt-in stable taste summary; empty when personalisation is off. */
export interface StableTaste {
  enabled: boolean;
  strength: "off" | "light" | "moderate";
  tagAffinity: Record<string, number>;
  artistAffinity: Record<string, number>;
  labelAffinity: Record<string, number>;
}

export interface RankContext {
  currentRecordingId: string;
  mode: DigMode;
  distance: DigDistance;
  session: SessionState;
  taste: StableTaste;
  pageSize: number;
  poolSize: number;
  includeTrace: boolean;
}

export type Band = "close" | "adjacent" | "far";

export interface Path {
  hops: Array<{
    edgeId: string;
    relation: RelationType;
    from: string;
    to: string;
    forward: boolean;
    weight: number;
    confidence: number;
    provenance: string;
  }>;
  target: string;
}

export const EMPTY_TASTE: StableTaste = {
  enabled: false,
  strength: "off",
  tagAffinity: {},
  artistAffinity: {},
  labelAffinity: {},
};

export function emptySession(seed: string): SessionState {
  return {
    seedRecordingId: seed,
    visited: [seed],
    excluded: [],
    rejectedEdgeTypes: {},
    rejectedTags: {},
    tagAffinity: {},
    artistAffinity: {},
    labelAffinity: {},
    consecutivePasses: 0,
    wrongDirections: 0,
  };
}
