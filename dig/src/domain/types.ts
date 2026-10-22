// Core domain contracts. Nothing here may reference provider-specific JSON.

export type ProviderName =
  "youtube" | "soundcloud" | "bandcamp" | "discogs" | "instagram" | "generic" | "demo";

export type PlaybackCapability = "embed" | "external" | "none";
export type Playability = "embeddable" | "external_only" | "unavailable" | "unknown";
export type EmbedType = "youtube" | "soundcloud" | "bandcamp" | "none";
export type SourceTargetType = "recording" | "release" | "unresolved" | "mix";

export type Provenance = "verified_metadata" | "licensed_data" | "human_curator" | "inferred";
export type ExplanationConfidence = "verified" | "curated" | "inferred";

export type DigMode = "feeling" | "connections" | "era_scene" | "unexpected";
export type DigDistance = "focused" | "explore" | "wild";
export const DIG_MODES: DigMode[] = ["feeling", "connections", "era_scene", "unexpected"];
export const DIG_DISTANCES: DigDistance[] = ["focused", "explore", "wild"];

export type RelationType =
  | "same_label"
  | "same_artist"
  | "artist_alias"
  | "remixed_by"
  | "same_release"
  | "producer_overlap"
  | "collaborated_with"
  | "same_era_scene"
  | "curated_together"
  | "tag_similarity"
  | "similar_sound_unverified";

export type DigAction =
  "pass" | "keep" | "love" | "dig_deeper" | "wrong_direction" | "back" | "select";

export type WrongDirectionReason =
  | "too_polished"
  | "too_aggressive"
  | "too_similar"
  | "too_far_from_seed"
  | "wrong_era"
  | "not_interested_in_branch"
  | "other";

export interface Artist {
  id: string;
  name: string;
  aliases: string[];
  country: string | null;
}

export interface Label {
  id: string;
  name: string;
  country: string | null;
}

export interface Tag {
  id: string;
  slug: string;
  name: string;
  kind: "style" | "scene" | "mood" | "era" | "region";
}

export interface Release {
  id: string;
  title: string;
  releaseType: string;
  labelId: string | null;
  catalogueNumber: string | null;
  releaseYear: number | null;
  country: string | null;
  artworkUrl: string | null;
}

export interface Recording {
  id: string;
  title: string;
  disambiguation: string | null;
  year: number | null;
  primaryArtistId: string | null;
  metadataConfidence: number;
  isDemo: boolean;
}

export interface MusicSource {
  id: string;
  provider: ProviderName;
  externalId: string | null;
  canonicalUrl: string;
  targetType: SourceTargetType;
  targetId: string | null;
  displayTitle: string | null;
  displayArtist: string | null;
  thumbnailUrl: string | null;
  embedType: EmbedType;
  embedUrl: string | null;
  playability: Playability;
  rightsStatus: string;
  attribution: string | null;
}

export interface MusicEdge {
  id: string;
  fromType: string;
  fromId: string;
  toType: string;
  toId: string;
  relationType: RelationType;
  weight: number;
  provenance: Provenance;
  provenanceRef: string | null;
  confidence: number;
  explanationTemplate: string | null;
}

export interface ExplanationStep {
  fromId: string;
  fromLabel: string;
  relation: RelationType;
  toId: string;
  toLabel: string;
  confidence: ExplanationConfidence;
}

export interface RecommendationExplanation {
  headline: string;
  steps: ExplanationStep[];
  mode: DigMode;
  distance: DigDistance;
  band: "close" | "adjacent" | "far";
  isWildcard: boolean;
}

/** A card the UI can render: a recording plus its best source and context. */
export interface RecordCard {
  recording: Recording;
  artist: Artist | null;
  credits: Array<{ artist: Artist; role: string }>;
  release: Release | null;
  label: Label | null;
  tags: Tag[];
  source: MusicSource | null;
  sources: MusicSource[];
}

export interface Suggestion {
  candidateId: string;
  card: RecordCard;
  explanation: RecommendationExplanation;
  score: number;
  viaEdgeId: string | null;
  scoreDebugAvailable: boolean;
  trace?: Record<string, number>;
}

export interface PlayerConfig {
  capability: PlaybackCapability;
  embedUrl?: string;
  externalUrl: string;
  providerLabel: string;
  note?: string;
}

export interface ResolveResult {
  originalUrl: string;
  canonicalUrl: string;
  provider: ProviderName;
  externalId?: string;
  resolvedEntityId?: string;
  confidence: number;
  title?: string;
  artist?: string;
  thumbnailUrl?: string;
  kind: "recording" | "release" | "mix" | "unresolved";
  playback: PlaybackCapability;
  embedUrl?: string;
  attribution?: string;
  requiresConfirmation: boolean;
  startSeconds?: number;
  unsupportedReason?: string;
}
