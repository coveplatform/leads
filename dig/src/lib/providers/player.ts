import type { MusicSource, PlayerConfig } from "@/domain/types";
import { providerByName } from "./adapters";

/** Honest player config from a stored source. Never claims playback we can't provide. */
export function playerConfigForSource(src: MusicSource | null): PlayerConfig | null {
  if (!src) return null;
  const provider = providerByName(src.provider);
  if (src.playability === "unavailable") {
    return {
      capability: "none",
      externalUrl: src.canonicalUrl,
      providerLabel:
        provider.name === "demo"
          ? "YouTube"
          : provider.getPlayerConfig({
              canonicalUrl: src.canonicalUrl,
              playback: "none",
              provider: src.provider,
            }).providerLabel,
      note: src.attribution ?? "This source is no longer available.",
    };
  }
  const cfg = provider.getPlayerConfig({
    canonicalUrl: src.canonicalUrl,
    embedUrl: src.embedUrl ?? undefined,
    playback: src.playability === "embeddable" ? "embed" : "external",
    provider: src.provider,
  });
  if (src.playability !== "embeddable" && cfg.capability === "embed")
    return { ...cfg, capability: "external", embedUrl: undefined };
  if (src.provider === "demo")
    return { ...cfg, providerLabel: "YouTube", note: src.attribution ?? cfg.note };
  return cfg;
}
