# Test results

Recorded on the build committed with this document (Node 22, Chromium 141 via Playwright 1.56).

## Static checks

| Command | Result |
|---|---|
| `npm run lint` | clean, 0 problems |
| `npm run typecheck` | clean |
| `npm run build` | succeeds (Next.js 16, Turbopack) |

## Unit and component tests (`npm run test`)

60 tests in 6 files, all passing (~4 s).

| File | Covers |
|---|---|
| `tests/unit/fixtures.test.ts` | Seed validation, per-store counts and edge-case ratios, store isolation in the repository, bounded pagination, related results on the real catalogue |
| `tests/unit/catalog.test.ts` | Token search, every filter group, conflicting filters, all sort keys, seeded shuffle stability, facets |
| `tests/unit/related.test.ts` | Every scoring weight and reason string, non-cumulative year rule, BPM rule, staff links, exclusions (seed, sold, other store, duplicates), relaxed "Nearby style" labelling, honest empty result, determinism, diversity caps |
| `tests/unit/reducer.test.ts` | Crate selection, next/previous and end-of-crate, view-mode switching, filter/position invariants, search from home, details not moving position, related trail and back, jump-to-record widening, pile dedupe, session restore with invalid ids, resume positions, persisted shape |
| `tests/unit/lib.test.ts` | Price formatting per currency, filter URL round-trip, pile/session persistence and malformed data, embed message schema, origin policy, inbound sender/origin validation, theme CSS variables, WCAG contrast, override rejection and CSS-injection attempts, URL theme param, analytics log cap |
| `tests/unit/components.test.tsx` | Landing render and scoped tokens, theme override on root only, crate navigation by button and keyboard, mode switching keeps record, no-results reset, details open/close with position preserved and demo-buy notice, pile count and total, preview unavailable / play on click / stop on navigate, Dig Around This with trail |

## End-to-end tests (`npm run test:e2e`)

Playwright, projects `desktop` (1366×860) and `mobile` (iPhone 13, 390×844, touch). 20 test runs: 17 passed, 3 skipped by design (theme lab and keyboard flows are desktop-only; the swipe flow is mobile-only). ~35 s against the production build.

| # | Flow | desktop | mobile |
|---|---|---|---|
| 1 | Demo shop → full-screen overlay → crate → next ×5 → save 2 → pile → close; host scroll, overflow and focus restored; no page errors | ✓ | ✓ |
| 2 | 390 px: mobile action bar, swipe next/previous with intent threshold, vertical swipe ignored, save from details | skipped | ✓ |
| 3 | Wall: filter + search, open 20th result, close, same scroll position and current tile | ✓ | ✓ |
| 4 | Listening: nothing autoplays, play on demand, switching records changes the single audio source, mode change stops playback, closing overlay removes the frame | ✓ | ✓ |
| 5 | Theme lab: preset swap restyles the same engine (same crate counts), contrast check flips to fail, JSON export downloads, reset restores | ✓ | skipped |
| 6 | Store isolation: separate piles, separate catalogues, separate localStorage keys, pile survives reload with audio idle | ✓ | ✓ |
| 7 | Inline embed on the shop's crates page at narrow width; internal scrolling; host page scroll unaffected | ✓ | ✓ |
| 8 | Unknown store: 404 page, embed not-found, API 404/400, no cross-store leak via related endpoint, no runtime errors | ✓ | ✓ |
| 9 | Keyboard: Enter opens, Escape closes from host and from inside the app, arrow keys in the wall, Enter/Escape on details, focus returns to the launcher | ✓ | skipped |
| 10 | 5,000-record store: fewer than 200 tiles in the DOM at any scroll position, search under 3 s, listening queue virtualised | ✓ | ✓ |

## Screenshots

`docs/screenshots/{desktop,mobile}/` contains, for each of the three brands: host site, crates home, crate mode, wall, listening, details, related, pile; plus the inline embed and the theme lab. Regenerate with `npm run screenshots` (requires a built app; the Playwright config starts one).

## Known limitations and honest notes

- The E2E suite runs against the production build on port 3100 and reuses a running server when one exists. The first run includes a build (1–2 minutes).
- Swipe gestures are exercised with synthetic `TouchEvent`s, which test the gesture logic but not real hardware momentum scrolling.
- Audio playback in headless Chromium is verified through the controller's reported state (`data-audio-status` on the DIG root), not by measuring sound output.
- `frame-ancestors` for localhost hosts is decided at build time (`DIG_ALLOW_LOCALHOST_EMBED=1`); the Playwright config sets it when it builds.
- Hydration: the demo host's inline container renders after hydration so the launcher's iframe is never inserted into markup React is about to hydrate. Static HTML hosts do not need this.
- Browser Back inside the standalone route leaves the app (the URL is updated with `replaceState` only); panel history is not pushed.
- Reduced motion is honoured through CSS (`prefers-reduced-motion`) and is not covered by an automated test.
