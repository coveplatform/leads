import { describe, expect, it } from "vitest";
import {
  detectProvider,
  isPrivateHost,
  looksLikeMix,
  parseTimeOffset,
  parseUserUrl,
  parseYouTube,
  splitArtistTitle,
  normaliseForMatch,
} from "@/lib/providers/url";

describe("parseUserUrl", () => {
  it("normalises and strips tracking params", () => {
    const u = parseUserUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&si=abc&utm_source=x#t=1");
    expect(u.toString()).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  });
  it("adds https when the scheme is missing", () => {
    expect(parseUserUrl("youtu.be/dQw4w9WgXcQ").hostname).toBe("youtu.be");
  });
  it("rejects non-http schemes and credentials", () => {
    expect(() => parseUserUrl("ftp://example.com/x")).toThrow();
    expect(() => parseUserUrl("https://user:pw@example.com/")).toThrow();
    expect(() => parseUserUrl("javascript:alert(1)")).toThrow();
  });
  it("blocks private / internal addresses (SSRF)", () => {
    for (const h of [
      "localhost",
      "127.0.0.1",
      "10.0.0.5",
      "192.168.1.1",
      "172.16.0.1",
      "169.254.169.254",
      "[::1]",
      "metadata.internal",
      "intranet",
    ]) {
      expect(() => parseUserUrl(`http://${h}/x`)).toThrow();
      expect(isPrivateHost(h.replace(/^\[|\]$/g, ""))).toBe(true);
    }
    expect(isPrivateHost("soundcloud.com")).toBe(false);
  });
});

describe("provider detection + YouTube parsing", () => {
  it("detects providers", () => {
    expect(detectProvider(new URL("https://youtu.be/abc"))).toBe("youtube");
    expect(detectProvider(new URL("https://music.youtube.com/watch?v=x"))).toBe("youtube");
    expect(detectProvider(new URL("https://soundcloud.com/a/b"))).toBe("soundcloud");
    expect(detectProvider(new URL("https://label.bandcamp.com/track/x"))).toBe("bandcamp");
    expect(detectProvider(new URL("https://www.discogs.com/release/1"))).toBe("discogs");
    expect(detectProvider(new URL("https://www.instagram.com/reel/x"))).toBe("instagram");
    expect(detectProvider(new URL("https://example.org/"))).toBe("generic");
  });
  it("parses watch, short, shorts, embed and time offsets", () => {
    expect(parseYouTube(new URL("https://www.youtube.com/watch?v=dQw4w9WgXcQ"))?.videoId).toBe(
      "dQw4w9WgXcQ",
    );
    expect(parseYouTube(new URL("https://youtu.be/dQw4w9WgXcQ?t=1m30s"))).toEqual({
      videoId: "dQw4w9WgXcQ",
      startSeconds: 90,
      isPlaylistOnly: false,
    });
    expect(parseYouTube(new URL("https://www.youtube.com/shorts/dQw4w9WgXcQ"))?.videoId).toBe(
      "dQw4w9WgXcQ",
    );
    expect(
      parseYouTube(new URL("https://www.youtube.com/embed/dQw4w9WgXcQ?start=42"))?.startSeconds,
    ).toBe(42);
    expect(
      parseYouTube(new URL("https://www.youtube.com/playlist?list=PL123"))?.isPlaylistOnly,
    ).toBe(true);
    expect(parseYouTube(new URL("https://www.youtube.com/watch?v=short"))).toBeNull();
  });
  it("parses time offsets", () => {
    expect(parseTimeOffset("90")).toBe(90);
    expect(parseTimeOffset("90s")).toBe(90);
    expect(parseTimeOffset("1h2m3s")).toBe(3723);
    expect(parseTimeOffset("abc")).toBeUndefined();
  });
});

describe("title handling", () => {
  it("splits artist/title and keeps the version", () => {
    expect(
      splitArtistTitle("Theo Parrish - Falling Up (Carl Craig Remix) [Official Audio]"),
    ).toEqual({ artist: "Theo Parrish", title: "Falling Up", version: "Carl Craig Remix" });
    expect(splitArtistTitle("Deep Burnt")).toEqual({ title: "Deep Burnt", version: undefined });
  });
  it("flags whole sets as mixes", () => {
    expect(looksLikeMix("Ben UFO Boiler Room London DJ Set")).toBe(true);
    expect(looksLikeMix("Pépé Bradock - Deep Burnt")).toBe(false);
    expect(looksLikeMix("anything", 60 * 60)).toBe(true);
  });
  it("normalises unicode and feat.", () => {
    expect(normaliseForMatch("Pépé Bradock")).toBe("pepe bradock");
    expect(normaliseForMatch("Never Tell You feat. Tikiman")).toBe("never tell you");
  });
});
