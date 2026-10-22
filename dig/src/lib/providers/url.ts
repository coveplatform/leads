import type { ProviderName } from "@/domain/types";

const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "si",
  "feature",
  "fbclid",
  "gclid",
  "igshid",
  "ref",
  "ref_src",
  "pp",
]);

export class InvalidUrlError extends Error {
  code = "VALIDATION" as const;
}

/**
 * Parse and normalise a user-supplied URL. Rejects anything that is not
 * http(s), anything pointing at private/loopback/link-local address space or
 * bare IPs (SSRF defence — we never fetch these anyway, but we refuse to
 * store them as "sources" either).
 */
export function parseUserUrl(raw: string): URL {
  const trimmed = raw.trim();
  if (!trimmed) throw new InvalidUrlError("Empty URL");
  let url: URL;
  try {
    url = new URL(/^[a-z]+:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    throw new InvalidUrlError("Not a valid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:")
    throw new InvalidUrlError("Only http(s) links are supported");
  if (url.username || url.password)
    throw new InvalidUrlError("Credentials in URLs are not allowed");
  const host = url.hostname.toLowerCase();
  if (isPrivateHost(host)) throw new InvalidUrlError("That address is not reachable from DIG");
  url.hostname = host;
  for (const k of [...url.searchParams.keys()])
    if (TRACKING_PARAMS.has(k)) url.searchParams.delete(k);
  url.hash = "";
  return url;
}

export function isPrivateHost(host: string): boolean {
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  )
    return true;
  if (!host.includes(".") && !host.includes(":")) return true; // bare hostnames
  if (/^\[?[0-9a-f:]+\]?$/i.test(host) && host.includes(":")) {
    const h = host.replace(/^\[|\]$/g, "").toLowerCase();
    return (
      h === "::1" ||
      h === "::" ||
      h.startsWith("fe80") ||
      h.startsWith("fc") ||
      h.startsWith("fd") ||
      h.startsWith("::ffff:")
    );
  }
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    return true; // any other bare IPv4 literal is refused too
  }
  return false;
}

export function detectProvider(url: URL): ProviderName {
  const h = url.hostname.replace(/^(www|m|music)\./, "");
  if (h === "youtube.com" || h === "youtu.be" || h === "youtube-nocookie.com") return "youtube";
  if (h === "soundcloud.com" || h === "on.soundcloud.com" || h === "snd.sc") return "soundcloud";
  if (h === "bandcamp.com" || h.endsWith(".bandcamp.com")) return "bandcamp";
  if (h === "discogs.com") return "discogs";
  if (h === "instagram.com" || h === "instagr.am") return "instagram";
  return "generic";
}

/** YouTube: watch?v=, youtu.be/, /shorts/, /embed/, /live/ and t= offsets ("1m30s", "90", "90s"). */
export function parseYouTube(
  url: URL,
): { videoId: string; startSeconds?: number; isPlaylistOnly: boolean } | null {
  const h = url.hostname.replace(/^(www|m|music)\./, "");
  let id: string | null = null;
  if (h === "youtu.be") id = url.pathname.slice(1).split("/")[0] ?? null;
  else if (h === "youtube.com" || h === "youtube-nocookie.com") {
    const parts = url.pathname.split("/").filter(Boolean);
    if (url.pathname === "/watch") id = url.searchParams.get("v");
    else if (["shorts", "embed", "live", "v"].includes(parts[0] ?? "")) id = parts[1] ?? null;
    else if (url.pathname === "/playlist")
      return { videoId: "", startSeconds: undefined, isPlaylistOnly: true };
  }
  if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) return null;
  const t = url.searchParams.get("t") ?? url.searchParams.get("start");
  return { videoId: id, startSeconds: t ? parseTimeOffset(t) : undefined, isPlaylistOnly: false };
}

export function parseTimeOffset(t: string): number | undefined {
  if (/^\d+s?$/.test(t)) return Number(t.replace("s", ""));
  const m = t.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!m || (!m[1] && !m[2] && !m[3])) return undefined;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

/** Heuristics used to flag an upload as a whole set rather than one track. */
export function looksLikeMix(title: string | undefined, durationSeconds?: number): boolean {
  if (durationSeconds && durationSeconds > 25 * 60) return true;
  if (!title) return false;
  return /\b(dj set|live set|mix(tape)?|boiler room|essential mix|podcast|full set|b2b|rinse fm|nts\b|radio show|live at|live @)\b/i.test(
    title,
  );
}

/** "Artist - Title (Remix)" → parts. Keeps remix/edit descriptors as version. */
export function splitArtistTitle(raw: string): {
  artist?: string;
  title: string;
  version?: string;
} {
  let s = raw
    .replace(/\s*\[(official|hd|hq|full|audio|video|visualizer|lyric)[^\]]*\]\s*/gi, " ")
    .replace(/\((official|hd|hq|full|audio|video|visualizer|lyric)[^)]*\)/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  let version: string | undefined;
  const v = s.match(/\(([^)]*(remix|edit|mix|version|dub|rework|live|instrumental)[^)]*)\)\s*$/i);
  if (v) {
    version = v[1]!.trim();
    s = s.slice(0, v.index).trim();
  }
  const sep = s.match(/\s[-–—]\s/);
  if (sep && sep.index !== undefined) {
    return {
      artist: s.slice(0, sep.index).trim(),
      title: s.slice(sep.index + sep[0].length).trim(),
      version,
    };
  }
  return { title: s, version };
}

export function normaliseForMatch(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\b(feat|ft|featuring)\.?\s.*$/, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
