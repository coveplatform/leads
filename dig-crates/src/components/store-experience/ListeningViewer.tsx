"use client";

import { useEffect, useMemo, useRef } from "react";
import { audioController, useAudioState } from "@/lib/audio-controller";
import { track } from "@/lib/analytics-demo";
import { useBrowse } from "./BrowseContext";
import { Cover } from "./Cover";
import { DemoAudioPlayer } from "./DemoAudioPlayer";
import { EmptyState } from "./EmptyState";
import { IconNoAudio, IconPause, IconPlay, IconSkip } from "./Icons";
import { DetailsButton, DigAroundButton, PileButton } from "./RecordActions";
import { useVirtualRows } from "./useVirtualRows";

const ROW_HEIGHT = 78;

/** Listening Mode: audio-led browsing with a queue of records. Nothing plays until the user asks. */
export function ListeningViewer() {
  const { state, dispatch, recordById, formatMinor, store } = useBrowse();
  const audio = useAudioState();
  const scrollRef = useRef<HTMLDivElement>(null);
  const queueRef = useRef<HTMLDivElement>(null);
  const ids = state.orderedRecordIds;
  const record = recordById(state.focusedRecordId);
  const { range, totalHeight, scrollToRow } = useVirtualRows({ rowCount: ids.length, rowHeight: ROW_HEIGHT, scrollRef, innerRef: queueRef, overscan: 4 });

  const previewable = useMemo(() => ids.filter((id) => !!recordById(id)?.preview), [ids, recordById]);

  const focusedIndex = state.focusedRecordId ? ids.indexOf(state.focusedRecordId) : -1;
  const scrolledFor = useRef<string | null>(null);
  useEffect(() => {
    if (focusedIndex >= 0 && scrolledFor.current !== state.crateId) {
      scrolledFor.current = state.crateId;
      scrollToRow(focusedIndex);
    }
  }, [focusedIndex, scrollToRow, state.crateId]);

  const nextPreviewAfter = (id: string | null): string | null => {
    const from = id ? ids.indexOf(id) : -1;
    for (let i = from + 1; i < ids.length; i += 1) {
      const candidate = ids[i]!;
      if (recordById(candidate)?.preview) return candidate;
    }
    return null;
  };

  const playRecord = (id: string) => {
    const r = recordById(id);
    if (!r?.preview) return;
    dispatch({ type: "FOCUS_RECORD", recordId: id });
    track("preview_started", { storeSlug: store.slug, recordId: id, isDemo: true });
    void audioController.play(id, r.preview.url);
  };

  const skip = () => {
    const next = nextPreviewAfter(state.focusedRecordId);
    if (next) {
      playRecord(next);
      scrollToRow(ids.indexOf(next), "smooth");
    } else {
      audioController.stop();
    }
  };

  if (!record) {
    return (
      <EmptyState
        title="Nothing to listen to"
        body="No records match your filters. Clear them to fill the queue."
        testId="dig-empty-listen"
        actions={<button type="button" className="dig-btn dig-btn-primary" onClick={() => dispatch({ type: "CLEAR_FILTERS" })}>Clear filters</button>}
      />
    );
  }

  const nextId = nextPreviewAfter(state.focusedRecordId);

  return (
    <div className="dig-scroll" ref={scrollRef} data-testid="dig-listen">
      <div className="dig-listen">
        <section className="dig-listen-now" aria-label="Now selected">
          <Cover record={record} priority className="dig-cover-hero" />
          <div>
            <h2 className="dig-display" style={{ margin: 0, fontSize: "1.4rem", overflowWrap: "anywhere" }} data-testid="dig-listen-title">{record.title}</h2>
            <p style={{ margin: "2px 0 0" }}>{record.artist} · <span className="dig-muted">{record.label}, {record.releaseYear}</span></p>
            <p className="dig-price" style={{ margin: "4px 0 0", fontSize: "1.3rem" }}>{formatMinor(record.priceMinor)}</p>
          </div>
          <DemoAudioPlayer record={record} onStart={(id) => track("preview_started", { storeSlug: store.slug, recordId: id, isDemo: true })} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="dig-btn" onClick={skip} disabled={!nextId} data-testid="dig-skip-preview">
              <IconSkip size={18} /> <span>{audio.recordId === record.id && audio.status === "ended" ? "Play next preview" : "Skip preview"}</span>
            </button>
            <PileButton record={record} />
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <DetailsButton record={record} compact />
            <DigAroundButton record={record} compact />
          </div>
          <p className="dig-muted" style={{ fontSize: "0.8rem", margin: 0 }}>{previewable.length} of {ids.length} records have demo previews. Playback stops at the end of each loop.</p>
        </section>

        <section aria-label="Listening queue">
          <div ref={queueRef} style={{ position: "relative", height: totalHeight }} role="list" className="dig-queue">
            {ids.slice(range.start, range.end).map((id, i) => {
              const index = range.start + i;
              const r = recordById(id);
              if (!r) return null;
              const isCurrent = id === state.focusedRecordId;
              const isPlaying = audio.recordId === id && (audio.status === "playing" || audio.status === "loading");
              return (
                <div key={id} role="listitem" className="dig-row" aria-current={isCurrent ? "true" : undefined} style={{ position: "absolute", top: index * ROW_HEIGHT, left: 0, right: 0 }} data-testid={`listen-row-${id}`}>
                  <button type="button" className="dig-tile" onClick={() => dispatch({ type: "FOCUS_RECORD", recordId: id })} aria-label={`Select ${r.artist} – ${r.title}`} style={{ width: 56 }}>
                    <Cover record={r} />
                  </button>
                  <div className="dig-row-text">
                    <span className="t">{r.title}</span>
                    <span className="a">{r.artist} · {formatMinor(r.priceMinor)}{r.stockStatus === "sold" ? " · Sold out" : ""}</span>
                    {!r.preview ? <span className="dig-muted" style={{ fontSize: "0.75rem", display: "inline-flex", alignItems: "center", gap: 4 }}><IconNoAudio size={12} /> No preview</span> : null}
                  </div>
                  <div className="dig-row-actions">
                    {r.preview ? (
                      <button type="button" className={`dig-btn dig-btn-icon ${isPlaying ? "" : "dig-btn-primary"}`} onClick={() => (isPlaying ? audioController.pause() : playRecord(id))} aria-label={isPlaying ? `Pause ${r.title}` : `Listen to demo audio for ${r.title}`} data-testid={`listen-play-${id}`}>
                        {isPlaying ? <IconPause /> : <IconPlay />}
                      </button>
                    ) : (
                      <span className="dig-btn dig-btn-icon" aria-hidden="true" style={{ opacity: 0.4 }}><IconNoAudio /></span>
                    )}
                    <PileButton record={r} compact />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
