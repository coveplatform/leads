"use client";

import { useSyncExternalStore } from "react";

const noop = () => () => {};

/**
 * Demo host pages are React apps, so the inline container is rendered only after hydration.
 * The launcher's MutationObserver then mounts the iframe into it. Static HTML hosts can simply
 * put `<div data-dig-inline="slug">` in their markup.
 */
export function InlineEmbedContainer({ slug }: { slug: string }) {
  const hydrated = useSyncExternalStore(noop, () => true, () => false);
  return (
    <div className="host-embed-box" data-testid="host-inline-container" {...(hydrated ? { "data-dig-inline": slug } : {})}>
      {hydrated ? null : <p className="host-note">Loading crates…</p>}
    </div>
  );
}
