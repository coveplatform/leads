import type { DigDistance, DigMode, RecordCard } from "@/domain/types";

export const MODE_LABEL: Record<DigMode, string> = {
  feeling: "Similar feeling",
  connections: "Connections",
  era_scene: "Era & scene",
  unexpected: "Unexpected",
};
export const MODE_BLURB: Record<DigMode, string> = {
  feeling: "Mood and texture: tags, curated neighbours, atmosphere.",
  connections: "Labels, aliases, remixers, collaborators. Verified links first.",
  era_scene: "Same years, same city, same scene.",
  unexpected: "Two-hop detours that still explain themselves.",
};
export const DISTANCE_LABEL: Record<DigDistance, string> = {
  focused: "Focused",
  explore: "Explore",
  wild: "Wild",
};
export const DISTANCE_BLURB: Record<DigDistance, string> = {
  focused: "Stay close to the anchor.",
  explore: "Mostly close, some detours.",
  wild: "Mostly detours, still traceable.",
};

export function cardTitle(card: RecordCard): string {
  return card.recording.disambiguation
    ? `${card.recording.title} (${card.recording.disambiguation})`
    : card.recording.title;
}

export function cardMeta(card: RecordCard): string {
  return [
    card.release && card.release.title !== card.recording.title ? card.release.title : null,
    card.label?.name,
    card.recording.year,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function relativeTime(iso: string): string {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return "just now";
  if (d < 3600) return `${Math.floor(d / 60)} min ago`;
  if (d < 86400) return `${Math.floor(d / 3600)} h ago`;
  if (d < 7 * 86400) return `${Math.floor(d / 86400)} d ago`;
  return new Date(iso).toLocaleDateString();
}

export function relationLabel(rel: string): string {
  return rel.replace(/_/g, " ");
}

/** Deterministic placeholder hue from an id so sleeve placeholders vary. */
export function hueOf(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return h;
}
