"use client";

import { audioController, formatClock, useAudioState } from "@/lib/audio-controller";
import type { RecordItem } from "@/domain/types";
import { IconMute, IconNoAudio, IconPause, IconPlay, IconStop, IconVolume } from "./Icons";

interface DemoAudioPlayerProps {
  record: RecordItem;
  compact?: boolean;
  /** Called when the user starts playback (analytics). */
  onStart?: (recordId: string) => void;
}

/**
 * Custom UI over the single global HTMLAudioElement. Playback only ever starts from a click.
 * Demo loops are synthetic test audio and are labelled as such; they are not the record.
 */
export function DemoAudioPlayer({ record, compact = false, onStart }: DemoAudioPlayerProps) {
  const audio = useAudioState();
  const preview = record.preview;
  if (!preview) {
    return (
      <div className="dig-player-unavailable" data-testid="preview-unavailable">
        <IconNoAudio size={18} />
        <span>Preview unavailable for this record.</span>
      </div>
    );
  }
  const active = audio.recordId === record.id;
  const playing = active && (audio.status === "playing" || audio.status === "loading");
  const duration = active && audio.duration > 0 ? audio.duration : preview.durationSec;
  const current = active ? audio.currentTime : 0;

  const toggle = () => {
    if (playing) {
      audioController.pause();
    } else {
      onStart?.(record.id);
      void audioController.play(record.id, preview.url);
    }
  };

  return (
    <div className={`dig-player ${compact ? "" : "dig-card"}`} data-testid="demo-audio-player" data-active={active ? "true" : "false"}>
      <div className="dig-player-label">
        <span className="dig-badge dig-badge-accent">Demo audio</span>
        <span>Synthetic test loop, not this record</span>
      </div>
      <div className="dig-player-controls">
        <button
          type="button"
          className={`dig-btn dig-btn-icon ${playing ? "" : "dig-btn-primary"}`}
          onClick={toggle}
          aria-label={playing ? "Pause demo audio" : active && audio.status === "paused" ? "Resume demo audio" : "Play demo audio"}
          aria-pressed={playing}
          data-testid="play-toggle"
        >
          {playing ? <IconPause /> : <IconPlay />}
        </button>
        <button type="button" className="dig-btn dig-btn-icon dig-btn-ghost" onClick={() => audioController.stop()} aria-label="Stop demo audio" disabled={!active}>
          <IconStop />
        </button>
        <span className="dig-player-time" aria-live="off" data-testid="player-time">
          {formatClock(current)} / {formatClock(duration)}
        </span>
        <input
          type="range"
          className="dig-range"
          min={0}
          max={Math.max(1, Math.floor(duration))}
          step={0.5}
          value={Math.min(current, duration)}
          onChange={(e) => active && audioController.seek(Number(e.target.value))}
          aria-label="Seek within demo audio"
          disabled={!active}
          style={{ flex: "1 1 120px" }}
        />
        <button
          type="button"
          className="dig-btn dig-btn-icon dig-btn-ghost"
          onClick={() => audioController.setMuted(!audio.muted)}
          aria-label={audio.muted ? "Unmute" : "Mute"}
          aria-pressed={audio.muted}
        >
          {audio.muted ? <IconMute /> : <IconVolume />}
        </button>
      </div>
      {active && audio.status === "ended" ? <p className="dig-muted" style={{ margin: 0, fontSize: "0.85rem" }} data-testid="player-ended">Demo loop finished. Press play to hear it again.</p> : null}
      {active && audio.message ? (
        <p role="alert" className="dig-muted" style={{ margin: 0, fontSize: "0.85rem" }} data-testid="player-message">
          {audio.message}
        </p>
      ) : null}
    </div>
  );
}
