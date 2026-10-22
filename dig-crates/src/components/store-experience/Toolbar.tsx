"use client";

import { useEffect, useRef, useState } from "react";
import { countActiveFilters, filterChips, SORT_LABELS } from "@/domain/filters";
import { SORT_KEYS, type SortKey, type ViewMode } from "@/domain/types";
import { useBrowse } from "./BrowseContext";
import { IconFilter, IconGrid, IconHeadphones, IconRecord, IconSearch } from "./Icons";

const MODES: Array<{ mode: ViewMode; label: string; Icon: typeof IconRecord }> = [
  { mode: "crate", label: "Crate", Icon: IconRecord },
  { mode: "wall", label: "Wall", Icon: IconGrid },
  { mode: "listen", label: "Listen", Icon: IconHeadphones },
];

/** Crate breadcrumb, result count, view tabs, search, filters and sort. */
export function Toolbar() {
  const { state, dispatch, catalog, formatMinor } = useBrowse();
  const crate = state.crateId ? catalog.crateById.get(state.crateId) : null;
  const [draft, setDraft] = useState(state.query);
  const [lastQuery, setLastQuery] = useState(state.query);
  const [searchOpenState, setSearchOpen] = useState(false);
  const searchOpen = searchOpenState || Boolean(state.query);
  const timer = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep the draft in sync when the query changes elsewhere (clear filters, restore): derived during render.
  if (state.query !== lastQuery) {
    setLastQuery(state.query);
    setDraft(state.query);
  }

  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  const onDraft = (value: string) => {
    setDraft(value);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => dispatch({ type: "SEARCH", query: value.trim() }), 220);
  };

  const activeCount = countActiveFilters(state.filters);
  const chips = filterChips(state.filters, formatMinor);
  const total = state.orderedRecordIds.length;

  return (
    <div className="dig-toolbar" data-testid="dig-toolbar">
      <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, flex: "1 1 180px" }}>
        <span className="dig-display" style={{ fontWeight: 700, fontSize: "1.05rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} data-testid="dig-crate-name">
          {crate?.name ?? "Results"}
        </span>
        <span className="dig-muted" style={{ fontSize: "0.9rem", whiteSpace: "nowrap" }} data-testid="dig-result-count" aria-live="polite">
          {total} {total === 1 ? "record" : "records"}
        </span>
      </div>

      <div className="dig-tabs" role="tablist" aria-label="View mode" data-testid="dig-view-tabs">
        {MODES.map(({ mode, label, Icon }) => (
          <button
            key={mode}
            type="button"
            role="tab"
            aria-selected={state.viewMode === mode}
            onClick={() => dispatch({ type: "SET_VIEW_MODE", viewMode: mode })}
            data-testid={`dig-tab-${mode}`}
          >
            <Icon size={16} />
            <span>{label}</span>
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 6, alignItems: "center", flex: "1 1 240px", justifyContent: "flex-end", minWidth: 0 }}>
        {searchOpen ? (
          <div style={{ flex: "1 1 160px", minWidth: 120, maxWidth: 360 }}>
            <label className="sr-only" htmlFor="dig-toolbar-search">Search this crate</label>
            <input
              ref={inputRef}
              id="dig-toolbar-search"
              className="dig-input"
              type="search"
              placeholder="Artist, title, label…"
              value={draft}
              onChange={(e) => onDraft(e.target.value)}
              autoComplete="off"
              data-testid="dig-search"
            />
          </div>
        ) : (
          <button type="button" className="dig-btn dig-btn-icon dig-btn-ghost" aria-label="Search" onClick={() => { setSearchOpen(true); window.setTimeout(() => inputRef.current?.focus(), 0); }} data-testid="dig-search-toggle">
            <IconSearch />
          </button>
        )}
        <button type="button" className="dig-btn" style={{ position: "relative" }} onClick={() => dispatch({ type: "OPEN_FILTERS" })} aria-label={`Filters, ${activeCount} active`} data-testid="dig-filters-button">
          <IconFilter />
          <span className="hidden md:inline">Filters</span>
          {activeCount ? <span className="dig-badge-count" aria-hidden="true">{activeCount}</span> : null}
        </button>
        <label className="sr-only" htmlFor="dig-sort">Sort records</label>
        <select id="dig-sort" className="dig-select" style={{ width: "auto", maxWidth: 170 }} value={state.sort} onChange={(e) => dispatch({ type: "SET_SORT", sort: e.target.value as SortKey })} data-testid="dig-sort">
          {SORT_KEYS.map((k) => (
            <option key={k} value={k}>{SORT_LABELS[k]}</option>
          ))}
        </select>
      </div>

      {chips.length || state.query ? (
        <div style={{ flexBasis: "100%", display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }} data-testid="dig-filter-chips">
          {state.query ? (
            <span className="dig-chip">
              <span>“{state.query}”</span>
              <button type="button" aria-label={`Clear search ${state.query}`} onClick={() => { setDraft(""); dispatch({ type: "SEARCH", query: "" }); }}>×</button>
            </span>
          ) : null}
          {chips.map((chip) => (
            <span key={chip.key} className="dig-chip">
              <span>{chip.label}</span>
              <button type="button" aria-label={`Remove filter ${chip.label}`} onClick={() => dispatch({ type: "SET_FILTERS", filters: chip.remove(state.filters) })}>×</button>
            </span>
          ))}
          {activeCount >= 4 ? <span className="dig-muted" style={{ fontSize: "0.8rem" }}>Many filters are active, results may be very narrow.</span> : null}
          <button type="button" className="dig-btn dig-btn-ghost dig-btn-sm" onClick={() => { setDraft(""); dispatch({ type: "CLEAR_FILTERS" }); }} data-testid="dig-clear-filters">
            Clear all
          </button>
        </div>
      ) : null}
    </div>
  );
}
