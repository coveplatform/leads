/**
 * Lightweight demo analytics. Events are kept in memory and mirrored to localStorage so the
 * /demo/events page can show the pipeline working. No network, no identity, no PII.
 */

export type DemoEventName =
  | "crate_opened"
  | "view_mode_changed"
  | "record_viewed"
  | "preview_started"
  | "preview_completed"
  | "record_saved"
  | "record_unsaved"
  | "related_opened"
  | "related_record_selected"
  | "filters_applied"
  | "search_performed"
  | "demo_buy_clicked"
  | "experience_closed";

export interface DemoEvent {
  id: number;
  name: DemoEventName;
  at: string;
  payload: Record<string, string | number | boolean | string[]>;
}

const STORAGE_KEY = "digcrates:events:v1";
const MAX_EVENTS = 200;

type Listener = (events: DemoEvent[]) => void;

let events: DemoEvent[] | null = null;
let counter = 0;
const listeners = new Set<Listener>();

function storage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

function loadEvents(): DemoEvent[] {
  if (events) return events;
  events = [];
  const raw = storage()?.getItem(STORAGE_KEY);
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        events = parsed
          .filter((e): e is DemoEvent => !!e && typeof e === "object" && typeof (e as DemoEvent).name === "string" && typeof (e as DemoEvent).at === "string")
          .slice(-MAX_EVENTS);
        counter = events.reduce((m, e) => Math.max(m, typeof e.id === "number" ? e.id : 0), 0);
      }
    } catch {
      events = [];
    }
  }
  return events;
}

function persist(): void {
  try {
    storage()?.setItem(STORAGE_KEY, JSON.stringify(events ?? []));
  } catch {
    /* storage may be unavailable (private mode, quota); the in-memory log still works */
  }
}

function emit(): void {
  const snapshot = events ?? EMPTY;
  for (const l of listeners) l(snapshot);
}

export function track(name: DemoEventName, payload: DemoEvent["payload"] = {}): DemoEvent {
  const list = loadEvents();
  counter += 1;
  const event: DemoEvent = { id: counter, name, at: new Date().toISOString(), payload };
  // Replace rather than mutate so snapshots are stable for useSyncExternalStore consumers.
  events = [...list, event].slice(-MAX_EVENTS);
  persist();
  emit();
  if (process.env.NODE_ENV === "development") {
    console.debug("[dig-crates event]", name, payload);
  }
  return event;
}

export const EMPTY: DemoEvent[] = [];

/** Current snapshot. The array is replaced on every change and must be treated as read-only. */
export function getEvents(): DemoEvent[] {
  return loadEvents();
}

export function clearEvents(): void {
  events = [];
  persist();
  emit();
}

export function subscribeEvents(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Aggregate counts for the events viewer. */
export function summariseEvents(list: DemoEvent[]): Array<{ name: string; count: number }> {
  const counts = new Map<string, number>();
  for (const e of list) counts.set(e.name, (counts.get(e.name) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
}
