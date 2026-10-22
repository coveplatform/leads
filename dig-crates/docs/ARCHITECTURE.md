# Architecture

## One engine, many shops

`StoreExperience` (`src/components/store-experience/StoreExperience.tsx`) is the whole product. It receives a validated `CatalogSnapshot` (store, crates, records), a `presentationMode` (`standalone`, `overlay` or `inline`) and an optional theme override, and renders the same views for every shop:

```
StoreExperience
├── StoreHeader          Back/Close, logo, crates home, pile count
├── CratesHome           landing: search, crate tiles with montages, "Jump back in"
├── Toolbar              crate name + count, Crate/Wall/Listen tabs, search, filters, sort, chips
├── CrateViewer          one record at a time (arrow keys, swipe, end-of-crate card, mobile bar)
├── WallViewer           virtualised square grid, roving focus, arrow-key navigation
├── ListeningViewer      now-playing panel + virtualised queue
├── RecordDetail         <dialog> drawer with tracklist, player, pile, dig, demo buy
├── PileDrawer           per-store shortlist with indicative total, copy, demo checkout notice
├── FilterPanel          facets with live count
├── RelatedDrawer        Dig Around This results with reasons and a breadcrumb trail
└── Notice               polite live region + toast
```

The three demo hosts (`/demo/hosts/:slug`) are ordinary pages with their own unrelated CSS. The only thing they share with DIG is one button carrying `data-dig-open` and the launcher script.

## Layers

```
UI (React client components)
  └── BrowseContext + reducer (src/domain/browse-reducer.ts)
        └── pure domain functions (catalog.ts, related.ts, filters.ts, pricing.ts)
              └── CatalogSnapshot (validated fixture data)

Server (App Router pages + route handlers)
  └── CatalogRepository (src/domain/types.ts interface)
        └── demoRepository (src/data/demo-repository.ts, fixture JSON validated with Zod)
              [future: Shopify / WooCommerce / CSV adapters]
```

Pages call the repository on the server and pass the snapshot to the client component. Filtering, sorting, search and related-record scoring run client-side on that snapshot with the same pure functions the API routes use, so the UI never depends on fixture files directly.

## State model

The browsing context is one reducer state (`BrowseState`), not loose component state:

- `crateId`, `viewMode`, `query`, `filters`, `sort`, `sortSeed`
- `orderedRecordIds`, `focusedRecordId`, `position` (derived by `recompute` whenever scope changes)
- `cratePositions` (last record per crate, so re-opening a crate resumes)
- `openedPanel` (`none | details | pile | filters | related`), `inspectRecordId`
- `relatedSeedId`, `navigationTrail` (Dig Around This breadcrumb)
- `pile`, `notice`, `endOfCrate`, `hydrated`

Invariants enforced in the reducer and covered by tests:

- Opening or closing any panel never changes `position`.
- Switching view modes keeps the focused record and filters.
- Applying filters keeps the current record if it still matches; otherwise the first match is selected and a notice says so.
- Reaching the end of a crate sets `endOfCrate` (explicit card with Restart / Browse another crate / Back). No silent wrapping.
- `JUMP_TO_RECORD` on a record outside the current results widens to All Records and clears filters with a notice, so the change is visible and reversible.
- `RESTORE_SESSION` validates every id against the catalogue; unknown crates, records and pile entries are dropped.

## Persistence

`src/lib/persisted-state.ts` writes versioned, store-scoped keys:

- `digcrates:pile:<slug>:v1`
- `digcrates:session:<slug>:v1` (crate, view, query, filters, sort, focused record, crate positions)
- `digcrates:theme-draft:<slug>:v1` (theme lab only)
- `digcrates:sortseed:v1` in sessionStorage so the seeded shuffle is stable for the browser session
- `digcrates:events:v1` demo analytics log (capped at 200)

Audio state is never persisted. Everything read back is parsed with Zod; malformed data is ignored.

On load the app restores the pile and remembered crate positions but starts on the crates landing screen, so a returning visitor sees "Jump back in" rather than being dropped mid-crate. Standalone deep links (`?crate=&view=&record=&q=` plus filter params) take precedence over the saved session. Inside an iframe the URL is never touched.

## Audio

`src/lib/audio-controller.ts` owns a single `HTMLAudioElement`. `play()` is only called from click handlers. Navigating to another record, changing view mode or crate, closing the overlay and unmounting all call `stop()`, which also releases the source. Blocked autoplay (`NotAllowedError`) becomes a visible "press play again" message. Each player shows "Demo audio: synthetic test loop, not this record"; records without a preview show "Preview unavailable" and no play control.

## Dig Around This

`src/domain/related.ts` scores same-store candidates with the blueprint's weights (artist 10, label 8, primary genre 6, shared styles 4 each up to 8, year ±3 → 3 or ±7 → 2, BPM ±8 → 2, explicit staff link 2). Ties break on a stable hash of seed+candidate ids. Sold records are excluded unless the visitor ticks "Include sold-out records". Results are diversified (max 2 per label, max 3 per artist in the top 8). If fewer than four candidates score ≥ 6, weaker ones (score ≥ 2) are added and labelled "Nearby style". With no metadata link at all the panel says so and offers All Records instead of inventing a connection.

## Theming

Theme tokens (`ThemeTokens` in `src/domain/types.ts`) are validated with Zod: colours must be hex, fonts must be plain family lists, radii are bounded integers, shadow and header styles are enums. `themeToCssVars` turns them into `--dig-*` custom properties set inline on the `.dig-root` element only; `src/styles/tokens.css` consumes them. Header treatment (`minimal`, `editorial`, `bold`) and shadow depth are class switches. Nothing from a store configuration is ever interpolated into a stylesheet.

A theme override can be supplied as a validated partial (`themeOverride` prop, or `?theme=<base64url JSON>` on `/store` and `/embed`, which the theme lab uses for its "embedded sample" link). Invalid keys are dropped and reported in the UI.

## Performance

- Wall and Listening modes are windowed (`useVirtualRows`): only visible rows plus overscan are in the DOM. The 5,000-record stress store renders fewer than 200 tiles at any time.
- Covers reserve a 1:1 box; Wall covers lazy-load; Crate mode preloads only the previous and next cover.
- Search is debounced (220 ms); filters apply immediately. Query, filter and sort are pure functions over the snapshot and run in well under a frame for 5,000 records.
- The host page never loads the app until the launcher is clicked (overlay) or the inline container is present.

## Security notes

- Store-scoped repository methods and API routes verify `record.storeId` matches the requested store; cross-store ids return 404 or are excluded.
- Query parameters are validated with Zod; invalid input returns a consistent 400; limits are capped at 100.
- All fixture strings are rendered as text. No HTML is injected from data.
- Asset URLs in fixtures must be relative paths; `productUrl` is `null` for every demo record and the buy action is mocked.
- `postMessage` uses exact target origins on both sides, validates sender windows, and parses payloads with Zod (`src/lib/embed-messages.ts`).
- `/embed/*` sends `Content-Security-Policy: frame-ancestors 'self'` (plus localhost origins in development or when built with `DIG_ALLOW_LOCALHOST_EMBED=1`); every other route refuses framing.

## Future extension points (not implemented)

- `CatalogRepository` implementations for real inventory sources.
- `preview` adapters for shop-supplied or licensed audio.
- `productUrl` / `buyUrl` mapping and a retailer admin for crates and branding.
- Per-tenant `frame-ancestors` and host authorisation.
