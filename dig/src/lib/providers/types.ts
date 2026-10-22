import type { PlayerConfig, ProviderName, ResolveResult } from "@/domain/types";

export interface ProviderDeps {
  /** Network allowed? (DIG_PROVIDER_NETWORK) */
  network: boolean;
  /** Injected fetch so tests never hit the internet. */
  fetch: typeof fetch;
}

export interface MusicProvider {
  name: ProviderName;
  canHandle(url: URL): boolean;
  resolve(url: URL, deps: ProviderDeps): Promise<ResolveResult>;
  getPlayerConfig(
    item: Pick<ResolveResult, "canonicalUrl" | "embedUrl" | "playback" | "provider">,
  ): PlayerConfig;
}

export const PROVIDER_LABEL: Record<ProviderName, string> = {
  youtube: "YouTube",
  soundcloud: "SoundCloud",
  bandcamp: "Bandcamp",
  discogs: "Discogs",
  instagram: "Instagram",
  generic: "the source",
  demo: "a provider search",
};

/** Bounded, allow-listed fetch of an official JSON endpoint. */
export async function fetchJsonBounded(
  deps: ProviderDeps,
  url: string,
  allowedHost: string,
  timeoutMs = 4000,
): Promise<unknown | null> {
  if (!deps.network) return null;
  const u = new URL(url);
  if (u.hostname !== allowedHost) throw new Error("Endpoint host not allow-listed");
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await deps.fetch(url, {
      signal: ctrl.signal,
      redirect: "error",
      headers: {
        accept: "application/json",
        "user-agent": "DIG/0.1 (+https://github.com/coveplatform/leads)",
      },
    });
    if (!res.ok) return null;
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len > 256_000) return null;
    const text = await res.text();
    if (text.length > 256_000) return null;
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}
