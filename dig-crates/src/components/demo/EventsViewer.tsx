"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { clearEvents, EMPTY, getEvents, subscribeEvents, summariseEvents } from "@/lib/analytics-demo";

/** Debug view of the client-side demo event log (localStorage-backed, this browser only). */
export function EventsViewer() {
  const events = useSyncExternalStore(subscribeEvents, getEvents, () => EMPTY);
  const summary = summariseEvents(events);
  return (
    <main className="hub" data-testid="events-viewer">
      <h1>Demo events</h1>
      <p className="hub-note">Conceptual analytics for the prototype. Events are stored only in this browser&rsquo;s localStorage, contain no identity and are never sent anywhere. Open a <Link href="/">demo store</Link> in this browser, then refresh this page.</p>
      <p><button type="button" onClick={() => clearEvents()}>Clear log</button></p>
      <h2>Summary</h2>
      {summary.length ? (
        <table><thead><tr><th>Event</th><th>Count</th></tr></thead><tbody>{summary.map((s) => <tr key={s.name}><td><code>{s.name}</code></td><td>{s.count}</td></tr>)}</tbody></table>
      ) : <p>No events recorded yet.</p>}
      <h2>Latest events</h2>
      <table>
        <thead><tr><th>Time</th><th>Event</th><th>Payload</th></tr></thead>
        <tbody>
          {[...events].reverse().slice(0, 100).map((e) => (
            <tr key={e.id}><td>{new Date(e.at).toLocaleTimeString()}</td><td><code>{e.name}</code></td><td><code>{JSON.stringify(e.payload)}</code></td></tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
