# Test results (Phase 1 hand-off)

Run on 2026-10-22 in the build environment (Node 22, Chromium via Playwright, embedded Postgres in memory).

| Suite | Command | Result |
|---|---|---|
| Lint | `npm run lint` | 0 errors, 0 warnings |
| Typecheck (strict, `noUncheckedIndexedAccess`) | `npm run typecheck` | clean |
| Unit: URL parsing / SSRF / providers | `npm test` → `tests/unit/url.test.ts` | 10 passed |
| Unit: guest tokens (Node + Edge HMAC parity) | `tests/unit/guest.test.ts` | 3 passed |
| Unit: ranking (determinism, dedupe, provenance, modes, distances, penalties, remix distinctness, sparse record, same-title collision) | `tests/unit/ranking.test.ts` | 11 passed |
| Integration: API routes in-process (sessions, idempotency, isolation, imports/resolve, crates, taste separation, export/delete, search) | `tests/integration/api.test.ts` | 21 passed |
| Browser E2E (Pixel 7 viewport): guest journey incl. keep, dig deeper, select branch, back, wrong direction, back-to-good, reload/resume, crates, history; imports (unsupported + YouTube embed); personalisation opt-in; keyboard + reduced motion | `npm run test:e2e` | 4 passed |
| Production build | `npm run build` | succeeds; 36 routes |

Totals: **45 unit/integration tests passed, 4 E2E tests passed, 0 failures.**

Seed: 111 demo recordings, 1,151 derived edges (`npm run db:seed`), QA sheet in `docs/seed-qa.csv`.

## Acceptance criteria mapping (blueprint §22)

- URL parser/provider classification incl. short URL, time offset, Bandcamp, SoundCloud, unsupported, internal URL → `url.test.ts`
- Canonical matching, version disambiguation, same-title collisions → `ranking.test.ts`, `api.test.ts` (*imports / resolve*)
- Ranking deterministic given seeded graph → `ranking.test.ts`
- Distance allocation + explanation provenance → `ranking.test.ts`
- Pass weak / wrong direction session-only / love respects opt-in → `api.test.ts` (*dig session lifecycle*, *stable taste separation*)
- Repeated save idempotent, duplicate prevention, fork/backtracking → `api.test.ts`
- `POST /sources/resolve` resolved / ambiguous / unsupported / provider unavailable → `api.test.ts`
- Auth isolation (User A vs User B) → `api.test.ts` (*isolation*)
- Browser flows 1–7 of §22 → `tests/e2e/dig.spec.ts` (shop pilot flow 8 is Phase 3)
