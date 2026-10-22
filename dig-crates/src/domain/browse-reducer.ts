import { applyQuery, recordsById } from "./catalog";
import { countActiveFilters } from "./filters";
import { EMPTY_FILTERS, type CatalogSnapshot, type Crate, type RecordFilters, type RecordItem, type SortKey, type ViewMode } from "./types";

export type Panel = "none" | "details" | "pile" | "filters" | "related";

export interface TrailStep {
  seedRecordId: string;
  recordId: string;
  reason: string;
}

export interface BrowseState {
  storeSlug: string;
  crateId: string | null;
  viewMode: ViewMode;
  query: string;
  filters: RecordFilters;
  sort: SortKey;
  sortSeed: string;
  orderedRecordIds: string[];
  focusedRecordId: string | null;
  position: number;
  /** Last focused record per crate so re-opening a crate resumes where the visitor left off. */
  cratePositions: Record<string, string>;
  navigationTrail: TrailStep[];
  relatedSeedId: string | null;
  inspectRecordId: string | null;
  openedPanel: Panel;
  pile: string[];
  notice: { id: number; text: string } | null;
  endOfCrate: boolean;
  hydrated: boolean;
}

export interface PersistedSession {
  version: 1;
  crateId: string | null;
  viewMode: ViewMode;
  query: string;
  filters: RecordFilters;
  sort: SortKey;
  focusedRecordId: string | null;
  cratePositions: Record<string, string>;
  savedAt: string;
}

export type BrowseAction =
  | { type: "SELECT_CRATE"; crateId: string; viewMode?: ViewMode }
  | { type: "GO_HOME" }
  | { type: "SET_VIEW_MODE"; viewMode: ViewMode }
  | { type: "SEARCH"; query: string; viewMode?: ViewMode }
  | { type: "SET_FILTERS"; filters: RecordFilters }
  | { type: "CLEAR_FILTERS" }
  | { type: "SET_SORT"; sort: SortKey }
  | { type: "NEXT_RECORD" }
  | { type: "PREVIOUS_RECORD" }
  | { type: "FOCUS_RECORD"; recordId: string }
  | { type: "OPEN_RECORD_DETAILS"; recordId?: string }
  | { type: "OPEN_RELATED"; recordId?: string }
  | { type: "FOLLOW_RELATED"; recordId: string; reason: string }
  | { type: "BACK_IN_TRAIL" }
  | { type: "JUMP_TO_RECORD"; recordId: string }
  | { type: "OPEN_PILE" }
  | { type: "OPEN_FILTERS" }
  | { type: "CLOSE_PANEL" }
  | { type: "ADD_TO_PILE"; recordId: string }
  | { type: "REMOVE_FROM_PILE"; recordId: string }
  | { type: "TOGGLE_PILE"; recordId: string }
  | { type: "CLEAR_PILE" }
  | { type: "RESTART_CRATE" }
  | { type: "DISMISS_END" }
  | { type: "DISMISS_NOTICE" }
  | { type: "RESTORE_SESSION"; session: PersistedSession | null; pile: string[]; sortSeed?: string }
  | { type: "RESET_SESSION" };

export interface BrowseCatalog {
  snapshot: CatalogSnapshot;
  byId: Map<string, RecordItem>;
  crateById: Map<string, Crate>;
  allCrateId: string | null;
}

export function buildBrowseCatalog(snapshot: CatalogSnapshot): BrowseCatalog {
  const crateById = new Map<string, Crate>();
  for (const c of snapshot.crates) crateById.set(c.id, c);
  const all =
    snapshot.crates.find((c) => Object.keys(c.definition).length === 0) ??
    [...snapshot.crates].sort((a, b) => a.displayOrder - b.displayOrder)[0] ??
    null;
  return { snapshot, byId: recordsById(snapshot.records), crateById, allCrateId: all?.id ?? null };
}

export function initialBrowseState(storeSlug: string, sortSeed: string): BrowseState {
  return {
    storeSlug,
    crateId: null,
    viewMode: "crate",
    query: "",
    filters: EMPTY_FILTERS,
    sort: "recent",
    sortSeed,
    orderedRecordIds: [],
    focusedRecordId: null,
    position: -1,
    cratePositions: {},
    navigationTrail: [],
    relatedSeedId: null,
    inspectRecordId: null,
    openedPanel: "none",
    pile: [],
    notice: null,
    endOfCrate: false,
    hydrated: false,
  };
}

let noticeCounter = 0;
function notice(text: string) {
  noticeCounter += 1;
  return { id: noticeCounter, text };
}

/**
 * Recompute the ordered result set. The current record is kept when it still matches;
 * otherwise the first result is selected and the change is communicated via a notice.
 */
function recompute(
  state: BrowseState,
  catalog: BrowseCatalog,
  opts: { preferRecordId?: string | null; announce?: boolean } = {},
): BrowseState {
  if (state.crateId === null) {
    return { ...state, orderedRecordIds: [], focusedRecordId: null, position: -1 };
  }
  const crate = catalog.crateById.get(state.crateId) ?? null;
  const ordered = applyQuery(catalog.snapshot.records, {
    crate,
    query: state.query,
    filters: state.filters,
    sort: state.sort,
    sortSeed: state.sortSeed,
  }).map((r) => r.id);

  const wanted = opts.preferRecordId !== undefined ? opts.preferRecordId : state.focusedRecordId;
  let position = wanted ? ordered.indexOf(wanted) : -1;
  let next = state.notice;
  if (position === -1) {
    if (ordered.length && wanted && opts.announce !== false && state.focusedRecordId) {
      next = notice("Your previous record no longer matches, showing the first result instead.");
    }
    position = ordered.length ? 0 : -1;
  }
  const focusedRecordId = position >= 0 ? (ordered[position] ?? null) : null;
  const cratePositions =
    focusedRecordId && state.crateId ? { ...state.cratePositions, [state.crateId]: focusedRecordId } : state.cratePositions;
  return { ...state, orderedRecordIds: ordered, focusedRecordId, position, cratePositions, notice: next, endOfCrate: false };
}

function focusAt(state: BrowseState, index: number): BrowseState {
  const id = state.orderedRecordIds[index];
  if (!id) return state;
  const cratePositions = state.crateId ? { ...state.cratePositions, [state.crateId]: id } : state.cratePositions;
  return { ...state, position: index, focusedRecordId: id, cratePositions, endOfCrate: false };
}

function dedupePile(ids: string[], catalog: BrowseCatalog): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (typeof id !== "string" || seen.has(id) || !catalog.byId.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= 200) break;
  }
  return out;
}

export function createBrowseReducer(catalog: BrowseCatalog) {
  return function browseReducer(state: BrowseState, action: BrowseAction): BrowseState {
    switch (action.type) {
      case "SELECT_CRATE": {
        if (!catalog.crateById.has(action.crateId)) return { ...state, notice: notice("That crate is not available.") };
        const saved = state.cratePositions[action.crateId] ?? null;
        const next: BrowseState = {
          ...state,
          crateId: action.crateId,
          viewMode: action.viewMode ?? state.viewMode,
          openedPanel: "none",
          navigationTrail: [],
          relatedSeedId: null,
          inspectRecordId: null,
          endOfCrate: false,
        };
        return recompute(next, catalog, { preferRecordId: saved, announce: false });
      }
      case "GO_HOME":
        return {
          ...state,
          crateId: null,
          query: "",
          openedPanel: "none",
          orderedRecordIds: [],
          focusedRecordId: null,
          position: -1,
          navigationTrail: [],
          relatedSeedId: null,
          inspectRecordId: null,
          endOfCrate: false,
        };
      case "SET_VIEW_MODE":
        if (action.viewMode === state.viewMode) return state;
        return { ...state, viewMode: action.viewMode, endOfCrate: false };
      case "SEARCH": {
        const query = action.query.slice(0, 120);
        if (state.crateId === null) {
          const crateId = catalog.allCrateId;
          if (!crateId) return state;
          return recompute(
            { ...state, crateId, query, viewMode: action.viewMode ?? "wall", openedPanel: "none" },
            catalog,
            { announce: false },
          );
        }
        if (query === state.query) return state;
        return recompute({ ...state, query }, catalog);
      }
      case "SET_FILTERS":
        return recompute({ ...state, filters: action.filters }, catalog);
      case "CLEAR_FILTERS":
        if (countActiveFilters(state.filters) === 0 && !state.query) return state;
        return recompute({ ...state, filters: EMPTY_FILTERS, query: "" }, catalog, { announce: false });
      case "SET_SORT":
        if (action.sort === state.sort) return state;
        return recompute({ ...state, sort: action.sort }, catalog, { announce: false });
      case "NEXT_RECORD": {
        if (state.position < 0) return state;
        if (state.position >= state.orderedRecordIds.length - 1) return { ...state, endOfCrate: true };
        return focusAt(state, state.position + 1);
      }
      case "PREVIOUS_RECORD": {
        if (state.position <= 0) return { ...state, endOfCrate: false, notice: state.position === 0 ? notice("You are at the start of this crate.") : state.notice };
        return focusAt(state, state.position - 1);
      }
      case "FOCUS_RECORD": {
        const index = state.orderedRecordIds.indexOf(action.recordId);
        if (index === -1) return state;
        return focusAt(state, index);
      }
      case "OPEN_RECORD_DETAILS": {
        const id = action.recordId ?? state.focusedRecordId;
        if (!id || !catalog.byId.has(id)) return state;
        return { ...state, openedPanel: "details", inspectRecordId: id };
      }
      case "OPEN_RELATED": {
        const id = action.recordId ?? state.inspectRecordId ?? state.focusedRecordId;
        if (!id || !catalog.byId.has(id)) return state;
        return { ...state, openedPanel: "related", relatedSeedId: id, navigationTrail: [], inspectRecordId: id };
      }
      case "FOLLOW_RELATED": {
        if (!state.relatedSeedId || !catalog.byId.has(action.recordId)) return state;
        if (action.recordId === state.relatedSeedId) return state;
        const step: TrailStep = { seedRecordId: state.relatedSeedId, recordId: action.recordId, reason: action.reason };
        return {
          ...state,
          openedPanel: "related",
          relatedSeedId: action.recordId,
          inspectRecordId: action.recordId,
          navigationTrail: [...state.navigationTrail, step].slice(-20),
        };
      }
      case "BACK_IN_TRAIL": {
        const trail = state.navigationTrail;
        if (!trail.length) return state;
        const last = trail[trail.length - 1]!;
        return {
          ...state,
          relatedSeedId: last.seedRecordId,
          inspectRecordId: last.seedRecordId,
          navigationTrail: trail.slice(0, -1),
        };
      }
      case "JUMP_TO_RECORD": {
        if (!catalog.byId.has(action.recordId)) return state;
        const closed: BrowseState = { ...state, openedPanel: "none", navigationTrail: [], relatedSeedId: null, inspectRecordId: null };
        const index = state.orderedRecordIds.indexOf(action.recordId);
        if (index !== -1) return focusAt(closed, index);
        // Record is outside the current results: widen to the whole catalogue, keeping it reversible.
        const crateId = catalog.allCrateId ?? state.crateId;
        return recompute(
          {
            ...closed,
            crateId,
            query: "",
            filters: EMPTY_FILTERS,
            notice: notice("Switched to All Records with filters cleared to show this record."),
          },
          catalog,
          { preferRecordId: action.recordId, announce: false },
        );
      }
      case "OPEN_PILE":
        return { ...state, openedPanel: "pile" };
      case "OPEN_FILTERS":
        return { ...state, openedPanel: "filters" };
      case "CLOSE_PANEL":
        if (state.openedPanel === "none") return state;
        return { ...state, openedPanel: "none", inspectRecordId: null, relatedSeedId: null, navigationTrail: [] };
      case "ADD_TO_PILE":
        if (!catalog.byId.has(action.recordId) || state.pile.includes(action.recordId)) return state;
        return { ...state, pile: [...state.pile, action.recordId] };
      case "REMOVE_FROM_PILE":
        if (!state.pile.includes(action.recordId)) return state;
        return { ...state, pile: state.pile.filter((id) => id !== action.recordId) };
      case "TOGGLE_PILE":
        return state.pile.includes(action.recordId)
          ? browseReducer(state, { type: "REMOVE_FROM_PILE", recordId: action.recordId })
          : browseReducer(state, { type: "ADD_TO_PILE", recordId: action.recordId });
      case "CLEAR_PILE":
        return state.pile.length ? { ...state, pile: [] } : state;
      case "RESTART_CRATE":
        return focusAt({ ...state, endOfCrate: false }, 0);
      case "DISMISS_END":
        return state.endOfCrate ? { ...state, endOfCrate: false } : state;
      case "DISMISS_NOTICE":
        return state.notice ? { ...state, notice: null } : state;
      case "RESTORE_SESSION": {
        const pile = dedupePile(action.pile, catalog);
        const sortSeed = action.sortSeed ?? state.sortSeed;
        const s = action.session;
        if (!s) return { ...state, pile, sortSeed, hydrated: true };
        const crateId = s.crateId && catalog.crateById.has(s.crateId) ? s.crateId : null;
        const cratePositions: Record<string, string> = {};
        for (const [cid, rid] of Object.entries(s.cratePositions ?? {})) {
          if (catalog.crateById.has(cid) && catalog.byId.has(rid)) cratePositions[cid] = rid;
        }
        const restored: BrowseState = {
          ...state,
          pile,
          sortSeed,
          hydrated: true,
          crateId,
          viewMode: s.viewMode,
          query: s.query,
          filters: s.filters,
          sort: s.sort,
          cratePositions,
        };
        const prefer = s.focusedRecordId && catalog.byId.has(s.focusedRecordId) ? s.focusedRecordId : null;
        return recompute(restored, catalog, { preferRecordId: prefer, announce: false });
      }
      case "RESET_SESSION":
        return { ...initialBrowseState(state.storeSlug, state.sortSeed), pile: state.pile, hydrated: true };
    }
    return state;
  };
}

export function toPersistedSession(state: BrowseState): PersistedSession {
  return {
    version: 1,
    crateId: state.crateId,
    viewMode: state.viewMode,
    query: state.query,
    filters: state.filters,
    sort: state.sort,
    focusedRecordId: state.focusedRecordId,
    cratePositions: state.cratePositions,
    savedAt: new Date().toISOString(),
  };
}
