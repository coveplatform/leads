# ADR-0002: Catalogue graph snapshot in memory

**Status:** accepted (Phase 1)

Ranking is specified as deterministic, explainable pure functions. The Phase 1
catalogue is small by design ("300 deep records beat 100,000 unconnected ones"),
so `src/lib/catalogue/graph.ts` loads recordings, edges, tags, sources and
curations into memory once per process and the ranking runs over that snapshot.
Postgres remains the source of truth; `invalidateCatalogue()` is called after
seeding or when an import is confirmed into the catalogue.

Swap point: when the catalogue exceeds roughly 10k recordings, replace
`retrievePaths` with a SQL neighbourhood query (the `music_edges` indexes already
exist) and keep scoring/diversity/explanations unchanged.
