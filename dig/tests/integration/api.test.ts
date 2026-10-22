import { beforeAll, describe, expect, it } from "vitest";
import { freshApp, makeClient, type Client } from "./helpers";
import type { DigState } from "@/features/discovery/service";
import type { ImportRecord } from "@/features/imports/service";
import type { Crate, CrateItem } from "@/features/crates/service";

let a: Client;
let b: Client;
const key = () => `k-${Math.random().toString(36).slice(2)}-${Date.now()}`;

beforeAll(async () => {
  await freshApp();
  a = makeClient();
  b = makeClient();
});

describe("boot + envelope", () => {
  it("health reports a seeded catalogue", async () => {
    const r = await a.call<{ ok: boolean; recordings: number }>("GET", "/health");
    expect(r.data.ok).toBe(true);
    expect(r.data.recordings).toBeGreaterThan(100);
  });
  it("validation errors use the envelope", async () => {
    const r = await a.call("POST", "/digs", { seed: { type: "nope" } });
    expect(r.status).toBe(400);
    expect(r.error?.code).toBe("VALIDATION");
  });
});

describe("dig session lifecycle", () => {
  let dig: DigState;
  it("starts from a scene and returns a card + suggestions", async () => {
    const r = await a.call<DigState>("POST", "/digs", {
      seed: { type: "scene", slug: "dub-techno" },
      mode: "connections",
      distance: "explore",
    });
    expect(r.status).toBe(200);
    dig = r.data;
    expect(dig.current?.card.recording.title).toBeTruthy();
    expect(dig.suggestions.length).toBeGreaterThan(0);
    expect(dig.suggestions[0]!.explanation.headline).toBeTruthy();
  });
  it("dig deeper creates a child node with an explanation and back returns", async () => {
    const r = await a.call<DigState>("POST", `/digs/${dig.session.id}/action`, {
      action: "dig_deeper",
      mode: "connections",
      distance: "explore",
      idempotencyKey: key(),
    });
    expect(r.data.current?.node.parentId).toBe(dig.current?.node.id);
    expect(r.data.current?.node.explanation?.steps.length).toBeGreaterThan(0);
    const back = await a.call<DigState>("POST", `/digs/${dig.session.id}/action`, {
      action: "back",
      idempotencyKey: key(),
    });
    expect(back.data.current?.node.id).toBe(dig.current?.node.id);
    expect(back.data.trail.length).toBe(2);
  });
  it("select picks a specific branch", async () => {
    const next = await a.call<DigState>("POST", `/digs/${dig.session.id}/next`, {
      mode: "feeling",
      distance: "wild",
    });
    const target = next.data.suggestions[1]!;
    const r = await a.call<DigState>("POST", `/digs/${dig.session.id}/action`, {
      action: "select",
      candidateId: target.candidateId,
      idempotencyKey: key(),
    });
    expect(r.data.current?.card.recording.id).toBe(target.card.recording.id);
    expect(r.data.current?.node.branchMode).toBe("feeling");
    dig = r.data;
  });
  it("keep is idempotent and saves to All Finds exactly once", async () => {
    const k = key();
    const r1 = await a.call<DigState>("POST", `/digs/${dig.session.id}/action`, {
      action: "keep",
      idempotencyKey: k,
    });
    const r2 = await a.call<DigState>("POST", `/digs/${dig.session.id}/action`, {
      action: "keep",
      idempotencyKey: k,
    });
    expect(r1.data.current?.node.outcome).toBe("kept");
    expect(r2.data.current?.node.id).toBe(r1.data.current?.node.id);
    await a.call("POST", `/digs/${dig.session.id}/action`, {
      action: "keep",
      idempotencyKey: key(),
    });
    const crates = await a.call<{ crates: Crate[] }>("GET", "/crates");
    const all = crates.data.crates.find((c) => c.systemKey === "all_finds")!;
    const items = await a.call<{ items: CrateItem[] }>("GET", `/crates/${all.id}/items`);
    expect(
      items.data.items.filter((i) => i.recordingId === dig.current?.card.recording.id).length,
    ).toBe(1);
    expect(r1.data.lastGoodNodeId).toBe(dig.current?.node.id);
  });
  it("wrong direction changes only the session and offers the way back", async () => {
    const before = await a.call<{ signalCount: number }>("GET", "/profile/taste");
    const deeper = await a.call<DigState>("POST", `/digs/${dig.session.id}/action`, {
      action: "dig_deeper",
      mode: "unexpected",
      distance: "wild",
      idempotencyKey: key(),
    });
    const badNode = deeper.data.current!.node;
    const r = await a.call<DigState>("POST", `/digs/${dig.session.id}/action`, {
      action: "wrong_direction",
      reasonCode: "too_similar",
      idempotencyKey: key(),
    });
    expect(r.data.current?.node.id).not.toBe(badNode.id);
    expect(r.data.sessionNote).toMatch(/Changed this dig only/);
    expect(r.data.changed?.length).toBeGreaterThan(0);
    expect(r.data.lastGoodNodeId).toBeTruthy();
    expect(r.data.trail.find((n) => n.id === badNode.id)?.outcome).toBe("wrong_direction");
    const after = await a.call<{ signalCount: number }>("GET", "/profile/taste");
    expect(after.data.signalCount).toBe(before.data.signalCount);
    const full = await a.call<DigState & { debug?: unknown }>("GET", `/digs/${dig.session.id}`);
    expect(full.data.suggestions.map((s) => s.card.recording.id)).not.toContain(
      badNode.recordingId,
    );
  });
  it("resume restores current node, trail and queue", async () => {
    const r = await a.call<DigState>("POST", `/digs/${dig.session.id}/resume`);
    expect(r.data.current?.node).toBeTruthy();
    expect(r.data.trail.length).toBeGreaterThan(3);
    expect(r.data.queue).toBeTruthy();
    const list = await a.call<{ sessions: Array<{ id: string }> }>("GET", "/digs");
    expect(list.data.sessions[0]!.id).toBe(dig.session.id);
  });
  it("fork creates a child session preserving the original trail", async () => {
    const before = await a.call<DigState>("GET", `/digs/${dig.session.id}`);
    const r = await a.call<DigState>("POST", `/digs/${dig.session.id}/fork`, {
      fromNodeId: before.data.trail[1]!.id,
      mode: "era_scene",
      distance: "focused",
    });
    expect(r.data.session.forkedFromSessionId).toBe(dig.session.id);
    expect(r.data.session.seedType).toBe("fork");
    expect(r.data.current?.card.recording.id).toBe(before.data.trail[1]!.recordingId);
    const after = await a.call<DigState>("GET", `/digs/${dig.session.id}`);
    expect(after.data.trail.length).toBe(before.data.trail.length);
  });
  it("three passes produce a nudge, and pass is weak", async () => {
    const fresh = await a.call<DigState>("POST", "/digs", {
      seed: { type: "scene", slug: "detroit-techno" },
      mode: "connections",
      distance: "focused",
    });
    let s = fresh.data;
    for (let i = 0; i < 3; i++)
      s = (
        await a.call<DigState>("POST", `/digs/${s.session.id}/action`, {
          action: "pass",
          idempotencyKey: key(),
        })
      ).data;
    expect(s.nudge).toMatch(/Three passes/);
  });
});

describe("isolation (RLS-equivalent at the service layer)", () => {
  it("user B cannot read, act on, or fork user A's dig", async () => {
    const mine = await a.call<{ sessions: Array<{ id: string }> }>("GET", "/digs");
    const id = mine.data.sessions[0]!.id;
    expect((await b.call("GET", `/digs/${id}`)).status).toBe(403);
    expect(
      (await b.call("POST", `/digs/${id}/action`, { action: "keep", idempotencyKey: key() }))
        .status,
    ).toBe(403);
    expect((await b.call("GET", "/digs")).data).toMatchObject({ sessions: [] });
  });
  it("user B cannot read user A's crate or imports", async () => {
    const crates = await a.call<{ crates: Crate[] }>("GET", "/crates");
    const r = await b.call("GET", `/crates/${crates.data.crates[0]!.id}/items`);
    expect(r.status).toBe(403);
    const imp = await a.call<ImportRecord[]>("POST", "/imports", {
      urls: ["https://example.org/private-thing"],
    });
    expect(
      (await b.call("PATCH", `/imports/${imp.data[0]!.id}`, { userTitle: "hijack" })).status,
    ).toBe(403);
  });
});

describe("imports / resolve", () => {
  it("YouTube link parses offline into an embeddable unresolved source", async () => {
    const r = await a.call<ImportRecord>("POST", "/sources/resolve", {
      url: "https://youtu.be/dQw4w9WgXcQ?t=42&si=track",
    });
    expect(r.data.provider).toBe("youtube");
    expect(["unresolved", "needs_confirmation"]).toContain(r.data.status);
    expect(r.data.player?.capability).toBe("embed");
    expect(r.data.player?.embedUrl).toContain("youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(r.data.normalizedUrl).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  });
  it("uses oEmbed metadata (mocked) to propose a catalogue match that needs confirmation, then confirms it", async () => {
    const { submitImports } = await import("@/features/imports/service");
    const { getDb } = await import("@/lib/db/client");
    const { ensurePrincipal } = await import("@/features/identity/service");
    const { hashToken } = await import("@/lib/auth/guest");
    const db = await getDb();
    const p = await ensurePrincipal(db, hashToken(decodeURIComponent(a.cookie.split("=")[1]!)));
    const fakeFetch = (async () =>
      new Response(
        JSON.stringify({ title: "Pépé Bradock - Deep Burnt", author_name: "someuploader" }),
        { headers: { "content-type": "application/json" } },
      )) as unknown as typeof fetch;
    const [imp] = await submitImports(db, p.id, ["https://www.youtube.com/watch?v=abcdefghijk"], {
      network: true,
      fetch: fakeFetch,
    });
    expect(imp!.status).toBe("needs_confirmation"); // strong identifiers absent => never auto-matched
    expect(imp!.matchCandidates[0]!.card?.recording.title).toBe("Deep Burnt");
    const confirmed = await a.call<ImportRecord>("POST", `/imports/${imp!.id}/confirm`, {
      entityId: imp!.matchCandidates[0]!.recordingId,
    });
    expect(confirmed.data.status).toBe("identified");
    const dig = await a.call<DigState>("POST", "/digs", {
      seed: { type: "url", url: confirmed.data.normalizedUrl },
    });
    expect(dig.data.current?.card.recording.title).toBe("Deep Burnt");
  });
  it("a whole DJ set is kept as a mix, not a track", async () => {
    const { submitImports } = await import("@/features/imports/service");
    const { getDb } = await import("@/lib/db/client");
    const db = await getDb();
    const fakeFetch = (async () =>
      new Response(JSON.stringify({ title: "Boiler Room Berlin DJ Set 2h", author_name: "BR" }), {
        headers: { "content-type": "application/json" },
      })) as unknown as typeof fetch;
    const [imp] = await submitImports(
      db,
      (await a.call<{ principalId: string }>("GET", "/profile")).data.principalId,
      ["https://www.youtube.com/watch?v=mixmixmixmi"],
      { network: true, fetch: fakeFetch },
    );
    expect(imp!.kind).toBe("mix");
    expect(imp!.status).toBe("unresolved");
  });
  it("unsupported, Instagram, Discogs and malicious URLs are retained safely", async () => {
    const r = await a.call<ImportRecord[]>("POST", "/imports", {
      urls: [
        "https://www.instagram.com/reel/abc/",
        "https://www.discogs.com/release/12345-x",
        "http://169.254.169.254/latest/meta-data",
        "not a url at all",
        "https://somelabel.bandcamp.com/track/some-track",
      ],
    });
    const by = Object.fromEntries(r.data.map((i) => [i.originalUrl, i]));
    expect(by["https://www.instagram.com/reel/abc/"]!.status).toBe("unsupported");
    expect(by["https://www.discogs.com/release/12345-x"]!.player?.capability).toBe("none");
    expect(by["http://169.254.169.254/latest/meta-data"]!.status).toBe("unsupported");
    expect(by["not a url at all"]!.status).toBe("unsupported");
    expect(by["https://somelabel.bandcamp.com/track/some-track"]!.player?.capability).toBe(
      "external",
    );
    const saved = await a.call<CrateItem>(
      "POST",
      `/crates/${(await a.call<{ crates: Crate[] }>("GET", "/crates")).data.crates[0]!.id}/items`,
      { sourceId: by["https://www.instagram.com/reel/abc/"]!.sourceId },
    );
    expect(saved.data.importedUrl).toContain("instagram.com");
  });
  it("provider failure is retryable and never loses the link", async () => {
    const { submitImports } = await import("@/features/imports/service");
    const { getDb } = await import("@/lib/db/client");
    const db = await getDb();
    const boom = (async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    const [imp] = await submitImports(
      db,
      (await a.call<{ principalId: string }>("GET", "/profile")).data.principalId,
      ["https://soundcloud.com/someone/some-track"],
      { network: true, fetch: boom },
    );
    expect(["unresolved", "failed_retryable"]).toContain(imp!.status);
    expect(imp!.sourceId).toBeTruthy();
  });
});

describe("crates", () => {
  it("creates, saves, dedupes, moves, exports and deletes", async () => {
    const c = await a.call<Crate>("POST", "/crates", { title: "Tokyo 1983" });
    const search = await a.call<{ recordings: Array<{ recording: { id: string } }> }>(
      "GET",
      "/search",
      undefined,
      { q: "Takada" },
    );
    const rid = search.data.recordings[0]!.recording.id;
    const i1 = await a.call<CrateItem>("POST", `/crates/${c.data.id}/items`, { recordingId: rid });
    const i2 = await a.call<CrateItem>("POST", `/crates/${c.data.id}/items`, { recordingId: rid });
    expect(i1.data.id).toBe(i2.data.id);
    const patched = await a.call<CrateItem>("PATCH", `/crates/${c.data.id}/items/${i1.data.id}`, {
      notes: "want the Palto Flats reissue",
      tags: ["vinyl", "ambient"],
      status: "want_vinyl",
    });
    expect(patched.data.status).toBe("want_vinyl");
    const csv = await a.call<string>("GET", "/crates/export", undefined, {
      format: "csv",
      crateId: c.data.id,
    });
    expect(csv.data).toContain("want_vinyl");
    expect(csv.data.split("\n")[0]).toContain("source_url");
    const del = await a.call("DELETE", `/crates/${c.data.id}/items/${i1.data.id}`);
    expect(del.status).toBe(200);
    expect(
      (
        await a.call(
          "DELETE",
          `/crates/${(await a.call<{ crates: Crate[] }>("GET", "/crates")).data.crates.find((x) => x.systemKey === "all_finds")!.id}`,
        )
      ).status,
    ).toBe(409);
  });
});

describe("stable taste separation", () => {
  it("love without opt-in writes no stable signals; with opt-in it does; clearing taste keeps crates", async () => {
    const c = makeClient();
    const d = await c.call<DigState>("POST", "/digs", {
      seed: { type: "scene", slug: "deep-house" },
    });
    await c.call("POST", `/digs/${d.data.session.id}/action`, {
      action: "love",
      idempotencyKey: key(),
    });
    expect((await c.call<{ signalCount: number }>("GET", "/profile/taste")).data.signalCount).toBe(
      0,
    );
    await c.call("PATCH", "/profile", {
      personalizationOptIn: true,
      personalizationStrength: "light",
    });
    await c.call("POST", `/digs/${d.data.session.id}/action`, {
      action: "dig_deeper",
      idempotencyKey: key(),
    });
    await c.call("POST", `/digs/${d.data.session.id}/action`, {
      action: "love",
      idempotencyKey: key(),
    });
    const t = await c.call<{ signalCount: number; enabled: boolean }>("GET", "/profile/taste");
    expect(t.data.enabled).toBe(true);
    expect(t.data.signalCount).toBeGreaterThan(0);
    await c.call("DELETE", "/profile/taste");
    expect((await c.call<{ signalCount: number }>("GET", "/profile/taste")).data.signalCount).toBe(
      0,
    );
    const crates = await c.call<{ crates: Crate[] }>("GET", "/crates");
    expect(crates.data.crates[0]!.itemCount).toBe(2);
  });
  it("export and delete remove all private state", async () => {
    const c = makeClient();
    await c.call("POST", "/digs", { seed: { type: "scene", slug: "jazz-house" } });
    const exp = await c.call<string>("GET", "/profile/export");
    expect(JSON.parse(exp.data).sessions.length).toBe(1);
    const del = await c.call<{ deleted: boolean }>("POST", "/profile/delete", {
      confirm: "DELETE",
    });
    expect(del.data.deleted).toBe(true);
    expect(del.raw.headers.get("set-cookie")).toContain("Max-Age=0");
    const again = await c.call<{ sessions: unknown[] }>("GET", "/digs"); // same cookie => fresh principal
    expect(again.data.sessions).toEqual([]);
  });
});

describe("search", () => {
  it("groups results and supports year + tag filters", async () => {
    const r = await a.call<{
      recordings: unknown[];
      artists: Array<{ name: string; aliases: string[] }>;
      labels: unknown[];
    }>("GET", "/search", undefined, { q: "heard" });
    expect(r.data.recordings.length).toBeGreaterThan(0);
    expect(r.data.artists.some((x) => x.name === "Larry Heard")).toBe(true);
    const y = await a.call<{ recordings: Array<{ recording: { year: number } }> }>(
      "GET",
      "/search",
      undefined,
      { q: "", tag: "dub-techno", yearFrom: "1996", yearTo: "1999" },
    );
    expect(y.data.recordings.length).toBeGreaterThan(0);
    for (const c of y.data.recordings) expect(c.recording.year).toBeGreaterThanOrEqual(1996);
    const alias = await a.call<{ artists: Array<{ name: string }> }>("GET", "/search", undefined, {
      q: "KDJ",
    });
    expect(alias.data.artists.some((x) => x.name === "Moodymann")).toBe(true);
  });
});
