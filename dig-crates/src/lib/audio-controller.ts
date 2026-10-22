import { useSyncExternalStore } from "react";

/**
 * Single global demo-audio controller. Only one preview can play at a time; any play request
 * stops whatever was playing. Nothing here ever autoplays: `play` is only called from user events.
 */

export type AudioStatus = "idle" | "loading" | "playing" | "paused" | "ended" | "blocked" | "error";

export interface AudioState {
  recordId: string | null;
  url: string | null;
  status: AudioStatus;
  currentTime: number;
  duration: number;
  muted: boolean;
  message: string | null;
}

const INITIAL: AudioState = { recordId: null, url: null, status: "idle", currentTime: 0, duration: 0, muted: false, message: null };

type Listener = () => void;

class AudioController {
  private element: HTMLAudioElement | null = null;
  private state: AudioState = INITIAL;
  private listeners = new Set<Listener>();
  private endedHandlers = new Set<(recordId: string) => void>();
  private startedHandlers = new Set<(recordId: string) => void>();

  getState = (): AudioState => this.state;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  onEnded(handler: (recordId: string) => void): () => void {
    this.endedHandlers.add(handler);
    return () => this.endedHandlers.delete(handler);
  }

  onStarted(handler: (recordId: string) => void): () => void {
    this.startedHandlers.add(handler);
    return () => this.startedHandlers.delete(handler);
  }

  private set(patch: Partial<AudioState>): void {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l();
  }

  private ensureElement(): HTMLAudioElement | null {
    if (typeof window === "undefined" || typeof Audio === "undefined") return null;
    if (this.element) return this.element;
    const el = new Audio();
    el.preload = "none";
    el.addEventListener("timeupdate", () => this.set({ currentTime: el.currentTime, duration: Number.isFinite(el.duration) ? el.duration : this.state.duration }));
    el.addEventListener("durationchange", () => this.set({ duration: Number.isFinite(el.duration) ? el.duration : 0 }));
    el.addEventListener("playing", () => this.set({ status: "playing", message: null }));
    el.addEventListener("pause", () => {
      if (this.state.status === "playing") this.set({ status: "paused" });
    });
    el.addEventListener("ended", () => {
      const id = this.state.recordId;
      this.set({ status: "ended", currentTime: this.state.duration });
      if (id) for (const h of this.endedHandlers) h(id);
    });
    el.addEventListener("error", () => this.set({ status: "error", message: "Demo audio could not be loaded." }));
    el.addEventListener("stalled", () => {
      if (this.state.status === "loading") this.set({ message: "Still loading demo audio…" });
    });
    this.element = el;
    return el;
  }

  /** Start (or resume) a preview. Must be called from a user gesture. */
  async play(recordId: string, url: string): Promise<void> {
    const el = this.ensureElement();
    if (!el) {
      this.set({ recordId, url, status: "error", message: "Audio is not supported here." });
      return;
    }
    const sameTrack = this.state.recordId === recordId && this.state.url === url && el.src.endsWith(url);
    if (!sameTrack) {
      el.pause();
      el.src = url;
      el.currentTime = 0;
      this.set({ recordId, url, status: "loading", currentTime: 0, duration: 0, message: null });
    } else {
      this.set({ status: "loading", message: null });
    }
    try {
      await el.play();
      this.set({ status: "playing", message: null });
      for (const h of this.startedHandlers) h(recordId);
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      if (name === "NotAllowedError") {
        this.set({ status: "blocked", message: "Your browser blocked playback. Press play again to listen." });
      } else if (name === "AbortError") {
        /* a newer play() superseded this one */
      } else {
        this.set({ status: "error", message: "Demo audio could not be played." });
      }
    }
  }

  pause(): void {
    if (!this.element) return;
    this.element.pause();
    if (this.state.status === "playing" || this.state.status === "loading") this.set({ status: "paused" });
  }

  /** Stop and release the current source. Safe to call repeatedly. */
  stop(): void {
    if (this.element) {
      this.element.pause();
      try {
        this.element.removeAttribute("src");
        this.element.load();
      } catch {
        /* ignore */
      }
    }
    if (this.state.status !== "idle" || this.state.recordId) this.set({ ...INITIAL, muted: this.state.muted });
  }

  seek(seconds: number): void {
    if (!this.element || !Number.isFinite(seconds)) return;
    this.element.currentTime = Math.max(0, Math.min(seconds, this.state.duration || seconds));
    this.set({ currentTime: this.element.currentTime });
  }

  setMuted(muted: boolean): void {
    if (this.element) this.element.muted = muted;
    this.set({ muted });
  }

  /** Stop if the given record is the one playing (used when navigating away from it). */
  stopIfNot(recordId: string | null): void {
    if (this.state.recordId && this.state.recordId !== recordId) this.stop();
  }

  destroy(): void {
    this.stop();
    this.element = null;
  }
}

export const audioController = new AudioController();

const serverSnapshot = INITIAL;

export function useAudioState(): AudioState {
  return useSyncExternalStore(audioController.subscribe, audioController.getState, () => serverSnapshot);
}

export function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
