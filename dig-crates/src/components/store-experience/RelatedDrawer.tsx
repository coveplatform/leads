"use client";

import { useEffect, useMemo, useState } from "react";
import { relatedRecords } from "@/domain/related";
import { track } from "@/lib/analytics-demo";
import { useBrowse } from "./BrowseContext";
import { Cover } from "./Cover";
import { IconBack, IconDig } from "./Icons";
import { ModalPanel } from "./ModalPanel";
import { PileButton } from "./RecordActions";

/** Dig Around This: explainable same-store neighbours, with a breadcrumb trail for branching. */
export function RelatedDrawer() {
  const { state, dispatch, catalog, recordById, formatMinor, store } = useBrowse();
  const open = state.openedPanel === "related";
  const seed = recordById(state.relatedSeedId);
  const [includeSold, setIncludeSold] = useState(false);

  useEffect(() => {
    if (open && seed) track("related_opened", { storeSlug: store.slug, sourceRecordId: seed.id });
  }, [open, seed, store.slug]);

  const results = useMemo(() => {
    if (!seed) return [];
    return relatedRecords(seed, catalog.snapshot.records, { availableOnly: !includeSold, limit: 12 });
  }, [seed, catalog, includeSold]);

  const close = () => dispatch({ type: "CLOSE_PANEL" });
  const trail = state.navigationTrail;
  const origin = trail.length ? recordById(trail[0]!.seedRecordId) : null;

  return (
    <ModalPanel open={open && !!seed} onClose={close} title={seed ? `Dig around ${seed.artist} – ${seed.title}` : "Dig around"} variant="wide" testId="dig-related" description="Related records from this shop only, with the reason for each match.">
      {seed ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {trail.length ? (
            <nav className="dig-trail" aria-label="Dig trail" data-testid="dig-trail">
              <button type="button" className="dig-btn dig-btn-sm dig-btn-ghost" onClick={() => dispatch({ type: "BACK_IN_TRAIL" })} data-testid="dig-trail-back"><IconBack size={16} /> Back</button>
              {origin ? <span>Started at <strong>{origin.title}</strong></span> : null}
              {trail.map((step, i) => {
                const r = recordById(step.recordId);
                return (
                  <span key={`${step.recordId}-${i}`}>
                    <span className="sep"> › </span>
                    <span>{r?.title ?? step.recordId}</span>
                  </span>
                );
              })}
            </nav>
          ) : null}

          <div className="dig-row" style={{ gridTemplateColumns: "72px minmax(0,1fr)" }} data-testid="dig-related-seed">
            <Cover record={seed} />
            <div className="dig-row-text">
              <span className="t">{seed.title}</span>
              <span className="a">{seed.artist} · {seed.label}, {seed.releaseYear} · {formatMinor(seed.priceMinor)}</span>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                <PileButton record={seed} compact />
                <button type="button" className="dig-btn dig-btn-sm" onClick={() => dispatch({ type: "OPEN_RECORD_DETAILS", recordId: seed.id })}>Details</button>
                <button type="button" className="dig-btn dig-btn-sm dig-btn-ghost" onClick={() => dispatch({ type: "JUMP_TO_RECORD", recordId: seed.id })} data-testid="dig-related-jump">Browse from here</button>
              </div>
            </div>
          </div>

          <label className="dig-checkbox" style={{ fontSize: "0.9rem" }}>
            <input type="checkbox" checked={includeSold} onChange={(e) => setIncludeSold(e.target.checked)} /> <span>Include sold-out records</span>
          </label>

          {results.length === 0 ? (
            <div className="dig-empty" data-testid="dig-related-empty">
              <h3 className="dig-display">No clear connections</h3>
              <p style={{ margin: 0 }}>Nothing else in stock shares this record&rsquo;s artist, label, genre, style or era. Try the whole catalogue instead.</p>
              <button type="button" className="dig-btn dig-btn-primary" onClick={() => { if (catalog.allCrateId) dispatch({ type: "SELECT_CRATE", crateId: catalog.allCrateId, viewMode: "wall" }); }}>Browse All Records</button>
            </div>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }} data-testid="dig-related-list">
              {results.map(({ record, reasons }) => (
                <li key={record.id} className="dig-row" style={{ gridTemplateColumns: "64px minmax(0,1fr)" }} data-testid={`related-row-${record.id}`}>
                  <button type="button" className="dig-tile" onClick={() => dispatch({ type: "OPEN_RECORD_DETAILS", recordId: record.id })} aria-label={`View details for ${record.artist} – ${record.title}`} style={{ width: 64 }}>
                    <Cover record={record} />
                  </button>
                  <div className="dig-row-text">
                    <span className="t">{record.title}</span>
                    <span className="a">{record.artist} · {record.label}, {record.releaseYear} · {formatMinor(record.priceMinor)}</span>
                    <div className="dig-reasons" aria-label="Why this record">
                      {reasons.map((reason) => <span key={reason} className="dig-badge">{reason}</span>)}
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                      <button type="button" className="dig-btn dig-btn-sm dig-btn-primary" onClick={() => { track("related_record_selected", { storeSlug: store.slug, sourceRecordId: seed.id, targetRecordId: record.id }); dispatch({ type: "FOLLOW_RELATED", recordId: record.id, reason: reasons[0] ?? "" }); }} data-testid={`related-follow-${record.id}`}>
                        <IconDig size={16} /> Dig around this
                      </button>
                      <button type="button" className="dig-btn dig-btn-sm" onClick={() => dispatch({ type: "OPEN_RECORD_DETAILS", recordId: record.id })}>Details</button>
                      <PileButton record={record} compact />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </ModalPanel>
  );
}
