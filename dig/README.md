# DIG

A mobile-first, user-steered music rabbit-hole. Paste a track or pick a scene,
follow *explained* connections (labels, aliases, remixers, scenes, editors'
routes), keep what you find in crates, correct a bad branch without teaching
the app the wrong thing about you, and resume any trail later.

This is the **Phase 1 consumer MVP** from `DIG_APPLICATION_BLUEPRINT.md`.
Phase 3 (record shops) is architected in the schema and feature-flagged off.

## Run it in one command

```bash
cd dig
npm install
npm run dev          # http://localhost:3000
```

No database, keys or accounts needed. With `DATABASE_URL` unset, DIG runs an
**embedded Postgres** (PGlite, real Postgres in WASM) stored in `./.data/pglite`,
applies the SQL migrations and seeds the demo catalogue on first request. Your
guest crates and trails persist across restarts.

Useful scripts:

| Command | Does |
|---|---|
| `npm run check` | lint + typecheck + unit/integration tests |
| `npm test` | Vitest (unit + API integration against in-memory Postgres) |
| `npm run test:e2e` | Playwright smoke tests (starts its own dev server) |
| `npm run db:migrate` / `db:seed` | for a hosted Postgres (`DATABASE_URL`) |
| `npm run db:reset` | wipe the embedded demo database |
| `npm run seed:qa` | regenerate `docs/seed-qa.csv` |

## Deploy

Vercel + Supabase (or Neon / any Postgres):

1. Create a Postgres database. Set `DATABASE_URL`, `DIG_SESSION_SECRET` (long random
   string) and optionally `DIG_PROVIDER_NETWORK=1` in the Vercel project.
2. In Vercel set **Root Directory** to `dig`. Build command `npm run build`.
3. Run `npm run db:migrate && npm run db:seed` once against the database
   (locally with `DATABASE_URL` exported). Or leave `DIG_AUTO_SEED=1` and the
   first request migrates + seeds.
4. Supabase only: the migrations include RLS policies keyed to `auth.uid()`;
   they protect the tables if you ever expose them through PostgREST.

A serverless deploy **must** use `DATABASE_URL`: the embedded database's
filesystem does not survive cold starts on Vercel.

## What works (Phase 1)

| Area | Status |
|---|---|
| Welcome, guest mode, scene seeds, demo dig, pasted-link seed | ✅ |
| One-record cards: Pass / Keep / Love / Dig deeper / Wrong direction / Back / More info | ✅ |
| Four modes (Similar feeling, Connections, Era & scene, Unexpected) × three distances | ✅ |
| Deterministic, logged scoring with provenance-labelled explanations | ✅ (`src/lib/ranking`) |
| Persistent, backtrackable trails; resume after reload; fork a stop into a new dig | ✅ |
| Crates: All Finds + user crates, Loved / To Investigate views, notes, tags, status, move/copy, CSV + JSON export | ✅ |
| Imports inbox: identified / needs_confirmation / unresolved / unsupported / failed_retryable; mixes flagged; manual confirm | ✅ |
| Providers: YouTube (official nocookie embed + oEmbed), SoundCloud (widget + oEmbed), Bandcamp (external), Discogs (reference), Instagram/generic (bookmark) | ✅ |
| Stable taste separate from session interest; opt-in; strength Off/Light/Moderate; view + clear | ✅ |
| Search: recordings, artists (with aliases), labels, releases, tags, your imports; year + tag filters | ✅ |
| Profile: a11y prefs (motion, contrast, theme), export all, delete all, clear session history | ✅ |
| PWA manifest, installable, share target (where supported), conservative offline shell | ✅ |
| Security: SSRF-safe URL handling, Zod validation, per-principal rate limit, CSP, HttpOnly signed guest cookie, RLS SQL | ✅ |
| Unit + integration + Playwright tests, CI workflow | ✅ |

## Known limitations

- **Accounts.** Guest-only in this build. Supabase Auth sign-in and
  guest→account merge are not wired; the `principals` table is designed for it
  (one row per identity, `auth_user_id` nullable) so the merge is a single
  `UPDATE`.
- **Demo catalogue is sample data.** 111 editor-entered records across the
  seven suggested scenes with a per-record confidence. Facts come from
  well-known discographies but are *not* licensed metadata; edges derived from
  them carry `human_curator` provenance and are shown as "editor-curated", never
  "verified". Sample sources open a **provider search**, not a specific upload,
  so no link is invented. `docs/seed-qa.csv` lists every row.
- **No real-provider search.** Pasted links are resolved via official oEmbed
  endpoints (title/author only). There is no YouTube Data API or SoundCloud API
  search; `YOUTUBE_API_KEY` is reserved.
- **Bandcamp** pages open externally: an arbitrary Bandcamp URL does not expose
  an authorised embed id.
- **Catalogue graph is held in memory** per server process (see ADR-0002).
  Fine for Phase 1 sizes (hundreds to low thousands of records).
- **Analytics** are first-party `discovery_events` rows only; there is no
  dashboard. The ranking debug trace is available with `DIG_DEBUG_RANKING=1`
  and `?debug=1`.
- **Rate limiting** is per process (in-memory). Put a real limiter in front
  for multi-instance deployments.

## Production API licences / approvals the owner must obtain

| Dependency | Needed for | Status |
|---|---|---|
| YouTube IFrame embed + oEmbed | Playback and titles for pasted links | Used; review YouTube API Terms of Service and branding requirements before launch |
| YouTube Data API key | Search, richer metadata (not used yet) | Not required for Phase 1 |
| SoundCloud widget + oEmbed | Playback and titles | Used; confirm current widget terms |
| Bandcamp | Embeds need artist embed codes | Not integrated beyond outbound links |
| Discogs API | Release metadata / outbound | Not used; written permission required before any commerce-adjacent use |
| MusicBrainz | Enrichment (`MUSICBRAINZ_ENRICHMENT`) | Off; confirm commercial data rights first |
| Cover Art Archive | Artwork | Not used; neutral placeholder sleeves shown |
| Supabase Auth | Accounts | Optional; add keys to enable later |
| Instagram / Discord | Only user-pasted links, kept as bookmarks | No API use |

## Layout

```
src/app/              routes (App Router), /api/v1 handlers
src/components/       UI primitives (accessible buttons, sheets, player, cards)
src/domain/           typed entities and invariants (provider-agnostic)
src/features/         discovery, crates, imports, search, taste, identity services
src/lib/db/           client (PGlite / pg), migrations runner, seed + edge derivation
src/lib/catalogue/    in-memory graph snapshot of the catalogue
src/lib/providers/    URL parsing + SSRF defence, provider adapters, player config
src/lib/ranking/      pure deterministic candidate retrieval, scoring, diversity, explanations
src/lib/api/          envelope, errors, guest-cookie route wrapper, rate limit, Zod schemas
src/data/             demo catalogue (sample data)
supabase/migrations/  SQL schema, search indexes, RLS
scripts/              migrate, seed, reset, seed QA CSV
tests/                unit, integration (route handlers in-process), e2e (Playwright)
docs/                 plan, API, ADRs, seed QA CSV
```

See `docs/PLAN.md` for milestones and acceptance tests, `docs/API.md` for the
endpoint reference and `docs/adr/` for decisions.
