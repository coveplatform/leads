import { describe, expect, it } from "vitest";
import { buildBrowseCatalog, createBrowseReducer, initialBrowseState, toPersistedSession, type BrowseAction, type BrowseState } from "@/domain/browse-reducer";
import { EMPTY_FILTERS } from "@/domain/types";
import { makeSnapshot, sampleRecords } from "./helpers";

function setup() {
  const catalog = buildBrowseCatalog(makeSnapshot(sampleRecords()));
  const reducer = createBrowseReducer(catalog);
  let state = initialBrowseState("test-store", "seed");
  const run = (...actions: BrowseAction[]): BrowseState => {
    for (const a of actions) state = reducer(state, a);
    return state;
  };
  return { catalog, reducer, run, get: () => state };
}

describe("browse reducer", () => {
  it("selects a crate and focuses the first record in recent order", () => {
    const { run } = setup();
    const s = run({ type: "SELECT_CRATE", crateId: "c-house" });
    expect(s.orderedRecordIds).toEqual(["r6", "r2", "r1"]);
    expect(s.focusedRecordId).toBe("r6");
    expect(s.position).toBe(0);
  });
  it("ignores unknown crates with a notice", () => {
    const { run } = setup();
    const s = run({ type: "SELECT_CRATE", crateId: "nope" });
    expect(s.crateId).toBeNull();
    expect(s.notice?.text).toMatch(/not available/);
  });
  it("navigates next/previous, flags end of crate explicitly and never wraps silently", () => {
    const { run } = setup();
    run({ type: "SELECT_CRATE", crateId: "c-house" }, { type: "NEXT_RECORD" }, { type: "NEXT_RECORD" });
    expect(run().focusedRecordId).toBe("r1");
    const end = run({ type: "NEXT_RECORD" });
    expect(end.endOfCrate).toBe(true);
    expect(end.focusedRecordId).toBe("r1");
    const restarted = run({ type: "RESTART_CRATE" });
    expect(restarted.position).toBe(0);
    expect(restarted.endOfCrate).toBe(false);
    expect(run({ type: "PREVIOUS_RECORD" }).notice?.text).toMatch(/start/);
  });
  it("keeps filters and the current record when switching view modes", () => {
    const { run } = setup();
    run({ type: "SELECT_CRATE", crateId: "c-all" }, { type: "SET_FILTERS", filters: { ...EMPTY_FILTERS, genre: ["House"] } }, { type: "NEXT_RECORD" });
    const before = run();
    const after = run({ type: "SET_VIEW_MODE", viewMode: "wall" }, { type: "SET_VIEW_MODE", viewMode: "crate" });
    expect(after.focusedRecordId).toBe(before.focusedRecordId);
    expect(after.filters).toEqual(before.filters);
  });
  it("keeps the current record when a filter still matches it, otherwise selects the first match and says so", () => {
    const { run } = setup();
    run({ type: "SELECT_CRATE", crateId: "c-all" }, { type: "FOCUS_RECORD", recordId: "r2" });
    const kept = run({ type: "SET_FILTERS", filters: { ...EMPTY_FILTERS, genre: ["House"] } });
    expect(kept.focusedRecordId).toBe("r2");
    expect(kept.notice).toBeNull();
    const moved = run({ type: "SET_FILTERS", filters: { ...EMPTY_FILTERS, genre: ["Techno"] } });
    expect(moved.focusedRecordId).toBe("r4");
    expect(moved.notice?.text).toMatch(/no longer matches/);
  });
  it("searching from the landing screen opens the whole catalogue in wall mode", () => {
    const { run } = setup();
    const s = run({ type: "SEARCH", query: "night" });
    expect(s.crateId).toBe("c-all");
    expect(s.viewMode).toBe("wall");
    expect(s.orderedRecordIds.sort()).toEqual(["r1", "r4", "r6"]);
  });
  it("opening and closing details does not change the viewer position", () => {
    const { run } = setup();
    run({ type: "SELECT_CRATE", crateId: "c-all" }, { type: "NEXT_RECORD" });
    const pos = run().position;
    const open = run({ type: "OPEN_RECORD_DETAILS", recordId: "r1" });
    expect(open.openedPanel).toBe("details");
    expect(open.inspectRecordId).toBe("r1");
    expect(open.position).toBe(pos);
    const closed = run({ type: "CLOSE_PANEL" });
    expect(closed.openedPanel).toBe("none");
    expect(closed.position).toBe(pos);
  });
  it("related exploration keeps a trail and can go back", () => {
    const { run } = setup();
    run({ type: "SELECT_CRATE", crateId: "c-house" }, { type: "OPEN_RELATED" });
    expect(run().relatedSeedId).toBe("r6");
    run({ type: "FOLLOW_RELATED", recordId: "r1", reason: "Same label" }, { type: "FOLLOW_RELATED", recordId: "r2", reason: "Same artist" });
    expect(run().relatedSeedId).toBe("r2");
    expect(run().navigationTrail.map((t) => t.recordId)).toEqual(["r1", "r2"]);
    run({ type: "BACK_IN_TRAIL" });
    expect(run().relatedSeedId).toBe("r1");
    expect(run().navigationTrail.length).toBe(1);
    expect(run({ type: "FOLLOW_RELATED", recordId: "r1", reason: "self" }).navigationTrail.length).toBe(1);
  });
  it("jumping to a record outside the current results widens to All Records with a notice", () => {
    const { run } = setup();
    run({ type: "SELECT_CRATE", crateId: "c-house" }, { type: "OPEN_RELATED" });
    const s = run({ type: "JUMP_TO_RECORD", recordId: "r3" });
    expect(s.crateId).toBe("c-all");
    expect(s.focusedRecordId).toBe("r3");
    expect(s.openedPanel).toBe("none");
    expect(s.notice?.text).toMatch(/All Records/);
  });
  it("pile add/remove/toggle dedupes and ignores unknown ids", () => {
    const { run } = setup();
    run({ type: "ADD_TO_PILE", recordId: "r1" }, { type: "ADD_TO_PILE", recordId: "r1" }, { type: "ADD_TO_PILE", recordId: "ghost" }, { type: "TOGGLE_PILE", recordId: "r2" });
    expect(run().pile).toEqual(["r1", "r2"]);
    run({ type: "TOGGLE_PILE", recordId: "r1" }, { type: "REMOVE_FROM_PILE", recordId: "nope" });
    expect(run().pile).toEqual(["r2"]);
    expect(run({ type: "CLEAR_PILE" }).pile).toEqual([]);
  });
  it("restores a valid session and discards invalid ids", () => {
    const { run } = setup();
    const s = run({
      type: "RESTORE_SESSION",
      pile: ["r2", "ghost", "r2", "r5"],
      sortSeed: "abc",
      session: { version: 1, crateId: "c-house", viewMode: "listen", query: "", filters: EMPTY_FILTERS, sort: "price-asc", focusedRecordId: "r1", cratePositions: { "c-house": "r1", bogus: "r1", "c-all": "ghost" }, savedAt: "2026-01-01T00:00:00Z" },
    });
    expect(s.hydrated).toBe(true);
    expect(s.pile).toEqual(["r2", "r5"]);
    expect(s.sortSeed).toBe("abc");
    expect(s.crateId).toBe("c-house");
    expect(s.viewMode).toBe("listen");
    expect(s.focusedRecordId).toBe("r1");
    expect(s.cratePositions).toEqual({ "c-house": "r1" });
    expect(s.orderedRecordIds).toEqual(["r2", "r1", "r6"]);
  });
  it("restores gracefully when the saved crate no longer exists", () => {
    const { run } = setup();
    const s = run({ type: "RESTORE_SESSION", pile: [], session: { version: 1, crateId: "deleted", viewMode: "crate", query: "", filters: EMPTY_FILTERS, sort: "recent", focusedRecordId: "gone", cratePositions: {}, savedAt: "" } });
    expect(s.crateId).toBeNull();
    expect(s.focusedRecordId).toBeNull();
    expect(s.hydrated).toBe(true);
  });
  it("re-opening a crate resumes the remembered position", () => {
    const { run } = setup();
    run({ type: "SELECT_CRATE", crateId: "c-house" }, { type: "NEXT_RECORD" }, { type: "GO_HOME" });
    expect(run().crateId).toBeNull();
    expect(run({ type: "SELECT_CRATE", crateId: "c-house" }).focusedRecordId).toBe("r2");
  });
  it("serialises only sensible parts of the state", () => {
    const { run } = setup();
    run({ type: "SELECT_CRATE", crateId: "c-house" }, { type: "OPEN_PILE" });
    const p = toPersistedSession(run());
    expect(p.version).toBe(1);
    expect(p.crateId).toBe("c-house");
    expect("openedPanel" in p).toBe(false);
    expect("pile" in p).toBe(false);
  });
});
