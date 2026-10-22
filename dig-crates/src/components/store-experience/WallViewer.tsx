"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useBrowse } from "./BrowseContext";
import { Cover } from "./Cover";
import { EmptyState } from "./EmptyState";
import { IconCheck } from "./Icons";
import { useVirtualRows } from "./useVirtualRows";

const GAP = 12;
const PADDING = 12;
const CAPTION = 44;
const MIN_TILE = 168;

/** Wall Mode: a virtualised grid of square covers. Only visible rows are in the DOM. */
export function WallViewer() {
  const { state, dispatch, recordById, formatMinor } = useBrowse();
  const scrollRef = useRef<HTMLDivElement>(null);
  const ids = state.orderedRecordIds;
  const [pendingFocus, setPendingFocus] = useState<string | null>(null);

  const [measuredWidth, setMeasuredWidth] = useState(0);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => setMeasuredWidth(el.clientWidth);
    update();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, []);

  const innerWidth = Math.max(0, (measuredWidth || 360) - PADDING * 2);
  const columns = Math.min(8, Math.max(2, Math.floor((innerWidth + GAP) / (MIN_TILE + GAP))));
  const tile = Math.floor((innerWidth - GAP * (columns - 1)) / columns);
  const rowHeight = tile + CAPTION + GAP;
  const rowCount = Math.ceil(ids.length / columns);

  const { range, totalHeight, scrollToRow } = useVirtualRows({ rowCount, rowHeight, scrollRef, overscan: 2 });

  // Bring the focused record into view when (re)entering the wall.
  const focusedIndex = state.focusedRecordId ? ids.indexOf(state.focusedRecordId) : -1;
  const mountedFor = useRef<string | null>(null);
  useEffect(() => {
    if (focusedIndex >= 0 && mountedFor.current !== state.crateId) {
      mountedFor.current = state.crateId;
      scrollToRow(Math.floor(focusedIndex / columns));
    }
  }, [focusedIndex, columns, scrollToRow, state.crateId]);

  useEffect(() => {
    if (!pendingFocus) return;
    const el = scrollRef.current?.querySelector<HTMLElement>(`[data-tile="${pendingFocus}"]`);
    if (el) {
      el.focus();
      setPendingFocus(null);
    }
  }, [pendingFocus, range]);

  const moveFocus = (fromIndex: number, delta: number) => {
    const target = fromIndex + delta;
    if (target < 0 || target >= ids.length) return;
    const id = ids[target]!;
    dispatch({ type: "FOCUS_RECORD", recordId: id });
    scrollToRow(Math.floor(target / columns));
    setPendingFocus(id);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const tileEl = (e.target as HTMLElement).closest<HTMLElement>("[data-tile]");
    if (!tileEl) return;
    const index = ids.indexOf(tileEl.dataset.tile ?? "");
    if (index < 0) return;
    const map: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: columns, ArrowUp: -columns };
    const delta = map[e.key];
    if (delta !== undefined) {
      e.preventDefault();
      moveFocus(index, delta);
    }
  };

  const rows = useMemo(() => {
    const out: Array<{ row: number; ids: string[] }> = [];
    for (let row = range.start; row < range.end; row += 1) {
      out.push({ row, ids: ids.slice(row * columns, row * columns + columns) });
    }
    return out;
  }, [range.start, range.end, ids, columns]);

  if (!ids.length) {
    return (
      <EmptyState
        title="No records match"
        body="Try removing a filter or clearing your search."
        testId="dig-empty-wall"
        actions={
          <>
            <button type="button" className="dig-btn dig-btn-primary" onClick={() => dispatch({ type: "CLEAR_FILTERS" })}>Clear filters</button>
            <button type="button" className="dig-btn" onClick={() => dispatch({ type: "GO_HOME" })}>Browse another crate</button>
          </>
        }
      />
    );
  }

  return (
    <div className="dig-scroll" ref={scrollRef} data-testid="dig-wall" onKeyDown={onKeyDown}>
      <div className="dig-wall" style={{ height: totalHeight + PADDING * 2 }} role="list" aria-label={`${ids.length} records`}>
        {rows.map(({ row, ids: rowIds }) => (
          <div key={row} className="dig-wall-row" style={{ top: PADDING + row * rowHeight, gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }} role="presentation">
            {rowIds.map((id) => {
              const record = recordById(id);
              if (!record) return null;
              const current = id === state.focusedRecordId;
              const inPile = state.pile.includes(id);
              return (
                <div key={id} role="listitem">
                  <button
                    type="button"
                    className="dig-tile"
                    data-tile={id}
                    data-index={ids.indexOf(id)}
                    data-testid={`wall-tile-${id}`}
                    aria-current={current ? "true" : undefined}
                    tabIndex={current || (focusedIndex < 0 && id === ids[0]) ? 0 : -1}
                    onClick={() => {
                      dispatch({ type: "FOCUS_RECORD", recordId: id });
                      dispatch({ type: "OPEN_RECORD_DETAILS", recordId: id });
                    }}
                    aria-label={`${record.artist} – ${record.title}, ${formatMinor(record.priceMinor)}${record.stockStatus === "sold" ? ", sold out" : ""}${inPile ? ", in pile" : ""}`}
                    style={{ width: "100%" }}
                  >
                    <div style={{ position: "relative" }}>
                      <Cover record={record} />
                      <div className="dig-tile-flags" aria-hidden="true">
                        <span>{record.stockStatus === "sold" ? <span className="dig-badge">Sold</span> : record.newArrival ? <span className="dig-badge dig-badge-accent">New</span> : null}</span>
                        <span>{inPile ? <span className="dig-badge"><IconCheck size={12} /></span> : null}</span>
                      </div>
                    </div>
                    <div className="dig-tile-caption" aria-hidden="true">
                      <div className="t">{record.title}</div>
                      <div className="a">{record.artist} · {formatMinor(record.priceMinor)}</div>
                    </div>
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
