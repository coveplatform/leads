"use client";

import { useMemo, useState } from "react";
import { catalogFacets } from "@/domain/catalog";
import { countActiveFilters, decadePresets } from "@/domain/filters";
import { parseMajorToMinor } from "@/domain/pricing";
import { CONDITIONS, FORMATS, type Condition, type Format, type RecordFilters } from "@/domain/types";
import { useBrowse } from "./BrowseContext";
import { ModalPanel } from "./ModalPanel";

function toggleIn<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/** Filters apply immediately; the footer shows the live result count. */
export function FilterPanel() {
  const { state, dispatch, catalog, formatMinor, store } = useBrowse();
  const open = state.openedPanel === "filters";
  const facets = useMemo(() => catalogFacets(catalog.snapshot.records), [catalog]);
  const decades = useMemo(() => decadePresets(facets.years), [facets.years]);
  const f = state.filters;
  const set = (patch: Partial<RecordFilters>) => dispatch({ type: "SET_FILTERS", filters: { ...f, ...patch } });
  const [priceMin, setPriceMin] = useState(f.priceMinMinor !== undefined ? String(f.priceMinMinor / 100) : "");
  const [priceMax, setPriceMax] = useState(f.priceMaxMinor !== undefined ? String(f.priceMaxMinor / 100) : "");
  const close = () => dispatch({ type: "CLOSE_PANEL" });
  const count = state.orderedRecordIds.length;

  return (
    <ModalPanel
      open={open}
      onClose={close}
      title="Filters"
      testId="dig-filters"
      description="Narrow the crate. Changes apply immediately."
      footer={
        <>
          <button type="button" className="dig-btn dig-btn-primary" onClick={close} data-testid="dig-filters-show">Show {count} {count === 1 ? "record" : "records"}</button>
          <button type="button" className="dig-btn dig-btn-ghost" onClick={() => { setPriceMin(""); setPriceMax(""); dispatch({ type: "CLEAR_FILTERS" }); }} disabled={countActiveFilters(f) === 0 && !state.query}>Clear all</button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend style={{ fontWeight: 700, marginBottom: 6 }}>Genre</legend>
          {facets.genres.map(({ value, count: n }) => (
            <label key={value} className="dig-checkbox">
              <input type="checkbox" checked={f.genre.includes(value)} onChange={() => set({ genre: toggleIn(f.genre, value) })} data-testid={`filter-genre-${value}`} />
              <span>{value}</span> <span className="dig-muted" style={{ fontSize: "0.85rem" }}>({n})</span>
            </label>
          ))}
        </fieldset>

        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend style={{ fontWeight: 700, marginBottom: 6 }}>Style</legend>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {facets.styles.map(({ value }) => (
              <button key={value} type="button" className="dig-btn dig-btn-sm" aria-pressed={f.style.includes(value)} onClick={() => set({ style: toggleIn(f.style, value) })} data-testid={`filter-style-${value}`}>{value}</button>
            ))}
          </div>
        </fieldset>

        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend style={{ fontWeight: 700, marginBottom: 6 }}>Year</legend>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
            {decades.map((d) => (
              <button key={d.label} type="button" className="dig-btn dig-btn-sm" aria-pressed={f.yearFrom === d.from && f.yearTo === d.to} onClick={() => set(f.yearFrom === d.from && f.yearTo === d.to ? { yearFrom: undefined, yearTo: undefined } : { yearFrom: d.from, yearTo: d.to })} data-testid={`filter-decade-${d.label}`}>{d.label}</button>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <label><span className="dig-muted" style={{ fontSize: "0.8rem" }}>From</span><input className="dig-input" type="number" inputMode="numeric" min={facets.minYear} max={facets.maxYear} value={f.yearFrom ?? ""} onChange={(e) => set({ yearFrom: e.target.value ? Number(e.target.value) : undefined })} aria-label="Year from" /></label>
            <label><span className="dig-muted" style={{ fontSize: "0.8rem" }}>To</span><input className="dig-input" type="number" inputMode="numeric" min={facets.minYear} max={facets.maxYear} value={f.yearTo ?? ""} onChange={(e) => set({ yearTo: e.target.value ? Number(e.target.value) : undefined })} aria-label="Year to" /></label>
          </div>
        </fieldset>

        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend style={{ fontWeight: 700, marginBottom: 6 }}>Price ({store.currency})</legend>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <label><span className="dig-muted" style={{ fontSize: "0.8rem" }}>Min</span><input className="dig-input" type="text" inputMode="decimal" value={priceMin} onChange={(e) => { setPriceMin(e.target.value); set({ priceMinMinor: parseMajorToMinor(e.target.value) }); }} aria-label="Minimum price" placeholder={formatMinor(facets.minPriceMinor)} /></label>
            <label><span className="dig-muted" style={{ fontSize: "0.8rem" }}>Max</span><input className="dig-input" type="text" inputMode="decimal" value={priceMax} onChange={(e) => { setPriceMax(e.target.value); set({ priceMaxMinor: parseMajorToMinor(e.target.value) }); }} aria-label="Maximum price" placeholder={formatMinor(facets.maxPriceMinor)} data-testid="filter-price-max" /></label>
          </div>
        </fieldset>

        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend style={{ fontWeight: 700, marginBottom: 6 }}>Format</legend>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {FORMATS.map((fm) => (
              <button key={fm} type="button" className="dig-btn dig-btn-sm" aria-pressed={f.formats.includes(fm)} onClick={() => set({ formats: toggleIn<Format>(f.formats, fm) })} data-testid={`filter-format-${fm}`}>{fm}</button>
            ))}
          </div>
        </fieldset>

        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend style={{ fontWeight: 700, marginBottom: 6 }}>Media condition</legend>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {CONDITIONS.map((c) => (
              <button key={c} type="button" className="dig-btn dig-btn-sm" aria-pressed={f.condition.includes(c)} onClick={() => set({ condition: toggleIn<Condition>(f.condition, c) })} data-testid={`filter-condition-${c}`}>{c}</button>
            ))}
          </div>
        </fieldset>

        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend style={{ fontWeight: 700, marginBottom: 6 }}>Availability</legend>
          <label className="dig-checkbox"><input type="checkbox" checked={f.previewOnly} onChange={(e) => set({ previewOnly: e.target.checked })} data-testid="filter-preview-only" /> <span>Only records with a demo preview</span></label>
          <label className="dig-checkbox"><input type="checkbox" checked={f.availableOnly} onChange={(e) => set({ availableOnly: e.target.checked })} data-testid="filter-available-only" /> <span>Hide sold-out records</span></label>
        </fieldset>
      </div>
    </ModalPanel>
  );
}
