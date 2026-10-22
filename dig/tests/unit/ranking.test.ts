import { beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "@/lib/db/client";
import { migrate } from "@/lib/db/migrate";
import { recordingId, seedDemo } from "@/lib/db/seed";
import { loadCatalogue, type Catalogue } from "@/lib/catalogue/graph";
import {
  EMPTY_TASTE,
  bandOf,
  emptySession,
  nextDigCandidates,
  retrievePaths,
  DISTANCE_ALLOCATION,
  type RankContext,
} from "@/lib/ranking";

let db: Db;
let cat: Catalogue;
const ctx = (over: Partial<RankContext> = {}): RankContext => ({
  currentRecordingId: recordingId("phylyps-trak"),
  mode: "connections",
  distance: "explore",
  session: emptySession(recordingId("phylyps-trak")),
  taste: EMPTY_TASTE,
  pageSize: 10,
  poolSize: 60,
  includeTrace: true,
  ...over,
});

beforeAll(async () => {
  process.env.DIG_DB = "memory";
  db = await createDb();
  await migrate(db);
  await seedDemo(db);
  cat = await loadCatalogue(db);
});

describe("ranking", () => {
  it("is deterministic for the same inputs", () => {
    const a = nextDigCandidates(cat, ctx());
    const b = nextDigCandidates(cat, ctx());
    expect(a.suggestions.map((s) => s.candidateId)).toEqual(
      b.suggestions.map((s) => s.candidateId),
    );
    expect(a.suggestions.length).toBeGreaterThan(5);
  });
  it("never repeats the current or visited records and has no duplicates", () => {
    const visited = [recordingId("phylyps-trak"), recordingId("quadrant-dub"), recordingId("m4")];
    const r = nextDigCandidates(cat, ctx({ session: { ...emptySession(visited[0]!), visited } }));
    const ids = r.suggestions.map((s) => s.card.recording.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const v of visited) expect(ids).not.toContain(v);
  });
  it("gives every suggestion an explanation with provenance-labelled steps", () => {
    for (const s of nextDigCandidates(cat, ctx()).suggestions) {
      expect(s.explanation.headline.length).toBeGreaterThan(3);
      expect(s.explanation.steps.length).toBeGreaterThan(0);
      for (const st of s.explanation.steps)
        expect(["verified", "curated", "inferred"]).toContain(st.confidence);
      if (s.explanation.steps.some((st) => st.relation === "similar_sound_unverified"))
        expect(s.explanation.headline.toLowerCase()).toContain("similar atmosphere");
    }
  });
  it("Connections mode favours verified-style links; Feeling mode favours tags/curation", () => {
    const conn = nextDigCandidates(cat, ctx({ mode: "connections" })).suggestions;
    const feel = nextDigCandidates(cat, ctx({ mode: "feeling" })).suggestions;
    const strong = new Set([
      "same_label",
      "same_artist",
      "artist_alias",
      "remixed_by",
      "same_release",
      "collaborated_with",
      "producer_overlap",
    ]);
    const share = (xs: typeof conn) =>
      xs.filter((s) => s.explanation.steps.every((st) => strong.has(st.relation))).length /
      Math.max(1, xs.length);
    expect(share(conn)).toBeGreaterThanOrEqual(share(feel));
    expect(conn[0]!.explanation.steps[0]!.relation).toMatch(
      /same_label|same_artist|artist_alias|same_release|remixed_by/,
    );
  });
  it("distance allocation shifts the band mix toward 'far' for Wild", () => {
    const bands = (d: RankContext["distance"]) =>
      nextDigCandidates(
        cat,
        ctx({
          distance: d,
          currentRecordingId: recordingId("at-les"),
          session: emptySession(recordingId("at-les")),
        }),
      ).suggestions.map((s) => s.explanation.band);
    const focused = bands("focused");
    const wild = bands("wild");
    const far = (b: string[]) => b.filter((x) => x === "far").length;
    const close = (b: string[]) => b.filter((x) => x === "close").length;
    expect(close(focused)).toBeGreaterThanOrEqual(close(wild));
    expect(far(wild)).toBeGreaterThanOrEqual(far(focused));
    expect(DISTANCE_ALLOCATION.focused.close).toBeGreaterThan(DISTANCE_ALLOCATION.wild.close);
  });
  it("classifies bands from graph structure", () => {
    const paths = retrievePaths(cat, ctx());
    const bands = [...paths.values()].map(bandOf);
    expect(bands).toContain("close");
    expect(bands).toContain("adjacent");
  });
  it("wrong-direction penalties only affect the session context passed in", () => {
    const base = nextDigCandidates(cat, ctx()).suggestions;
    const rel = base[0]!.explanation.steps[0]!.relation;
    const penalised = nextDigCandidates(
      cat,
      ctx({
        session: { ...emptySession(recordingId("phylyps-trak")), rejectedEdgeTypes: { [rel]: 1 } },
      }),
    ).suggestions;
    const rank = (xs: typeof base, id: string) => xs.findIndex((s) => s.card.recording.id === id);
    const moved = base.some(
      (s) => rank(penalised, s.card.recording.id) !== rank(base, s.card.recording.id),
    );
    expect(moved).toBe(true);
    // and the untouched context still yields the original order
    expect(nextDigCandidates(cat, ctx()).suggestions.map((s) => s.candidateId)).toEqual(
      base.map((s) => s.candidateId),
    );
  });
  it("personalisation bonus is capped at ±0.05 and absent when taste is disabled", () => {
    const off = nextDigCandidates(cat, ctx()).suggestions;
    const on = nextDigCandidates(
      cat,
      ctx({
        taste: {
          enabled: true,
          strength: "moderate",
          tagAffinity: Object.fromEntries([...cat.tags.keys()].map((t) => [t, 1])),
          artistAffinity: {},
          labelAffinity: {},
        },
      }),
    ).suggestions;
    for (const s of off) expect(s.trace?.personalisation_bonus).toBe(0);
    for (const s of on)
      expect(Math.abs(s.trace?.personalisation_bonus ?? 0)).toBeLessThanOrEqual(0.05 + 1e-9);
  });
  it("keeps original and remix distinct", () => {
    const orig = recordingId("falling-up");
    const remix = recordingId("falling-up-cc");
    expect(cat.recordings.get(orig)?.title).toBe(cat.recordings.get(remix)?.title);
    expect(cat.recordings.get(remix)?.disambiguation).toBe("Carl Craig Remix");
    const r = nextDigCandidates(
      cat,
      ctx({ currentRecordingId: orig, session: emptySession(orig) }),
    );
    const hit = r.suggestions.find((s) => s.card.recording.id === remix);
    expect(hit?.explanation.headline).toMatch(/Remixed by/);
  });
  it("handles a sparse record with no connections honestly", () => {
    const sparse = recordingId("white-label");
    const r = nextDigCandidates(
      cat,
      ctx({ currentRecordingId: sparse, session: emptySession(sparse) }),
    );
    expect(r.exhausted).toBe(true);
    expect(r.suggestions).toEqual([]);
  });
  it("same-title collision resolves to two different recordings", () => {
    const a = recordingId("cyfi-fingers");
    const b = recordingId("cyfi-damier");
    expect(cat.recordings.get(a)?.title).toBe("Can You Feel It");
    expect(cat.recordings.get(b)?.title).toBe("Can You Feel It");
    expect(cat.recordings.get(a)?.primaryArtistId).not.toBe(cat.recordings.get(b)?.primaryArtistId);
  });
});
