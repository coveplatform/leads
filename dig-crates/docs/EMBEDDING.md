# Embedding DIG Crates on a shop website

Two integrations are provided. Both use the same iframe document (`/embed/:slug`) and the same launcher script (`/embed/dig.js`, served from `public/embed/dig.js`).

## A. Full-screen overlay (recommended first)

```html
<button type="button" data-dig-open="basement-wax">Dig Our Crates</button>
<script async src="https://YOUR-DIG-HOST/embed/dig.js"></script>
```

On click the launcher:

1. Creates a full-viewport overlay (`z-index: 2147483647`) with a loader and an accessible outer **Close** button.
2. Inserts an iframe pointing at `https://YOUR-DIG-HOST/embed/basement-wax?mode=overlay&parentOrigin=<host origin>`.
3. Locks background scroll, remembers the scroll position and the focused element, and contains Tab focus between the outer Close button and the iframe.
4. Waits for the app's `READY` message, then hides the loader, shrinks the outer Close button to a compact fallback, and sends `FOCUS` so keyboard focus lands inside the app.
5. Closes on the app's `REQUEST_CLOSE` message, on the outer Close button, or on Escape pressed on the host page. The app itself also closes on Escape when no panel is open.
6. On close it removes the iframe (so demo audio cannot keep playing), restores the body/html overflow styles, scrolls back to the saved position and focuses the launcher button.

If the app does not report `READY` within 12 seconds (blocked framing, network), the overlay shows an error with an "Open in a new tab" link and a Close button.

The launcher deduplicates itself when included twice, uses event delegation (buttons added later still work), and exposes `window.__digCratesLauncher.open(slug)` / `.close()` for programmatic use. It dispatches `dig-crates:opened`, `dig-crates:closed` and `dig-crates:demo-product` DOM events on `document` for host analytics.

## B. In-page embed

With the launcher (gets bounded auto-height via `RESIZE` messages):

```html
<div data-dig-inline="basement-wax" style="min-height:650px"></div>
<script async src="https://YOUR-DIG-HOST/embed/dig.js"></script>
```

Without any script (fixed height, internal scrolling):

```html
<section aria-labelledby="dig-heading">
  <h2 id="dig-heading">Explore our record crates</h2>
  <div style="width:100%;min-height:650px;position:relative;">
    <iframe
      title="Browse our record crates"
      src="https://YOUR-DIG-HOST/embed/basement-wax?mode=inline"
      loading="lazy"
      allow="autoplay"
      style="display:block;width:100%;height:650px;border:0;border-radius:12px;"
    ></iframe>
  </div>
</section>
```

The inline app fills its frame (`100dvh`) and scrolls internally, so it is complete at 375 px width inside a content column. `RESIZE` requests are grow-only and clamped to 480–1400 px to avoid resize loops.

**Hosts built with React/Vue/etc.:** render the `data-dig-inline` container after hydration (the demo host does this in `InlineEmbedContainer`), or use the plain iframe snippet. The launcher watches the DOM with a `MutationObserver`, so containers that appear later are mounted automatically.

## Message protocol

All messages carry `{ namespace: "dig-crates", version: 1, storeSlug }`. Both sides check `event.origin` against the exact expected origin and `event.source` against the expected window, then parse the payload with Zod (`src/lib/embed-messages.ts`). Anything else is ignored (and logged in development).

App → host:

| type | fields | meaning |
|---|---|---|
| `READY` | | app hydrated; host hides loader and sends `FOCUS` |
| `REQUEST_CLOSE` | | visitor pressed Back/Close or Escape inside the app |
| `RESIZE` | `height` (200–4000) | inline only; host may grow the frame within bounds |
| `OPEN_DEMO_PRODUCT` | `recordId` | visitor pressed "Demo buy"; host receives `dig-crates:demo-product` |

Host → app:

| type | meaning |
|---|---|
| `FOCUS` | move keyboard focus to the first control in the app |
| `HOST_CLOSING` | host is removing the frame; app stops audio |

## Allowed origins

The app only talks to the host when the `parentOrigin` query parameter is:

- the DIG app's own origin (the demo host pages), or
- listed in the store's `allowedEmbedOrigins`, or
- `http://localhost:*` / `http://127.0.0.1:*` when running in development or when the app was **built** with `DIG_ALLOW_LOCALHOST_EMBED=1`.

Otherwise the app still works, but sends no messages and logs a warning. `parentOrigin` is only ever used as a `postMessage` target, so a spoofed value cannot reach another origin.

## Framing headers

`next.config.ts` sets `Content-Security-Policy: frame-ancestors …` on `/embed/:slug` (self plus localhost in development or with `DIG_ALLOW_LOCALHOST_EMBED=1` at build time) and `frame-ancestors 'self'` on every other route. A production deployment would configure per-store origins here. Framing is controlled by this header, not by CORS.

## What the embed does not do

- It does not read or modify the host page's CSS; the shop's look comes from validated theme tokens applied inside the iframe.
- It does not share cookies, identity or personal data; the prototype is anonymous.
- It does not navigate the host page. "Demo buy" only shows a notice (and a DOM event for the host).
