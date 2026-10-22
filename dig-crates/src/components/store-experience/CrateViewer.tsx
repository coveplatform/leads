"use client";

import { useCallback, useEffect, useRef, type KeyboardEvent, type TouchEvent } from "react";
import { track } from "@/lib/analytics-demo";
import { useBrowse } from "./BrowseContext";
import { Cover } from "./Cover";
import { DemoAudioPlayer } from "./DemoAudioPlayer";
import { EmptyState } from "./EmptyState";
import { IconNext, IconPrev } from "./Icons";
import { DetailsButton, DigAroundButton, PileButton, RecordFlags } from "./RecordActions";
import { audioController, useAudioState } from "@/lib/audio-controller";
import { IconPause, IconPlay } from "./Icons";

const SWIPE_MIN_PX = 48;
const EDGE_IGNORE_PX = 24;

/** Crate Mode: one record at a time, fast. */
export function CrateViewer() {
  const { state, dispatch, recordById, formatMinor, store } = useBrowse();
  const record = recordById(state.focusedRecordId);
  const total = state.orderedRecordIds.length;
  const prev = recordById(state.orderedRecordIds[state.position - 1]);
  const next = recordById(state.orderedRecordIds[state.position + 1]);
  const stageRef = useRef<HTMLDivElement>(null);
  const touch = useRef<{ x: number; y: number; cancelled: boolean } | null>(null);
  const audio = useAudioState();

  // Preload neighbouring covers so navigation feels instant.
  useEffect(() => {
    for (const r of [prev, next]) {
      if (r?.artworkUrl && typeof Image !== "undefined") {
        const img = new Image();
        img.src = r.artworkUrl;
      }
    }
  }, [prev, next]);

  const goNext = useCallback(() => dispatch({ type: "NEXT_RECORD" }), [dispatch]);
  const goPrev = useCallback(() => dispatch({ type: "PREVIOUS_RECORD" }), [dispatch]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.tagName === "INPUT" || target.tagName === "SELECT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;
    if (e.key === "ArrowRight") { e.preventDefault(); goNext(); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); goPrev(); }
    else if (e.key === "Enter" && target === stageRef.current) { e.preventDefault(); dispatch({ type: "OPEN_RECORD_DETAILS" }); }
  };

  const onTouchStart = (e: TouchEvent) => {
    const t = e.touches[0];
    if (!t) return;
    const edge = t.clientX < EDGE_IGNORE_PX || t.clientX > window.innerWidth - EDGE_IGNORE_PX;
    touch.current = { x: t.clientX, y: t.clientY, cancelled: edge };
  };
  const onTouchMove = (e: TouchEvent) => {
    const t = e.touches[0];
    if (!t || !touch.current || touch.current.cancelled) return;
    const dx = t.clientX - touch.current.x;
    const dy = t.clientY - touch.current.y;
    // Vertical intent wins: cancel the swipe so page scrolling is unaffected.
    if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) touch.current.cancelled = true;
  };
  const onTouchEnd = (e: TouchEvent) => {
    const start = touch.current;
    touch.current = null;
    const t = e.changedTouches[0];
    if (!start || start.cancelled || !t) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) >= SWIPE_MIN_PX && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx < 0) goNext();
      else goPrev();
    }
  };

  if (!record) {
    return (
      <EmptyState
        title="No records match"
        body="Try removing a filter or clearing your search to see more of the crate."
        testId="dig-empty-crate"
        actions={
          <>
            <button type="button" className="dig-btn dig-btn-primary" onClick={() => dispatch({ type: "CLEAR_FILTERS" })}>Clear filters</button>
            <button type="button" className="dig-btn" onClick={() => dispatch({ type: "GO_HOME" })}>Browse another crate</button>
          </>
        }
      />
    );
  }

  const playing = audio.recordId === record.id && (audio.status === "playing" || audio.status === "loading");
  const listenToggle = () => {
    if (!record.preview) return;
    if (playing) audioController.pause();
    else {
      track("preview_started", { storeSlug: store.slug, recordId: record.id, isDemo: true });
      void audioController.play(record.id, record.preview.url);
    }
  };

  return (
    <div className="dig-scroll" data-testid="dig-crate-viewer">
      <div className="dig-crate-layout">
        <div className="dig-hero-stage" ref={stageRef} tabIndex={0} onKeyDown={onKeyDown} aria-label={`Record ${state.position + 1} of ${total}. Use left and right arrow keys to move between records, Enter for details.`} role="group">
          <div className="dig-peek">
            <button type="button" className="dig-btn dig-btn-icon" onClick={goPrev} aria-label="Previous record" disabled={state.position <= 0} data-testid="dig-prev">
              <IconPrev />
            </button>
            {prev ? <Cover record={prev} showSoldOverlay={false} /> : <div className="dig-cover" style={{ width: 56, visibility: "hidden" }} />}
          </div>
          <div className="dig-hero-cover" style={{ position: "relative" }} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={() => { touch.current = null; }}>
            <div key={record.id} className="dig-fade">
              <Cover record={record} priority className="dig-cover-hero" />
            </div>
            {state.endOfCrate ? (
              <div className="dig-end-card" data-testid="dig-end-of-crate">
                <div className="dig-card">
                  <strong className="dig-display" style={{ fontSize: "1.2rem" }}>End of crate</strong>
                  <p className="dig-muted" style={{ margin: 0 }}>You have flipped through all {total} records here.</p>
                  <button type="button" className="dig-btn dig-btn-primary" onClick={() => dispatch({ type: "RESTART_CRATE" })}>Restart crate</button>
                  <button type="button" className="dig-btn" onClick={() => dispatch({ type: "GO_HOME" })}>Browse another crate</button>
                  <button type="button" className="dig-btn dig-btn-ghost" onClick={() => dispatch({ type: "DISMISS_END" })}>Back</button>
                </div>
              </div>
            ) : null}
          </div>
          <div className="dig-peek">
            <button type="button" className="dig-btn dig-btn-icon" onClick={goNext} aria-label="Next record" disabled={total === 0} data-testid="dig-next">
              <IconNext />
            </button>
            {next ? <Cover record={next} showSoldOverlay={false} /> : <div className="dig-cover" style={{ width: 56, visibility: "hidden" }} />}
          </div>
        </div>

        <div className="dig-rail" data-testid="dig-rail">
          <div className="dig-muted" style={{ fontSize: "0.85rem", display: "flex", justifyContent: "space-between", gap: 8 }}>
            <span data-testid="dig-progress">{state.position + 1} / {total}</span>
            <span style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "flex-end" }}><RecordFlags record={record} inPile={state.pile.includes(record.id)} /></span>
          </div>
          <div>
            <h2 className="dig-display" style={{ margin: 0, fontSize: "clamp(1.3rem, 2.5vw, 1.9rem)", overflowWrap: "anywhere" }} data-testid="dig-record-title">{record.title}</h2>
            <p style={{ margin: "4px 0 0", fontSize: "1.1rem", overflowWrap: "anywhere" }} data-testid="dig-record-artist">{record.artist}</p>
          </div>
          <dl className="dig-meta">
            <dt>Label</dt><dd>{record.label} · {record.catalogueNumber}</dd>
            <dt>Format</dt><dd>{record.format} · {record.releaseYear}</dd>
            <dt>Genre</dt><dd>{[...record.genres, ...record.styles].join(", ")}</dd>
            <dt>Condition</dt><dd>Media {record.conditionMedia} · Sleeve {record.conditionSleeve}</dd>
          </dl>
          <div className="dig-price" data-testid="dig-record-price">
            {formatMinor(record.priceMinor)}
            {record.stockStatus === "sold" ? <span className="dig-muted" style={{ fontSize: "0.9rem", fontWeight: 400, marginLeft: 8 }}>Sold out</span> : null}
          </div>
          <DemoAudioPlayer record={record} onStart={(id) => track("preview_started", { storeSlug: store.slug, recordId: id, isDemo: true })} />
          <div className="dig-actions">
            <PileButton record={record} className="span-2" />
            <DigAroundButton record={record} />
            <DetailsButton record={record} />
          </div>
          <p className="dig-muted" style={{ fontSize: "0.78rem", margin: 0 }}>
            <span className="hidden md:inline">Keyboard: <kbd className="dig-kbd">←</kbd> <kbd className="dig-kbd">→</kbd> to flip, <kbd className="dig-kbd">Enter</kbd> for details.</span>
            <span className="md:hidden">Swipe the cover to flip through the crate.</span>
          </p>
        </div>
      </div>

      <div className="dig-mobile-bar" data-testid="dig-mobile-bar">
        <button type="button" className="dig-btn" onClick={goPrev} aria-label="Previous record" disabled={state.position <= 0}>
          <IconPrev /> <span>Prev</span>
        </button>
        <button type="button" className={`dig-btn ${record.preview ? "dig-btn-primary" : ""}`} onClick={listenToggle} disabled={!record.preview} aria-label={!record.preview ? "Preview unavailable" : playing ? "Pause demo audio" : "Play demo audio"} data-testid="dig-mobile-listen">
          {playing ? <IconPause /> : <IconPlay />} <span>{record.preview ? (playing ? "Pause" : "Listen") : "No preview"}</span>
        </button>
        <button type="button" className="dig-btn" onClick={goNext} aria-label="Next record" disabled={total === 0}>
          <span>Next</span> <IconNext />
        </button>
      </div>
      <p className="sr-only" aria-live="polite" data-testid="dig-crate-announcer">
        Record {state.position + 1} of {total}: {record.artist}, {record.title}, {formatMinor(record.priceMinor)}.
      </p>
    </div>
  );
}
