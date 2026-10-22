# DIG Phase 1 — technical plan and acceptance tests

Milestones were executed in order; each lists what "done" meant and the test
that proves it.

| # | Milestone | Depends on | Acceptance |
|---|---|---|---|
| 0 | Repo, strict TS, Tailwind tokens, ESLint/Prettier, Vitest, Playwright, CI, `.env.example` | – | `npm run check` passes; `npm run dev` boots with no env |
| 1 | Schema + RLS migrations; embedded Postgres for demo mode; seed with derived edges | 0 | `tests/unit/ranking.test.ts` seeds 111 records / 1,100+ edges in memory; `supabase/migrations/0003_rls.sql` applies |
| 2 | Providers: URL normalisation, SSRF defence, YouTube/SoundCloud/Bandcamp/Discogs/Instagram/generic adapters, mock-friendly fetch | 1 | `tests/unit/url.test.ts`; `tests/integration/api.test.ts` → *imports / resolve* |
| 3 | Ranking: 1–2 hop retrieval, bands, four mode presets, three distance allocations, scoring with trace, diversity, explanations | 1 | `tests/unit/ranking.test.ts` (determinism, no duplicates, provenance, mode behaviour, distance, penalties, remix distinct, sparse record) |
| 4 | Sessions: create / next / action (pass, keep, love, dig_deeper, select, wrong_direction, back, jump) / fork / resume / patch; idempotency | 3 | integration → *dig session lifecycle*, *isolation* |
| 5 | Crates, imports inbox, search, stable taste, export/delete | 4 | integration → *crates*, *stable taste separation*, *search* |
| 6 | Screens: Dig, Search, Crates, History, Imports, Profile, Record; PWA | 5 | `tests/e2e/dig.spec.ts` |
| 7 | Docs: README, API, ADRs, seed QA CSV, limitations, licence list | 6 | this file, `README.md` |

## The demonstrated journey

Covered by `tests/e2e/dig.spec.ts` test 1 and the integration suite:

paste a seed track *or* choose a scene → see a recommendation with its
explanation → listen (official embed) or open the original source → dig
deeper → save → mark wrong direction → choose a different branch → navigate
back → close and resume the session later (reload) → export a crate (CSV/JSON).

## Not in Phase 1 (by design)

Accounts/sync, bulk Instagram/Discord/Discogs import, fingerprinting, audio
downloads, chat, social feed, ML training, shop checkout, stock sync, cross
provider crossfade, playlists on other platforms, universal autoplay.
