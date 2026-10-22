import type { PlayerConfig, ResolveResult } from "@/domain/types";
import { looksLikeMix, parseYouTube, splitArtistTitle } from "./url";
import { PROVIDER_LABEL, fetchJsonBounded, type MusicProvider, type ProviderDeps } from "./types";

const base = (url: URL, provider: ResolveResult["provider"]): ResolveResult => ({
  originalUrl: url.toString(),
  canonicalUrl: url.toString(),
  provider,
  confidence: 0,
  kind: "unresolved",
  playback: "external",
  requiresConfirmation: false,
});

function externalPlayer(
  provider: ResolveResult["provider"],
  externalUrl: string,
  note?: string,
): PlayerConfig {
  return { capability: "external", externalUrl, providerLabel: PROVIDER_LABEL[provider], note };
}

export const youtubeProvider: MusicProvider = {
  name: "youtube",
  canHandle: (url) => /(^|\.)youtu(\.be|be(-nocookie)?\.com)$/.test(url.hostname),
  async resolve(url, deps) {
    const parsed = parseYouTube(url);
    const r = base(url, "youtube");
    if (!parsed || parsed.isPlaylistOnly) {
      return {
        ...r,
        kind: "unresolved",
        unsupportedReason: parsed?.isPlaylistOnly
          ? "Playlists are not supported yet; paste a single video"
          : "Could not find a video id in that link",
      };
    }
    const canonical = `https://www.youtube.com/watch?v=${parsed.videoId}`;
    // Official privacy-enhanced embed; no Data API key needed to render it.
    const embed = `https://www.youtube-nocookie.com/embed/${parsed.videoId}?rel=0&modestbranding=1${parsed.startSeconds ? `&start=${parsed.startSeconds}` : ""}`;
    const out: ResolveResult = {
      ...r,
      canonicalUrl: canonical,
      externalId: parsed.videoId,
      playback: "embed",
      embedUrl: embed,
      startSeconds: parsed.startSeconds,
      kind: "recording",
      confidence: 0.3,
      attribution: "Playback via the official YouTube embedded player",
    };
    // Official oEmbed endpoint: public, no key, returns title/author only.
    const data = (await fetchJsonBounded(
      deps,
      `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(canonical)}`,
      "www.youtube.com",
    )) as { title?: string; author_name?: string; thumbnail_url?: string } | null;
    if (data?.title) {
      const parts = splitArtistTitle(data.title);
      out.title = parts.version ? `${parts.title} (${parts.version})` : parts.title;
      out.artist = parts.artist ?? data.author_name;
      out.thumbnailUrl = data.thumbnail_url;
      out.confidence = parts.artist ? 0.55 : 0.4;
      if (looksLikeMix(data.title)) {
        out.kind = "mix";
        out.title = data.title;
      }
    }
    return out;
  },
  getPlayerConfig: (item) =>
    item.embedUrl
      ? {
          capability: "embed",
          embedUrl: item.embedUrl,
          externalUrl: item.canonicalUrl,
          providerLabel: "YouTube",
        }
      : externalPlayer("youtube", item.canonicalUrl),
};

export const soundcloudProvider: MusicProvider = {
  name: "soundcloud",
  canHandle: (url) => /(^|\.)(soundcloud\.com|snd\.sc)$/.test(url.hostname),
  async resolve(url, deps) {
    const r = base(url, "soundcloud");
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length < 2 || ["discover", "search", "you", "stream"].includes(parts[0] ?? "")) {
      return { ...r, unsupportedReason: "Paste a link to a single SoundCloud track" };
    }
    const canonical = `https://soundcloud.com/${parts.slice(0, 2).join("/")}`;
    const isSet = parts[1] === "sets";
    const out: ResolveResult = {
      ...r,
      canonicalUrl: canonical,
      externalId: parts.slice(0, 2).join("/"),
      kind: isSet ? "unresolved" : "recording",
      confidence: 0.3,
      playback: "embed",
      embedUrl: `https://w.soundcloud.com/player/?url=${encodeURIComponent(canonical)}&color=%23b76a4c&auto_play=false&show_teaser=false`,
      attribution: "Playback via the official SoundCloud widget",
    };
    if (isSet) out.unsupportedReason = "Playlists/sets are saved as bookmarks only";
    const data = (await fetchJsonBounded(
      deps,
      `https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(canonical)}`,
      "soundcloud.com",
    )) as { title?: string; author_name?: string; thumbnail_url?: string } | null;
    if (data?.title) {
      const p = splitArtistTitle(data.title.replace(/\s+by\s+[^-]+$/i, ""));
      out.title = p.version ? `${p.title} (${p.version})` : p.title;
      out.artist = p.artist ?? data.author_name;
      out.thumbnailUrl = data.thumbnail_url;
      out.confidence = 0.5;
      if (looksLikeMix(data.title)) out.kind = "mix";
    }
    return out;
  },
  getPlayerConfig: (item) =>
    item.embedUrl
      ? {
          capability: "embed",
          embedUrl: item.embedUrl,
          externalUrl: item.canonicalUrl,
          providerLabel: "SoundCloud",
          note: "Private or removed tracks will not play here.",
        }
      : externalPlayer("soundcloud", item.canonicalUrl),
};

export const bandcampProvider: MusicProvider = {
  name: "bandcamp",
  canHandle: (url) => /(^|\.)bandcamp\.com$/.test(url.hostname),
  async resolve(url) {
    const r = base(url, "bandcamp");
    const m = url.pathname.match(/^\/(track|album)\/([^/]+)/);
    if (!m) return { ...r, unsupportedReason: "Paste a Bandcamp track or album page" };
    const kind = m[1] === "track" ? "recording" : "release";
    const slug = m[2]!.replace(/-/g, " ");
    // An arbitrary Bandcamp URL does not expose an authorised embed id without
    // the creator's embed code, so we link out rather than guess.
    return {
      ...r,
      kind,
      externalId: `${url.hostname}${url.pathname}`,
      title: slug,
      artist: url.hostname.split(".")[0],
      confidence: 0.35,
      playback: "external",
      attribution: "Listen on the artist's Bandcamp page",
    };
  },
  getPlayerConfig: (item) =>
    externalPlayer(
      "bandcamp",
      item.canonicalUrl,
      "Bandcamp embeds need the artist's embed code; opening the page instead.",
    ),
};

export const discogsProvider: MusicProvider = {
  name: "discogs",
  canHandle: (url) => /(^|\.)discogs\.com$/.test(url.hostname),
  async resolve(url) {
    const r = base(url, "discogs");
    const m = url.pathname.match(/\/(release|master)\/(\d+)/);
    if (!m) return { ...r, unsupportedReason: "Paste a Discogs release or master page" };
    return {
      ...r,
      kind: "release",
      externalId: `${m[1]}/${m[2]}`,
      confidence: 0.3,
      playback: "none",
      attribution: "Discogs is a reference, not an audio source",
    };
  },
  getPlayerConfig: (item) => ({
    capability: "none",
    externalUrl: item.canonicalUrl,
    providerLabel: "Discogs",
    note: "Discogs is a reference page; no audio here.",
  }),
};

export const instagramProvider: MusicProvider = {
  name: "instagram",
  canHandle: (url) => /(^|\.)(instagram\.com|instagr\.am)$/.test(url.hostname),
  async resolve(url) {
    return {
      ...base(url, "instagram"),
      kind: "unresolved",
      confidence: 0,
      playback: "external",
      attribution: "Saved as a bookmark; DIG does not read Instagram content",
      unsupportedReason: "Instagram links are kept as bookmarks you can open",
    };
  },
  getPlayerConfig: (item) => externalPlayer("instagram", item.canonicalUrl, "Opens on Instagram."),
};

export const genericProvider: MusicProvider = {
  name: "generic",
  canHandle: () => true,
  async resolve(url) {
    return {
      ...base(url, "generic"),
      kind: "unresolved",
      confidence: 0,
      playback: "external",
      unsupportedReason: "Unsupported site: kept as a link you can open and describe",
    };
  },
  getPlayerConfig: (item) => externalPlayer("generic", item.canonicalUrl),
};

export const demoProvider: MusicProvider = {
  name: "demo",
  canHandle: () => false,
  async resolve(url) {
    return { ...base(url, "demo"), kind: "unresolved", confidence: 0, playback: "external" };
  },
  getPlayerConfig: (item) =>
    externalPlayer(
      "demo",
      item.canonicalUrl,
      "Sample record: opens a search on YouTube, not a verified upload.",
    ),
};

export const PROVIDERS: MusicProvider[] = [
  youtubeProvider,
  soundcloudProvider,
  bandcampProvider,
  discogsProvider,
  instagramProvider,
  genericProvider,
];

export function providerFor(url: URL): MusicProvider {
  return PROVIDERS.find((p) => p.canHandle(url)) ?? genericProvider;
}

export function providerByName(name: ResolveResult["provider"]): MusicProvider {
  return [...PROVIDERS, demoProvider].find((p) => p.name === name) ?? genericProvider;
}

export function defaultDeps(): ProviderDeps {
  return {
    network: process.env.DIG_PROVIDER_NETWORK !== "0",
    fetch: globalThis.fetch.bind(globalThis),
  };
}
