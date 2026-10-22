# DIG API v1

Base path `/api/v1`. Every response is `{ "data": …, "error": null | { code, message, details }, "requestId" }`.
Error codes: `VALIDATION`, `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `PROVIDER_UNAVAILABLE`,
`SOURCE_UNPLAYABLE`, `RATE_LIMIT`, `NO_CANDIDATES`, `AMBIGUOUS_MATCH`, `CONFLICT`, `INTERNAL`.

Identity: a signed, HttpOnly `dig_guest` cookie is minted on first request. All private
state is scoped to that principal server-side (and by RLS on Supabase).

| Endpoint | Method | Body / query | Returns |
|---|---|---|---|
| `/health` | GET | – | backend, catalogue counts |
| `/scenes` | GET | – | scene seeds with a sample card |
| `/seed-routes` | GET | – | editor seed routes with cards |
| `/sources/resolve` | POST | `{url}` | an import record (status, player, match candidates) |
| `/search` | GET | `q,type,yearFrom,yearTo,tag,playable,limit` | grouped results |
| `/digs` | GET | `limit,cursor,archived` | `{sessions, hasMore, nextCursor}` |
| `/digs` | POST | `{seed:{type:'recording'|'scene'|'url', id?,slug?,url?}, mode, distance}` | `DigState` |
| `/digs/:id` | GET / PATCH | `{title?, status?}` | `DigState` / summary |
| `/digs/:id/next` | POST | `{mode?, distance?, nodeId?}` | `DigState` with regenerated suggestions |
| `/digs/:id/action` | POST | `{action, candidateId?, nodeId?, mode?, distance?, reasonCode?, idempotencyKey}` | `DigState` (+ `sessionNote`, `changed`) |
| `/digs/:id/fork` | POST | `{fromNodeId, mode, distance}` | child `DigState` |
| `/digs/:id/resume` | POST | – | `DigState` |
| `/crates` | GET / POST | `{title, description?}` | crates + views / crate |
| `/crates/export` | GET | `format=csv|json, crateId?` | file |
| `/crates/:id` | GET / PATCH / DELETE | | |
| `/crates/:id/items` | GET / POST | `sort,q,view,limit,cursor` / `{recordingId?|sourceId?, notes?, loved?}` | items / item (idempotent) |
| `/crates/:id/items/:itemId` | PATCH / DELETE | `{notes?, tags?, status?, loved?, moveToCrateId?, copyToCrateId?}` | item |
| `/imports` | GET / POST | `status` / `{urls:[…]}` | import records |
| `/imports/:id` | PATCH / DELETE | `{userTitle?, userNotes?}` | record |
| `/imports/:id/confirm` | POST | `{entityId | null}` | record |
| `/profile` | GET / PATCH | personalisation + a11y fields | profile |
| `/profile/taste` | GET / DELETE | – | stable taste summary |
| `/profile/sessions` | DELETE | – | clears session history only |
| `/profile/export` | GET / POST | – | JSON file |
| `/profile/delete` | POST | `{confirm:"DELETE"}` | deletes principal, clears cookie |
| `/entities/:kind/:id` | GET | kind ∈ artist,label,tag | entity + recordings |
| `/recordings/:id` | GET | – | card, players, neighbours, routes |

### Actions

| action | effect |
|---|---|
| `pass` | weak session signal (−0.05); advance to the next sibling candidate |
| `keep` | save to All Finds (idempotent); +0.40 session; +0.15 stable *only if opted in* |
| `love` | save + loved; +0.90 session; +0.80 stable *only if opted in* |
| `dig_deeper` | regenerate queue from current record with `mode`/`distance`, take the best branch |
| `select` | take a specific `candidateId` from the current record's queue |
| `wrong_direction` | penalise the path's relation types (+ the record's mood/style or era tags) in this session only; exclude the record; regenerate from the fork; offer "back to last good record" |
| `back` | return to the parent node |
| `jump` | go to any node on the trail (revisit +0.25 session) |

Debug: with `DIG_DEBUG_RANKING=1`, `?debug=1` on `/digs` POST, `/digs/:id` and `/digs/:id/next` includes score traces.
