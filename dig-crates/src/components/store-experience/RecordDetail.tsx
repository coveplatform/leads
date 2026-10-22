"use client";

import { track } from "@/lib/analytics-demo";
import { useBrowse } from "./BrowseContext";
import { Cover } from "./Cover";
import { DemoAudioPlayer } from "./DemoAudioPlayer";
import { DemoBuyNotice } from "./DemoBuyNotice";
import { ModalPanel } from "./ModalPanel";
import { DigAroundButton, PileButton, RecordFlags } from "./RecordActions";

function formatDuration(sec?: number): string {
  if (!sec) return "";
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

/** Record details drawer. Opening and closing never changes the viewer position. */
export function RecordDetail() {
  const { state, dispatch, recordById, formatMinor, store } = useBrowse();
  const record = recordById(state.inspectRecordId);
  const open = state.openedPanel === "details" && !!record;
  const close = () => dispatch({ type: "CLOSE_PANEL" });

  return (
    <ModalPanel open={open} onClose={close} title={record ? `${record.artist} – ${record.title}` : "Record"} variant="wide" testId="dig-details" description="Record details. Press Escape to close and return to where you were.">
      {record ? (
        <div className="grid gap-4 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Cover record={record} priority className="dig-cover-hero" />
            <div style={{ display: "flex", gap: 8, alignItems: "center" }} aria-hidden="true">
              <div className="dig-cover" style={{ width: 64, opacity: 0.7 }}>
                <div className="dig-cover-fallback"><span style={{ fontSize: "0.55rem" }}>Reverse</span></div>
              </div>
              <span className="dig-muted" style={{ fontSize: "0.78rem" }}>Reverse sleeve placeholder (no fixture image)</span>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}><RecordFlags record={record} inPile={state.pile.includes(record.id)} /></div>
            <div>
              <h3 className="dig-display" style={{ margin: 0, fontSize: "1.5rem", overflowWrap: "anywhere" }}>{record.title}</h3>
              <p style={{ margin: "2px 0 0", fontSize: "1.05rem" }}>{record.artist}</p>
            </div>
            <div className="dig-price">{formatMinor(record.priceMinor)}</div>
            <dl className="dig-meta">
              <dt>Label</dt><dd>{record.label}</dd>
              <dt>Cat. no.</dt><dd>{record.catalogueNumber}</dd>
              <dt>Released</dt><dd>{record.releaseYear}</dd>
              <dt>Format</dt><dd>{record.format}</dd>
              <dt>Genre</dt><dd>{record.genres.join(", ")}</dd>
              <dt>Styles</dt><dd>{record.styles.join(", ") || "—"}</dd>
              {typeof record.bpm === "number" ? (<><dt>BPM</dt><dd>{record.bpm}</dd></>) : null}
              <dt>Media</dt><dd>{record.conditionMedia}</dd>
              <dt>Sleeve</dt><dd>{record.conditionSleeve}</dd>
            </dl>
            {record.tracklist.length ? (
              <div>
                <h4 style={{ margin: "0 0 6px", fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.06em" }} className="dig-muted">Tracklist</h4>
                <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 4 }}>
                  {record.tracklist.map((t) => (
                    <li key={t.position} style={{ display: "flex", gap: 10, fontSize: "0.92rem" }}>
                      <span className="dig-muted" style={{ minWidth: 28 }}>{t.position}</span>
                      <span style={{ flex: 1, overflowWrap: "anywhere" }}>{t.title}</span>
                      <span className="dig-muted">{formatDuration(t.durationSec)}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}
            {record.description ? <p className="dig-muted" style={{ margin: 0, fontSize: "0.92rem" }}>{record.description}</p> : null}
            <DemoAudioPlayer record={record} onStart={(id) => track("preview_started", { storeSlug: store.slug, recordId: id, isDemo: true })} />
            <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}>
              <PileButton record={record} />
              <DigAroundButton record={record} />
            </div>
            <DemoBuyNotice record={record} />
          </div>
        </div>
      ) : null}
    </ModalPanel>
  );
}
