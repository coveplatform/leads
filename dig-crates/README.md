# DIG Crates

A white-label, interactive record-browsing layer that independent record shops can place on their own websites. One shared engine; each shop supplies its own theme tokens, logo and catalogue. This is a **working prototype built on fictional demo data**: every store, release, cover and audio clip is invented, nothing can be purchased, and no third-party service is called.

Built from `DIG_CRATES_FULL_BLUEPRINT.md` (the product specification supplied with the brief).

## Quick start

```bash
cd dig-crates
npm install
npm run dev          # http://localhost:3000
```

Open <http://localhost:3000> for the demo hub, then try the three simulated shops.

| Command | What it does |
|---|---|
| `npm run dev` | Next.js dev server on port 3000 |
| `npm run build` | Production build (Turbopack) |
| `npm start` | Serve the production build |
| `npm run lint` | ESLint (Next core-web-vitals + TypeScript rules) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test` | Vitest unit and component tests (jsdom) |
| `npm run test:e2e` | Playwright end-to-end flows on desktop and iPhone-size viewports. Builds and starts the app on port 3100 automatically |
| `npm run screenshots` | Re-captures `docs/screenshots/` with Playwright |
| `npm run verify` | lint + typecheck + unit tests + build |

Requirements: Node 20+ (developed on Node 22). Playwright needs its Chromium build (`npx playwright install chromium` if it is not already present).

No environment variables are required. See `.env.example` for the two optional ones.

## What you can do in the demo

Start at the **Basement Wax** demo site, click **Dig Our Crates**, pick the Techno crate, flip through records, play a demo loop, save two records, switch to Wall and back without losing your place, use **Dig Around This**, open the Pile, close the overlay and watch focus and scroll return to the shop page with the audio stopped. Then repeat on **Sunday Records** and **Signal Records**, which look like different shops but run the identical engine. The shop's "Dig Our Crates" page shows the in-page embed, which also works at phone width.

## Routes

| Route | Purpose |
|---|---|
| `/` | Developer demo hub |
| `/demo/hosts/:slug` | Simulated retailer homepage with the full-screen launcher |
| `/demo/hosts/:slug/crates` | The retailer's "Dig Our Crates" page with the inline embed |
| `/store/:slug` | Standalone store experience. Deep links: `?crate=…&view=crate|wall|listen&record=…&q=…` plus filter params |
| `/embed/:slug?mode=overlay|inline` | The iframe document used by both embed modes |
| `/demo/theme-lab/:slug` | Local-only branding editor with live preview, contrast checks and JSON export |
| `/demo/events` | Debug viewer for the client-side demo analytics events |
| `/api/demo/stores/:slug` | Store theme and metadata (read-only JSON) |
| `/api/demo/stores/:slug/crates` | Crate descriptors with counts |
| `/api/demo/stores/:slug/records` | Paginated and filtered records (`crate`, `q`, `sort`, `limit` ≤ 100, `cursor`, `genre`, `style`, `yearFrom`, `yearTo`, `priceMin`, `priceMax`, `format`, `condition`, `preview`, `available`) |
| `/api/demo/stores/:slug/related/:recordId` | Related records with explanations |
| `/embed/dig.js` | The embed launcher script |

Demo stores: `basement-wax`, `sunday-records`, `signal-records`. A hidden `stress-test` store with 5,000 generated records exists for performance testing (`/store/stress-test`).

## Embedding on a shop website

Full-screen overlay (recommended first integration):

```html
<button type="button" data-dig-open="basement-wax">Dig Our Crates</button>
<script async src="https://YOUR-DIG-HOST/embed/dig.js"></script>
```

In-page embed:

```html
<div data-dig-inline="basement-wax" style="min-height:650px"></div>
<script async src="https://YOUR-DIG-HOST/embed/dig.js"></script>
```

Details, the message protocol, allowed origins and framing headers are in [`docs/EMBEDDING.md`](docs/EMBEDDING.md). Architecture, state model and theming are in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Project layout

```
src/app/                 Next.js App Router routes (pages and read-only demo API)
src/components/
  store-experience/      The shared DIG engine (StoreExperience and its views and panels)
  demo/                  Simulated host sites, theme lab, events viewer
src/domain/              Pure logic: types + Zod schemas, catalogue queries, Dig Around This, pricing, reducer
src/data/                Fixture-backed CatalogRepository and the stress fixture
src/lib/                 Theme tokens, embed messages, persistence, audio controller, demo analytics
src/styles/              Tailwind entry, scoped DIG tokens, host-site styles
public/covers, public/demo-logos, public/demo-audio   Fictional generated assets from the brief
public/embed/dig.js      Launcher script
scripts/generate_demo_assets.py   The deterministic fixture generator supplied with the brief
tests/unit               Vitest (domain, lib, component tests)
tests/e2e                Playwright flows and screenshot capture
docs/                    Architecture, embedding guide, screenshots
```

## Test results

Last run on this build (see `docs/TEST_RESULTS.md` for the detail):

- `npm run lint`: clean
- `npm run typecheck`: clean
- `npm run test`: 60 tests across 6 files, all passing
- `npm run test:e2e`: see `docs/TEST_RESULTS.md`

## What is mocked or not built

This prototype validates the browsing interaction and white-label fit. The following are **intentionally not implemented** and are either mocked or absent:

| Area | Status |
|---|---|
| Inventory | Fixture JSON only (`src/data/fixtures/demo-seed.json`). No Shopify, WooCommerce, CSV or Discogs integration. `CatalogRepository` is the extension point |
| Checkout and payments | "Demo buy" and "Demo checkout" open an explanatory notice. Nothing is reserved, charged or linked to a real product page (`productUrl` is `null` everywhere) |
| Audio | Three synthetic 8-second WAV loops, labelled "Demo audio, not this record". No licensed previews, no streaming integration. About 20% of records deliberately have no preview |
| Artwork and logos | Generated SVG placeholders. The fixture logos were widened slightly so their text is not clipped |
| Accounts | None. The pile is anonymous and lives in the visitor's localStorage per store |
| Analytics | Event names are logged to memory/localStorage and shown at `/demo/events`. Nothing is sent to a server |
| Retailer admin | The theme lab is a developer tool; drafts are saved in the browser only. No login, no saved configurations |
| Embed origin policy | Enforced client-side (`allowedEmbedOrigins`, same origin, and localhost in development/when `DIG_ALLOW_LOCALHOST_EMBED=1` at build time). Production would also need per-tenant `frame-ancestors` and an authorisation design |
| Stress fixture | Derived deterministically from Basement Wax at runtime; not a real catalogue |
| Browser Back inside the app | The standalone route updates the URL with `replaceState` only, so Back leaves the app rather than stepping through panels |

Known limitations are listed with the test results in `docs/TEST_RESULTS.md`.

## Regenerating fixtures

`scripts/generate_demo_assets.py` is the deterministic generator supplied with the brief. It writes to `examples/` and `assets/` relative to its own parent directory; to regenerate into this app copy the outputs to `src/data/fixtures/demo-seed.json`, `public/covers`, `public/demo-logos` and `public/demo-audio`.
