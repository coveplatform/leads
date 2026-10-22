# ADR-0003: Ranking weights, distance bands and session signals

**Status:** accepted as starting heuristics (to tune in beta)

- Score = blueprint §12.3 weights (`SCORE_WEIGHTS`) minus penalties; personalisation
  bonus capped at ±0.05 and applied only when the profile opts in.
- Bands come from graph structure: 1-hop strong relation → *close*; 1-hop
  curated/era/tag → *adjacent*; `similar_sound_unverified` or inferred 2-hop → *far*.
  Distance presets (§12.4) are allocation targets per page with backfill.
- Mode presets live in `MODE_ALIGNMENT`; Connections weights verified-style
  relations highest, Feeling weights tags/curation, Era & scene weights
  `same_era_scene`, Unexpected weights 2-hop/inferred paths.
- Session signals (§12.5): pass −0.05, keep +0.40, love +0.90, wrong direction
  −0.80 on the branch, revisit +0.25. Stable signals (+0.15 keep, +0.80 love)
  are written only with opt-in and decay with a 180-day half-life.
- Diversity: within a page, max 2 per artist (unlimited for deliberate
  artist/alias digs in Connections) and max 4 per label outside Connections.
