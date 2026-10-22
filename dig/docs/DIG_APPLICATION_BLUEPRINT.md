# DIG — Complete Application Blueprint

**Version:** 1.0  
**Prepared:** 23 October 2026  
**Status:** Implementation specification for an AI coding agent  
**Product:** DIG (working title)  
**Primary platform:** Responsive web application / installable Progressive Web App (PWA)  
**Primary user:** A serious music discoverer who digs through YouTube, Bandcamp, Discogs, SoundCloud, record-store catalogues, curated mixes, and links found in Discord and Instagram.

> **The entire product in one sentence:** Paste a track or choose an interest, explore an interconnected musical world, audition music from authorised sources, save discoveries to a personal crate, and decide where the rabbit hole goes next.

> **Non-negotiable product principle:** DIG is not an endless-feed app that quietly decides a user's taste. It is a *user-steered digging tool* with session-specific exploration, transparent musical connections, reversible branches, and a slowly changing personal taste model.

---

## 0. Instructions to the implementing agent

1. Build **Phase 1 (functional consumer MVP)** completely before attempting Phase 2 or Phase 3. Deliver a working, mobile-first product rather than a static concept or mockup.
2. Use this blueprint as the source of truth for product behaviour, data contracts, edge cases, architecture and testing. Where a choice is not specified, choose the simplest maintainable implementation, document it in an ADR, and proceed.
3. Keep all third-party services behind **provider adapters**. Do not build a product that requires unauthorized scraping, unsupported API scopes, copyrighted audio downloads, or a fictional single universal music player.
4. For unavailable credentials, create a **fully functional seeded demo mode** with realistic records, clearly tagged as sample/demo data. Real-provider integration must be selectable using environment variables and feature flags. Do not fabricate real playback or claim a link was identified if it was not.
5. **Do not treat the later record-store feature as part of the initial MVP.** Architect for it (IDs, tables, routes, auth roles) and implement it in the later phase only.
6. Make changes in small testable increments. Run lint, type-check, unit tests, integration tests, and Playwright smoke tests as you go. Never bypass failing checks merely to report success.
7. After each phase: provide a working URL if a deployment is configured, setup instructions, known limitations, and the exact acceptance tests that pass.
8. Seek human input only for truly external blockers (credentials, legal authorisations, retailer account access). Build the rest with feature flags and mock adapters rather than stopping.

## 1. Product definition

### 1.1 Problem

People discover extraordinary music across scattered destinations: YouTube uploads, Bandcamp catalogues, Discogs release pages, SoundCloud mixes, independent labels, DJ selections, record stores, Instagram turntable videos and Discord discussions. The exploration itself is enjoyable, but:

- Links are scattered across screenshots, chat messages, saves, bookmarks and tabs.
- Streaming recommendations tend to repeat familiar patterns and optimise attention rather than useful discoveries.
- Finding a good track doesn't reveal a cohesive, navigable web of its label, aliases, collaborators, remixers, era, scene and stylistic neighbours.
- A temporary curiosity can poison long-term recommendations.
- Interesting branches disappear when the listener closes a tab or follows a new link.
- Record-store online catalogues often feel like databases rather than physical crates.

### 1.2 DIG's solution

One place to **start from any track**, hear/listen where legally supported, and navigate by **why music is connected**. A track can lead to a label, an artist alias, a remix, the same scene, a human curator, a sonic neighbour or (later) a retailer selling a copy. Every fork is represented in a persistent digging history. Users can save anything to personal crates and return to old branches.

### 1.3 What DIG is / is not

| DIG is | DIG is not |
|---|---|
| A personal, controllable music-discovery workspace | A replacement for Spotify or YouTube |
| A graph of meaningful musical connections | A generic autoplay feed |
| A place to save links and releases from many sources | An unlicensed audio aggregation/hosting service |
| An exploration system with memory and backtracking | A machine-learning black box |
| Eventually, a listening/browsing layer for real shops | A clone of the Discogs marketplace |
| Taste-aware with session control | A social network dependent on followers |

### 1.4 Success criteria

**North-star outcome:** **qualified discoveries per digging session**. A qualified discovery is an item saved and then deliberately revisited, exported, or opened again after at least 24 hours (not just a like or passive view).

Initial, *hypothetical* success gates to validate with users:

- A new user can start digging in **three meaningful interactions** or fewer.
- At least 70% of seeded sessions yield a working preview or a clear off-platform listening action (this is a content-coverage target, not an assertion of current capabilities).
- At least 30% of test participants intentionally save one or more new items in a 15-minute session.
- At least 20% of test participants return within 7 days.
- Fewer than 5% of recommendations are outright duplicate tracks in a given session.
- 100% of recommendations expose a legible reason for appearing.
- A user can press **Wrong direction** and visibly move to a different branch without altering their persistent taste preferences.

Do not optimise for raw time-on-site or compulsive swiping.

## 2. Users and jobs to be done

### Persona A: Serious underground digger (primary)
Finds deep house, techno, ambient, disco, experimental and obscure edits on YouTube, Bandcamp, Discogs and mixes. Values provenance, rarity, exact versions, human curation and unusual links. Rejects mainstream recommendation sameness.

### Persona B: Musically curious explorer
Starts with a known record or mood, doesn't know labels or aliases, and needs simple explanations and approachable paths without overwhelming technical metadata.

### Persona C: Independent record-store owner (Phase 3)
Already has inventory in CSV, Shopify or a point-of-sale system, and wants customers to *audition and browse the shop digitally* with direct links to purchase.

### Core jobs

1. "I found a record I love; take me further into this sound."
2. "I don't know what I want, but I want to dig through unfamiliar music."
3. "I found something on Instagram or Discord; save it before I lose it."
4. "This branch is heading somewhere awful; change course without changing who you think I am."
5. "Show me why this record appeared and how it relates to another."
6. "Take me back to an interesting branch I found last week."
7. Later: "Let me explore the actual stock of a record shop in another city."

## 3. Phases, strict scope and milestones

### Phase 0: Technical spike and design foundation

- Validate official embed playback for a single YouTube video, SoundCloud track and permitted Bandcamp embed on desktop and iOS Safari.
- Verify basic metadata / search access with current provider agreements.
- Build a small legal demo graph (100+ sample records, with real externally verified URLs where possible and/or explicit demo-mode placeholders).
- Prove persistent session branching and save-to-crate.
- Implement design tokens and mobile layout.

**Done when:** seeded end-to-end flow works without credentials; provider sandbox links behave correctly; unsupported player cases explicitly fall back to "Open on source".

### Phase 1: Consumer MVP — BUILD THIS FIRST

**Must have**

1. Welcome, optional sign-in / guest demo, seed selection.
2. Start a dig from a pasted URL, track search or seed card.
3. One record-at-a-time discovery cards; listen, pass, keep, love, dig deeper, wrong direction.
4. Four exploration modes: Similar feeling, Connections, Era & scene, Unexpected.
5. Discovery distance: Focused / Explore / Wild.
6. Full explanation of why each candidate is presented.
7. Backtrackable session history with branches and resume.
8. Personal saved crate with simple folders, tags and source links.
9. Import/share a supported track URL; unresolved items stay in a review inbox.
10. Transparent separation between stable taste and current session interests.
11. Source-aware player with error / unavailability fallbacks.
12. Search, settings, privacy/export/delete, basic analytics and tests.

**Not in Phase 1:** automatic mass-import of Instagram/Discord/Discogs collections, audio fingerprinting, automated audio downloads, real-time chat, social feed, ML model training, shop checkout, shops' full stock sync, third-party streaming crossfade, playlists on other platforms, universal autoplay.

### Phase 2: Better discovery

- Broader catalogues and optional licensed recommendation feeds.
- Curated label / artist / record-shop staff trails.
- Advanced filters and connection graph view.
- Saved search and import improvements.
- Improved taste/sonic similarity models based on properly licensed features/data.
- Shareable trails (links only, no social network).
- Optional cross-provider identification assistance and human corrections.

### Phase 3: DIG for Shops — separately deployable B2B module

- Multi-tenant shop accounts, CSV import, stock catalogue, crate browsing, preview links, purchase outbound links, admin metrics.
- Shopify integration for stores that explicitly authorise it.
- Optional retailer-branded storefront and embed widget.
- B2B subscription billing only after pilot validation.

## 4. The mental model and information architecture

Five core entities must be visually distinguishable:

1. **Recording:** A unique recorded performance / version of a track.
2. **Release:** The specific single/EP/album/issue on which that recording appears; may include multiple pressings.
3. **Source:** A YouTube video, Bandcamp page, SoundCloud track, etc., *pointing to* a recording or release. One recording can have multiple sources.
4. **Connection:** A typed, explainable link between recordings/releases/people/labels/scenes.
5. **Dig session:** A navigable trail of chosen branches. It is *not* the same thing as the user's taste profile.

Other entities: Artist (with aliases), Label, Tag/Scene, Crate, Save, Feedback, Shop, Listing, Curator, Import.

**Navigation (mobile bottom bar):** `Dig` · `Crates` · `History` · `Search` · `Profile`.

**Desktop:** left navigation, central current record and player, right column containing branch options and a collapsible trail.

## 5. Critical user flows

### Flow A — first launch

1. Show value proposition: "Find something you weren't looking for."
2. Offer **Start with a track**, **Choose a scene** or **Try a demo dig**.
3. No forced sign-up before first session. Persist guest state locally; ask for an account when saving across devices.
4. Scene choices are initial *session seeds*, **not permanent tastes**.
5. Display an immediately usable track from the seeded graph, with working preview or obvious offsite action.
6. Show a one-time micro-tutorial for Keep / Dig deeper / Wrong direction / Back.

### Flow B — paste a link

1. User pastes a URL from YouTube, SoundCloud, Bandcamp, Discogs, Instagram, a known shop or an arbitrary web page.
2. Client validates and normalises. Server determines provider and tries an authorised, provider-specific resolve.
3. Successful match shows title, recording/version (if confidently known), available player and `Start digging from this`.
4. Ambiguous match presents options: "Is this the right recording?" No silent wrong merge.
5. Unsupported or unresolved URL becomes **Unidentified Find** with original link, editable title, provider and optional notes; user can keep it without losing it.
6. If a YouTube upload is a whole DJ set, mark it **mix/unknown track** rather than pretending the upload represents one recording.
7. After saving, display "Dig around this" only if the item has enough metadata/edges, otherwise suggest manual search or curated nearby results.

### Flow C — exploration loop

1. Current card has cover art (if permitted), artist, title, release/label/year if known, source attribution and playable status.
2. Tap play. If a compatible official player exists, render it. Otherwise show `Listen on YouTube/SoundCloud/Bandcamp/...` without fake audio controls.
3. Actions: **Pass** (weak signal), **Keep** (save), **Love** (explicit stronger taste signal), **Dig deeper**, **Wrong direction**, **More info**.
4. Choosing Dig deeper opens branching options: `Similar feeling`, `Label / artist connections`, `Same era / scene`, `Unexpected but connected`.
5. Selected branch generates candidates and explains each candidate's connection.
6. Swiping left/right is optional convenience; accessible on-screen buttons are always present. Do not use gestures to navigate away from a currently playing track without a clear state transition.
7. App records the branch and displays a breadcrumb (`Track A > Label > Track B`). Back returns to the previous branch with scroll/playback context intact as practicable.
8. After 3 consecutive passes or one `Wrong direction`, offer a new branch or adjust session scoring; **do not silently permanently revise stable taste**.

### Flow D — resume a rabbit hole

- Show sessions ordered by latest activity, with seed art, title, modes used, tracks considered and tracks saved.
- Opening a session restores current node, branch, mode, distance, queued candidates and visited history where possible.
- User can fork an old branch into a new child session while preserving the original trail.

### Flow E — collect a record

- `Keep` adds item to default `All Finds` crate; duplicate save is idempotent.
- From crate, move/copy into user crates, add notes/tags, choose `want vinyl`, `heard`, `own`, `buy later` optionally.
- Crate item retains the exact source link and capture timestamp, even if canonical identification is pending.
- Allow export as CSV and JSON from day one. Never trap a user's collection.

### Flow F — current dig is going badly

- `Wrong direction` opens optional reasons: `Too polished`, `Too aggressive`, `Too similar`, `Too far from seed`, `Wrong era`, `Not interested in this branch`, `Other`.
- Do not mandate choosing a reason.
- Penalise the current branch and its inferred attributes **only within this session**, show alternate paths, and provide a one-tap `Back to last good record` option.
- Present a dismissible note: "Changed this dig only. Your overall taste hasn't changed."

### Flow G — sample shop journey (Phase 3)

- From `Record Shops`, choose retailer > choose New Arrivals / House / Staff Picks > browse actual inventory > audition allowed preview > open retailer checkout in new tab.
- Listing availability, price, grade, location and shipping info come from the seller's source of truth; display timestamps and don't claim stock is guaranteed until checked by seller.
- Retailer does not have to publish full inventory to be useful; a limited staff-picked crate is valid.

## 6. Screen specifications

### `/` / `/dig` — Discovery

- Header: logo `DIG.`, search icon, personal crate shortcut.
- Entry: `Start from a track` with paste/search; suggestion of session seeds and recent digs.
- Active session layout:
  - Current record card (artwork, title, artist, release year, label, source/provider).
  - Visible native/official playback surface or honest offsite listening link.
  - Main row: Pass / Keep / Dig Deeper; secondary Love / Wrong Direction / Info.
  - Mode selector and distance selector accessible via compact sheet.
  - Explanation chip: `Because this producer also recorded under ...` or `Same label, 1997–1999`.
  - Trail icon, branch count and back action.
- State handling: loading skeleton; no usable audio; no matches; offline; API quota exceeded; provider blocked; empty branch; ambiguous release.

### `/search`

- Search recordings, releases, artists, labels, tags/scenes and saved imports.
- Query debounced; group results by entity type; provide version metadata where known.
- Filtering: era, label, artist, source/provider, genre/scene, availability of preview (metadata-supported only).
- Results show `Start dig` and `Save` actions.

### `/crates` and `/crates/[id]`

- Default crates `All Finds`, `Loved`, `To Investigate` (special views, not separate duplicate data), user-created crates.
- Sort by date saved, title, artist, year. Search and filter, bulk move, notes, edit tags, export.
- Saved original URL shown alongside canonical data; unresolved items remain visible.

### `/history` and `/history/[sessionId]`

- Session cards including seed, date, paths, number saved.
- Breadcrumb/tree-style trail; responsive list for mobile, optional node graph for desktop later.
- Resume, fork, rename, archive and delete session. Expand a branch to see why each hop occurred.

### `/imports`

- Capture inbox with statuses: `identified`, `needs_confirmation`, `unresolved`, `unsupported`, `failed_retryable`.
- Paste one or multiple URLs; preview provider, source link, retrieved metadata if lawful/available; manual editing and matching.
- Mobile PWA supports `Share Target API` **where supported**; ordinary paste works everywhere.

### `/profile` and `/settings`

- Optional login, home region optional, playback preferences, onboarding interests, account export/delete, recommenders control.
- Two independent settings: `Use my Loved & Saved items to improve discovery` (opt-in), and `Personalisation strength: Off / Light / Moderate` (defaults Light after informed consent).
- Show and clear temporary session history separately from stable preferences.
- Accessibility: reduced motion and high contrast.

### Future shop screens

- Public `/shops`, `/shops/[slug]`, `/shops/[slug]/crates/[slug]`.
- Authenticated `/store-admin`: inventory sync, records, crates, analytics, brand options and subscription.

## 7. Visual / interaction design direction

**Mood:** Independent record store + tasteful underground electronic label archive. Avoid generic neon SaaS, endless TikTok visuals, dopamine-heavy gamification or clichéd turntable animations.

- Palette example: charcoal `#171717`, warm near-white `#F1EEE8`, parchment `#D7C7AE`, muted olive `#7E8977`, accent burnt terracotta `#B76A4C`.
- Typography: strong contemporary grotesk UI (e.g. Inter/Geist), optional editorial serif for select display headings. Respect font licences.
- Album artwork prominent but not the sole navigation method.
- Sound always user initiated. Never autoplay loud audio on opening.
- Motion 140–240 ms; reduced-motion preference fully supported.
- Minimum touch targets 44×44 CSS pixels. Contrast WCAG AA; visible focus states; screen-reader labels; keyboard shortcuts as progressive enhancements.
- No mandatory swiping: buttons offer equivalent actions.
- Product copy: `Dig`, `Keep`, `Wrong direction`, `Follow this label`, `Back to the fork`, `Save to crate`.

## 8. Recommended architecture

### 8.1 Stack

- **Frontend / backend:** Next.js (App Router), React, TypeScript with strict checks.
- **Styling:** Tailwind CSS, accessible component primitives, light component wrappers. Keep design tokens centralised.
- **Database:** PostgreSQL hosted via Supabase (or equivalent managed Postgres).
- **Auth:** Supabase Auth (email/passwordless link; optional OAuth later); anonymous guest state allowed.
- **Access control:** Postgres Row Level Security and server-side role guards. Retailer multi-tenancy in Phase 3.
- **Search:** Postgres full-text + `pg_trgm` initially; consider Typesense/Meilisearch only if justified by scale.
- **Data jobs:** Queue or cron/worker functions for metadata enrichment, retries and sync. Avoid long work in user requests.
- **Cache:** DB caching first; optional Redis/rate limiter if traffic warrants.
- **Analytics:** Privacy-conscious first-party product events; hosted analytics optional with consent.
- **Testing:** Vitest, React Testing Library, Playwright, API contract tests.
- **Deployment:** Vercel or suitable Node host + Supabase. Document env vars. Dev uses local Postgres / Supabase CLI.
- **PWA:** web app manifest, installability, offline cached history/crates, no expectation of offline streaming.

### 8.2 Bounded modules

```
src/
  app/                 # routes, layouts, pages
  components/          # shared UI; accessibility
  features/
    discovery/         # session & recommendations
    player/            # provider-aware playback
    imports/           # URL resolving and inbox
    crates/            # saved library
    search/            # entities / search
    taste/             # stable profile
    history/           # branches & resume
    shops/             # Phase 3; feature-flagged
  domain/              # typed entities and invariants
  lib/
    db/                # migrations, queries, RLS helpers
    auth/
    providers/         # music provider adapters
    ranking/           # pure deterministic scoring functions
    observability/
  workers/             # metadata resolution, sync
supabase/migrations/
scripts/seed-demo.ts
tests/unit/
tests/integration/
tests/e2e/
docs/adr/
```

Use *stable public contracts*: core domain interfaces must not reference provider-specific response JSON. Use migrations checked into version control. Do not insert platform tokens in client bundles.

### 8.3 System flow

```
User picks seed (search or URL)
  -> resolver identifies source and possible canonical recording
  -> create DigSession + root TrailNode
  -> branch chosen (mode, distance, session filters)
  -> candidate retrieval (graph + curated + permitted sources)
  -> scoring + dedup + diversity + explainability
  -> candidate cards with playable sources / source links
  -> actions and events recorded (keep/love/pass/wrong direction/fork)
  -> future candidate pool adjusts within session
  -> optional opt-in aggregate stable taste from explicit favourites
```

## 9. Database / canonical music model

Use UUID PKs, `created_at`, `updated_at`, source/attribution columns and migrations. All relations in Postgres; no graph database necessary in v1.

### `artists`

`id`, `name`, `sort_name`, `musicbrainz_id?`, `country?`, `aliases[]/artist_aliases`, `external_ids JSONB`, `status`, timestamps.

### `labels`

`id`, `name`, `country?`, `musicbrainz_id?`, `external_ids`, timestamps.

### `recordings`

`id`, `canonical_title`, `disambiguation?`, `duration_ms?`, `musicbrainz_id?`, `isrc?`, `first_release_year?`, `primary_artist_id?`, `metadata_confidence (0..1)`, `visibility`, timestamps.

**Invariant:** a remix, radio edit or alternate performance must not silently merge with an original recording; version/recording IDs are distinct.

### `releases`

`id`, `title`, `release_type`, `label_id?`, `catalogue_number?`, `release_date?`, `country?`, `musicbrainz_release_id?`, `format?`, `artwork_url?`, `artwork_rights_state`, timestamps.

### Junction tables

- `recording_artists(recording_id, artist_id, role)`;
- `release_recordings(release_id, recording_id, position, duration_ms?)`;
- `release_labels(release_id, label_id, catalogue_number?)`;
- `entity_tags(entity_type, entity_id, tag_id, provenance, confidence)`;
- `artist_relations(from_artist_id, to_artist_id, type, provenance)`.

### `music_sources`

`id`, `provider enum`, `external_id?`, `canonical_url`, `target_type (recording|release|unresolved|mix)`, `target_id?`, `display_title?`, `thumbnail_url?`, `embed_type enum (youtube|soundcloud|bandcamp|none)`, `embed_url?`, `playability enum (embeddable|external_only|unavailable|unknown)`, `rights_status`, `last_verified_at?`, timestamps.

**Invariant:** storing a link does not imply permission to stream audio or copy artwork. The authoritative source remains the provider.

### `music_edges`

`id`, `from_type`, `from_id`, `to_type`, `to_id`, `relation_type`, `weight_0_to_1`, `provenance enum (verified_metadata|licensed_data|human_curator|inferred)`, `provenance_ref?`, `confidence_0_to_1`, `explanation_template?`, `created_at`.

Allowed v1 relations: `same_label`, `same_artist`, `artist_alias`, `remixed_by`, `same_release`, `producer_overlap`, `collaborated_with`, `same_era_scene`, `curated_together`, `tag_similarity`, `similar_sound_unverified`. Only show strong factual statements for verified links. For inferred links, text uses "Similar atmosphere" not "Produced by".

### `curation_sets` / `curation_items`

Named curated routes maintained by authorised seed curator/admin, e.g. "90s warm atmospheric house". Each item contains canonical recording or saved source, ordering, curator note and optionally a reason link. Essential for cold-start quality.

### User and session tables

- `profiles(user_id, handle?, personalization_opt_in, personalization_strength, onboarding_complete, created_at)`.
- `taste_signals(id, user_id, entity_type, entity_id, signal_type, strength, provenance_event_id?, created_at)`.
- `dig_sessions(id, user_id?, guest_token_hash?, seed_type, seed_id?, seed_url?, title, mode, discovery_distance, status, current_node_id?, started_at, last_activity_at)`.
- `trail_nodes(id, session_id, parent_node_id?, entity_type, entity_id?, music_source_id?, depth, via_edge_id?, explanation, branch_mode, position, created_at)`.
- `session_filters(session_id, rejected_edge_types JSONB, rejected_tags JSONB, accepted_tags JSONB, candidate_state JSONB, seed_anchor, updated_at)`.
- `discovery_events(id, user_id?, session_id, trail_node_id?, candidate_id?, event_type, reason_code?, event_metadata JSONB, created_at)`.
- `crates(id, user_id, title, description?, is_system, created_at)`.
- `crate_items(id, crate_id, recording_id?, release_id?, music_source_id?, imported_url?, notes?, status, saved_at)`; unique index on the canonical item identity per crate where resolved.
- `imports(id, user_id?, original_url, normalized_url, provider, status, extracted_metadata JSONB, match_candidates JSONB, resolved_entity_id?, error_code?, created_at, updated_at)`.

### Phase 3 shop tables

- `shops(id, owner_user_id, name, slug unique, location_text?, public_url, logo_url?, is_published, created_at)`.
- `shop_members(shop_id, user_id, role)`.
- `shop_integrations(id, shop_id, provider, encrypted_credentials_ref?, sync_cursor?, status, last_synced_at?)`.
- `shop_listings(id, shop_id, external_inventory_id?, release_id?, recording_id?, title, catalogue_number?, grading?, price_minor, currency, quantity, availability, original_checkout_url, source_of_truth, last_synced_at?, updated_at)`.
- `shop_crates(id, shop_id, title, slug, sort_order, is_published)` and `shop_crate_items(shop_crate_id, shop_listing_id, position)`.
- `shop_outbound_events(id, shop_id, listing_id, user_id?, session_id?, event_type, created_at)`.
- `shop_audit_log(id, shop_id, actor_id, action, changed_fields JSONB, created_at)`.

### Indexing & policies

- Trigram/full-text indexes on recording, artist, release, label titles.
- Index `music_edges(from_type, from_id, relation_type)` and reverse; `trail_nodes(session_id, parent_node_id)`; `dig_sessions(user_id,last_activity_at DESC)`; `crate_items(crate_id,saved_at DESC)`.
- Unique normalized provider+external_id as appropriate; gracefully support multiple source URLs for a recording.
- RLS: users can only read/write their own private crates, imports, taste, history and events. Public catalogues and published shops readable; shop staff edit only their own shop through membership role check.
- Check constraints on enumerations, probabilities, currency and nonnegative stock.
- Retain provenance for every externally sourced datum. Add data tombstoning/deletion routines.

## 10. Playback and providers — **crucial feasibility layer**

Implement a `MusicProvider` interface with capabilities so no UI code assumes all sources behave alike.

```ts
type ProviderName = 'youtube' | 'soundcloud' | 'bandcamp' |
  'discogs' | 'instagram' | 'generic' | 'demo';

type PlaybackCapability = 'embed' | 'external' | 'none';

type ResolveResult = {
  originalUrl: string;
  canonicalUrl: string;
  provider: ProviderName;
  resolvedEntityId?: string;
  confidence: number;
  title?: string;
  artist?: string;
  kind: 'recording' | 'release' | 'mix' | 'unresolved';
  playback: PlaybackCapability;
  embedUrl?: string;
  attribution?: string;
  requiresConfirmation: boolean;
};

interface MusicProvider {
  canHandle(url: URL): boolean;
  resolve(url: URL): Promise<ResolveResult>;
  getPlayerConfig(item: ResolveResult): Promise<{
    capability: PlaybackCapability;
    embedUrl?: string;
    externalUrl: string;
  }>;
}
```

**YouTube**: Use official IFrame Player API; the iframe/player must respect provider display requirements, autoplay blocking and privacy rules. Data API quota usage is limited and changeable; cache only as allowed by policy. Never download the underlying video/audio or use an unapproved audio-only extraction stream. Timestamp links can be passed to the supported player where applicable.

**SoundCloud**: Use its documented embeddable widget and widget API; fall back to a platform link when unavailable. Do not assert private/unplayable content can be streamed.

**Bandcamp**: Use official creator-provided embeddable players where available. An arbitrary Bandcamp URL must not be assumed to yield a programmatically discoverable authorised embed. Otherwise open original page.

**Discogs**: Consider it primarily a music-data/release reference and outbound destination, **not** an audio provider. Do not build commerce redirection on Discogs API content unless written permission explicitly supports that use.

**Instagram**: Treat shared reel links as bookmarks/external URLs unless an official, authorised embed is applicable. No automated extraction, ripping or large-scale crawling.

**Discord**: User explicitly shares/pastes links; do not read private servers or messages without an authorised Discord integration and permissions.

**Spotify**: Not a required dependency; Spotify preview URLs are deprecated/restricted and not a legal foundation for a standalone preview service. Optional official outbound links / compliant embeds only after review.

**Generic unknown URL**: Store URL and user description, `external_only`; never proxy a private target or scrape arbitrary websites.

**Player UX:** `embeddable` -> authorised provider player; `external_only` -> branded `Listen on [source]` CTA; `unavailable` -> disabled with explanation + alternative available source if legitimately known. Attempt next source only on user action or supported player behaviour; preserve current trail.

**Source selection:** prefer legal, embeddable, geographically playable source; if unavailable, preserve all known source options; don't present YouTube uploads as exact vinyl pressings without verified match.

## 11. Metadata ingestion / identity resolution

The application needs *one canonical music model* and *many provider sources*. Implement an importer pipeline:

```
parse -> normalise URL -> determine provider -> resolve permitted metadata
  -> clean title -> candidate match -> confidence threshold
  -> create/link recording OR unresolved item
  -> ingest metadata edges with provenance
  -> create valid source player config
  -> index & mark ready
```

- Parse common YouTube `watch`, `youtu.be` and valid time offsets, SoundCloud and Bandcamp links. Remove irrelevant tracking parameters; retain original URL in import record.
- Never make an internal-network request or follow unrestricted redirects from user-supplied URLs (SSRF defence). Apply allowlists, bounded redirects, byte/time limits, and DNS/private-IP blocking.
- Match using normalised artist+title, source explicit IDs, duration tolerance (only where legitimate), release and remix descriptors.
- Thresholds for v1 (heuristic): `>=0.92` auto-match only with strong identifiers; `0.65..0.92` user confirmation; below `0.65` unresolved. These are placeholders requiring calibration, not guaranteed probabilities.
- If uncertain, preserve the raw source rather than creating a wrong canonical association.
- Handle unusual Unicode, `feat.`, remix, edit, version, live recording, full set, label catalogue numbers and multiple uploaders.
- Record `resolved_by`, `provider_ref`, `confidence`, `data_licence`, `last_verified_at`.
- Queue retryable errors and surface status to user; never lose an imported link.
- For MVP, prioritise reliable pasted-link ingestion over automated bulk import.

### Data enrichment choices and licences

- **MusicBrainz:** useful for artist/release/recording relations. Current public web API has an identified user-agent and approximate 1 request/second limit per IP; noncommercial API use is free, commercial access requires checking plans/permission. Core database data is CC0, supplementary data has noncommercial restrictions. Do not automatically assume all MusicBrainz data is cleared for a commercial product.
- **ListenBrainz:** has documented recommendation/related APIs, but these are optional and may have scope/availability limitations. Never rely on a user's ListenBrainz profile being present.
- **Cover Art Archive:** review artwork attribution/rights, cache and endpoint behaviour separately; don't assume the release's metadata license automatically covers all artwork.
- **Your own records:** seed from curated entries you have rights to store as metadata and links; keep provenance explicit.

## 12. Discovery algorithm — deterministic, explainable, controllable

### 12.1 Core constraints

1. **No universal feed learning indiscriminately from views.** Session exploration and long-term taste are separate storage and ranking concepts.
2. An explicit branch choice is stronger than inferred preference.
3. Every suggestion has an explanation, a provenance class and a backtrack link.
4. Never present unavailable content as playable.
5. Surface some unfamiliar paths, but keep them connected to the chosen seed.
6. Skipping is weak evidence. `Wrong direction` is a session-level correction. `Love` is an explicit stable signal only if user opted into stable taste modelling.
7. A user can switch personalisation off entirely while preserving manual crates.

### 12.2 Candidate generation (MVP)

Given current node and chosen branch:

- Direct graph neighbours (verified links weighted highest for connection mode).
- Second-hop neighbours with a clear chain and lower confidence.
- Curated sets that contain current recording, artist or scene.
- Same labels/artist aliases/collaborators/era, depending on active mode.
- Tags with provenance and semantic similarity where actually supported.
- Optional broad discovery: deliberately selected adjacent edges; **never unrelated random records disguised as linked**.
- Respect filters, visited records, unresolved playability, explicit exclusions.

Don't generate the entire queue on each swipe; fetch a bounded candidate pool (e.g. 60), rank and return a page of 10, persisting the score reasons/selection trace.

### 12.3 Ranking

Use a v1 scoring function with logged feature values. Example:

```
score =
  0.30 * connection_relevance
+ 0.20 * mode_alignment
+ 0.13 * session_positive_affinity
+ 0.12 * provenance_confidence
+ 0.10 * curated_quality
+ 0.08 * source_playability
+ 0.07 * novelty
+  personalisation_bonus            // capped at ±0.05, opt-in only
- repeated_artist_penalty
- visited_penalty
- session_wrong_direction_penalty
- very_common_overexposure_penalty
```

These are starter heuristics to **test and tune**, not validated weights. Weight presets should change by mode. In Connections mode, validated label/remixer/alias relationships dominate. In Similar Feeling, curated tags and authorised sonic features dominate. In Era/Scene, date/location/tag relevance matters most. In Unexpected, adjacent two-hop graph paths are emphasised without losing explanation.

**Ranking post-processing:** within any window of 10, avoid 3+ from the same artist unless the user explicitly requested that artist; target a mix of labels, regions, eras, while preserving mode constraints. Don't turn deliberate deep label explorations into forced random diversity.

### 12.4 Discovery distance

Mode defaults (test parameters, *not* percentages promised to users):

| Distance | Close to anchor | Adjacent | Unexpected but traceable |
|---|---:|---:|---:|
| Focused | 80% | 18% | 2% |
| Explore | 60% | 30% | 10% |
| Wild | 25% | 40% | 35% |

These are **candidate allocation targets** within current session. Define near/adjacent/far using graph hops, edge type, tag distance and curated relationships. A surprise must still be connected by an explainable path, or clearly marked `Editor's wildcard`.

### 12.5 Stable taste vs session profile

**Long-term taste:** update only from explicit Loved records and opt-in Keeps (weighted less), editable user labels and optional user-imported preferences. Apply slow decay where appropriate and allow viewing/editing profile. Do not train on incidental click, three quick skips or an unusual one-off session.

**Session interest:** stores active seed, chosen mode/distance, accepted/rejected branches, last N actions, temporary tags and exclusions. Fully editable and discardable. Defaults expire from active influence at session end; branch state remains in history for resumption.

Suggested signal scale (implementation heuristic): `pass = -0.05 session only`, `keep = +0.40 session, optionally +0.15 stable`, `love = +0.90 session, optionally +0.80 stable`, `wrong_direction = -0.80 current branch only`, `revisit = +0.25 session`. Do not silently record stable signals without user opt-in.

### 12.6 Why this track?

Each candidate response must include:

```ts
type RecommendationExplanation = {
  headline: string;
  steps: Array<{
    fromId: string;
    relation: string;
    toId: string;
    confidence: 'verified' | 'curated' | 'inferred';
  }>;
  mode: 'feeling' | 'connections' | 'era_scene' | 'unexpected';
  distance: 'focused' | 'explore' | 'wild';
};
```

Example: "Released on the same label, two years later" (verified) or "Selected alongside this record by an editor" (curated). Never manufacture credits, dates or interpersonal relationships using an LLM.

### 12.7 When it gets weird

If user taps `Wrong direction`:

1. Mark current edge/path rejected in session (not global taste).
2. Increase penalties for the offending edge type or explicitly tagged trait.
3. Retain original seed and last saved/loved anchor.
4. Offer `Back to last good record`, `Try another kind of connection` or `Stay near this sound`.
5. Regenerate queue excluding visited/rejected candidates and show what changed.
6. If pool is exhausted, display honest fallback: "No strong links left here. Jump back or try a different route."

### 12.8 Cold start

- Seed catalogue manually curated, representative and high quality (target 300–1,000 legitimate metadata entries / permitted listening links for initial testing, with 1,000+ verified/curated graph edges as a later goal).
- Use 10–20 editorial seed routes rather than learning from zero listeners.
- Never invent plays, popularity, or rarity metrics.
- Offer users a seed by track URL; that establishes relevance without needing listening-history access.
- Quality beats total size. 300 deep, interesting, well-linked records are preferable to 100,000 unconnected metadata entries.

### 12.9 Pseudocode

```ts
async function nextDigCandidates(ctx: DigContext): Promise<Suggestion[]> {
  const graph = await retrieveGraphNeighbours(ctx.currentEntity, ctx.mode, 2);
  const curated = await retrieveCuratedMatches(ctx);
  const candidates = dedupeByCanonicalRecording([...graph, ...curated]);
  const allowed = candidates.filter(c =>
    !ctx.visitedRecordingIds.has(c.recordingId) &&
    !ctx.sessionExcludedIds.has(c.recordingId) &&
    !isSessionExcludedBranch(c, ctx) &&
    hasUsefulMetadataAndValidSource(c)
  );
  const ranked = allowed.map(c => ({
    ...c,
    score: calculateExplainableScore(c, ctx),
    reason: buildVerifiedOrCuratedExplanation(c, ctx)
  }));
  return diversityRerank(ranked, ctx).slice(0, ctx.pageSize);
}
```

Expose ranking diagnostics in a protected dev/admin debug panel only; public users see simple explanations and controls.

## 13. API specification (initial routes)

Use versioned server routes `/api/v1`. Validate all payloads with Zod or equivalent. Require authenticated user ID for persisted private state; guest IDs use time-limited, hashed tokens. Response envelope:

```json
{ "data": {}, "error": null, "requestId": "uuid" }
```

Error codes: `VALIDATION`, `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `PROVIDER_UNAVAILABLE`, `SOURCE_UNPLAYABLE`, `RATE_LIMIT`, `NO_CANDIDATES`, `AMBIGUOUS_MATCH`, `CONFLICT`, `INTERNAL`.

| Endpoint | Method | Body / parameters | Return |
|---|---|---|---|
| `/sources/resolve` | POST | `{url}` | resolve result + match candidates |
| `/search` | GET | `q,type,yearFrom,yearTo,limit,cursor` | grouped results |
| `/digs` | POST | `{seed:{type,id/url}, mode, distance}` | session + first card |
| `/digs` | GET | pagination | current user's sessions |
| `/digs/:id` | GET | none | session, current state, trail |
| `/digs/:id/next` | POST | `{currentNodeId, mode?,distance?,cursor?}` | suggestion cards, reason, cursor |
| `/digs/:id/action` | POST | `{candidateId,action,reasonCode?,idempotencyKey}` | updated session state |
| `/digs/:id/fork` | POST | `{fromNodeId,mode,distance}` | child session / node |
| `/digs/:id/resume` | POST | none | restored state |
| `/digs/:id` | PATCH | `{title?,status?}` | updated session |
| `/crates` | GET/POST | name etc. | crate list / created crate |
| `/crates/:id/items` | GET/POST | `{recordingId?,sourceId?,notes?}` | items / saved item |
| `/crates/:id/items/:itemId` | PATCH/DELETE | fields | success |
| `/imports` | POST/GET | `{urls:[...]}` | import jobs/status |
| `/imports/:id/confirm` | POST | `{entityId}` | confirmed mapping |
| `/profile/taste` | GET/PATCH | prefs, controls | stable signals and setting |
| `/profile/export` | POST | export format | signed/streamed export |
| `/profile/delete` | POST | confirmation | deletion job status |

**Sample suggestion response**:

```json
{
  "data": {
    "sessionId": "uuid",
    "suggestions": [{
      "candidateId": "uuid",
      "recording": {"id":"uuid","title":"Example Track","artist":"Example Artist","year":1997},
      "release": {"id":"uuid","label":"Example Label","catalogueNumber":"EX-012"},
      "source": {"provider":"youtube","url":"https://www.youtube.com/watch?v=REPLACE_ME","playability":"external_only"},
      "explanation": {"headline":"Released on the same label", "mode":"connections", "steps":[]},
      "scoreDebugAvailable": false
    }],
    "nextCursor": null
  },
  "error": null,
  "requestId": "uuid"
}
```

**Idempotency:** Action and save endpoints accept an idempotency key. Repeated Keep must not create duplicate crate items or duplicate feedback events.

**Pagination:** cursor-based for large lists. Include `hasMore` and avoid fragile offset paging where activity is live.

**Phase 3 shop routes:** `/shops`, `/shops/:slug`, `/shops/:slug/crates`, `/shops/:slug/listings`, `/shops/:slug/clickout`, `/store-admin/inventory/import`, `/store-admin/sync`, `/store-admin/crates`, `/store-admin/analytics`; role-guarded write endpoints. Shops control which data is publicly exposed.

## 14. Demo seed data and content strategy

For developer demo mode, build a curated and clearly labelled sample graph. It must exercise all UI paths and ranking modes, not just present a static list.

Suggested scenes: 1990s deep house; Detroit techno; Japanese ambient; early UK progressive / melodic electronic; dub techno; jazz-inflected house; left-field disco.

- Each example recording has artist/title/year, optional label/release, provider source info, attributed provenance, and one or more typed edges.
- Include deliberate duplicate uploads, aliases, remixes, unavailable videos, ambiguous same-title tracks, mixes mistaken for singles and sparse metadata to test robust handling.
- Use *verified* public source URLs or demo-only mocks clearly labelled as such. Don't invent working links, release credits, legal artwork rights, rarity counts or current availability.
- Create a seed QA spreadsheet/CSV with columns `recording,artist,release,label,year,source_url,playback_supported,relation_type,relation_target,provenance,licence_status,last_checked`.
- For automated tests, use entirely local synthetic music data to keep CI stable and deterministic.

## 15. Background workers and integration reliability

- `import.resolve`: handle provider URL metadata with concurrency caps and per-provider rate limits.
- `catalogue.enrich`: lookup permitted artist/release relations, log source licensing and schedule retries.
- `source.verify`: verify provider availability opportunistically and within terms (no aggressive polling).
- `rank.feedback.aggregate`: only for opt-in stable taste updates; deterministic batch handler.
- `shop.stock.sync` (Phase 3): import from authorised provider, diff changes, mark removed items sold/unavailable, retry failures.
- Use exponential backoff with jitter; bounded retries; dead-letter queue; admin visibility.
- Cache according to provider's terms and expiry; do not hold data longer than allowed.
- Audit provider request count, errors, quota headroom, median latency and % source coverage.

## 16. Security, privacy and rights

**High priority:**

- No ripping, downloading or redistributing copyrighted audio/video without the rights. Do not create audio proxies to avoid platform restrictions.
- Respect embed display requirements, permissions, branding and terms for every provider.
- Never claim you can ingest arbitrary private Discord messages or Instagram reels without explicit authorisation.
- Review licences of music metadata, recording images, artist photos and album covers separately.
- Clearly attribute the original platform and artists where required.
- Avoid an unsafe arbitrary URL fetcher: protect against SSRF, redirects to internal networks, excessive downloads, malicious markup, and token leakage.
- Guard API routes; RLS on private data; encrypt credentials; keep secrets server-side. Shops' integrations use scoped OAuth tokens, never plaintext credentials in DB.
- CSRF/session protections for state-changing requests; content-security-policy compatible with whitelisted embedded players; HTML sanitisation, output encoding and rate limits.
- Account data export and deletion. Default private crates. No sale of listening-history data. Minimal analytics retention.
- Do not use a person's private saved finds for public recommendations without explicit permission.
- Manage copyright/rights takedown requests, source removals and content-report workflow.
- Australian Privacy Principles/GDPR implications reviewed before public launch in relevant jurisdictions; legal assessment is an external workstream, not a coding shortcut.

## 17. Shop module detailed blueprint (Phase 3)

### 17.1 Retailer value proposition

"Turn your existing stock into interactive digital crates customers can browse, audition where permitted, and buy directly from you."

**Not the initial pitch:** "We are replacing Discogs."

### 17.2 Shop onboarding

1. Owner creates store account, claims shop and verifies ownership.
2. Imports a sample CSV, or connects permitted Shopify API account.
3. Maps columns: SKU/external ID, artist, title, label, catalogue no., condition, price, quantity, image URL, checkout URL, genre, source preview URL.
4. Review unmatched releases, duplicates and warnings before publication.
5. Choose public crates (New Arrivals / Staff Picks / 90s House / etc.) and theme.
6. Preview public storefront, approve, publish and copy share URL or embed snippet.

### 17.3 Inventory correctness

- A listing is a **specific seller copy / quantity**; don't confuse it with canonical release metadata.
- Retailer inventory is source of truth. Never reduce inventory on DIG's browsing events; purchases take place on shop platform.
- Report quantity, condition/grade, price (minor units), currency, seller, shipping region and last sync timestamp.
- If sync stale beyond threshold (configurable, initial 60 min), show `Check availability with store` instead of guaranteed `In stock`.
- Deleted/sold listings disappear from public crates or show `Sold` with a user-friendly state.
- Store can remove a listing, hide a crate or disconnect integration at any time.
- Inventory import idempotent by `shop_id + external_inventory_id`, with duplicate warning and dry-run preview.

### 17.4 Store tech rollout

**Pilot:** CSV and manual sync to prove demand. **Next:** Shopify Admin GraphQL product sync with approved permissions, webhooks where available, inventory reconciliation. **After:** other POS systems subject to API access agreements. **Discogs:** only if the exact intended commercial flow is permitted in writing. The store's own exported inventory is the safer first source.

### 17.5 Purchases and attribution

- Source-linked outbound checkout, not native payment in DIG initially.
- Track store clickouts by anonymous/internal ID. Don't imply a click is a completed sale.
- If retailer elects to share conversion events via agreed integration, report verified conversions separately.
- Handle affiliate or revenue-share terms transparently; no undisclosed diversion from Discogs marketplaces.

### 17.6 Shop analytics

- Crate opens, item impressions, listen-button clicks, saves, shop clickouts, conversion events (only if verified), stale-source error rate.
- Privacy-friendly aggregate dashboards with small cohort suppression; no private listener dossiers.
- Proposed pilot prices for experimentation only: A$0 for 1 pilot shop; test willingness to pay in A$39–99/month range plus optional onboarding fee. No claim of validated pricing.

### 17.7 Shop embed

- Lightweight responsive script/iframe snippet that shows a selected crate on shop's existing website.
- Versioned widget, isolated styles, no third-party cookies required for basic functionality, graceful no-JS fallback to shop crate URL.
- Each card attributes seller and points to seller checkout.

## 18. Business model and sequencing

**Consumer:** free discovery and crate saving for initial traction. Don't put basic music discovery behind a paywall.

**Retailer:** future B2B SaaS for digital shop crates and stock syncing if pilot demonstrates increased sales or measurable qualified leads.

Potential future premium consumer tools (unvalidated): unlimited curated trails, advanced crate management, offline *metadata* access, pro exports, custom saved searches. No paywalled copyrighted previews without proper permissions.

Avoid paid ads or sponsored placement in the main discovery queue initially; if ever added, label sponsorship distinctly and never silently alter relevance.

## 19. Analytics and event schema

Track (with consent/privacy compliance):

- `dig_started` (`seed_type`, `mode`, `distance`, `is_guest`)
- `candidate_impression` (`session_id`, `recording_id`, `source_capability`, `relation_type`)
- `listen_attempted` / `provider_playback_started` / `external_source_opened` / `provider_failed`
- `candidate_passed`, `item_kept`, `item_loved`, `wrong_direction`, `branch_selected`, `trail_backtracked`
- `session_resumed`, `crate_created`, `item_revisited`, `import_submitted`, `import_resolved`.
- Phase 3: `shop_crate_opened`, `shop_listing_clicked`, `shop_checkout_opened`, `shop_stock_stale`.

Primary analysis: 24h+ revisit rate, save quality, candidate diversity, % explained, % usable sources, wrong-direction recovery success, cross-session returns, imports saved successfully, percentage of relevant new artists/labels. Never reward the engine simply for making people swipe longer.

## 20. Errors and edge cases — required behaviours

1. **YouTube video removed:** retain source as unavailable, try another valid source or show outbound unavailable, never erase save.
2. **Region-locked embed:** show `Open on source` / alternative source. No bypass.
3. **Full set uploaded:** store as mix; ask user to identify a specific track manually before adding a track-level graph link.
4. **Track has multiple remixes:** show disambiguation, not silent original/remix merge.
5. **No good candidates:** say so, offer changing route, backtracking or starting a fresh dig.
6. **Repeated candidate:** hard-filter duplicates by canonical ID within active session unless explicitly revisiting.
7. **No licence/permission for artwork:** display neutral record-placeholder graphic and artist/title text.
8. **Internet offline:** saved crates and last session accessible from cache, streams not promised.
9. **Guest upgrades to account:** merge guest saves/history with idempotent dedupe and preserve trail IDs.
10. **A shop sells a record:** on next stock sync mark unavailable, keep user's saved release and avoid false buy CTA.
11. **User deletes profile:** delete private user state and revoke tokens, log deletion request completion; keep only required aggregate audit data under policy.
12. **Source data conflicts:** maintain provider attributions and canonical/disambiguation tools; don't arbitrarily choose the first result.
13. **User wants to leave the app:** always retain `Open original source` link. DIG must not become a walled garden.
14. **A user is only curious today:** end/clear session should not affect stable preference state.
15. **Embedded playback blocked on mobile:** show user-initiated tap-to-play and honest fallback instead of an infinite spinner.

## 21. Performance, accessibility and quality targets

- Mobile viewport first: 360px width upward. Layout functional on iOS Safari, Android Chrome and desktop Chrome/Firefox/Safari.
- First meaningful UI target under ~2.5 seconds on decent mobile connection, measured in deployment; avoid blocking on third-party player boot.
- Candidate API p95 target ~800ms after cache / local catalogue is populated; asynchronous enrichment must not block interface.
- Initial card skeleton visible immediately; card navigation responsive under 150ms when candidate queue already loaded.
- Debounce search, prefetch next few *metadata* cards, not prohibited audio.
- Respect prefers-reduced-motion. Keyboard and screen-reader workflows cover all gestures.
- Error boundaries per player/provider; resilient external embeds; safely handle 429 and retry-after headers.
- Basic observability: server errors, API latency, provider failure rate, job failures, slow SQL queries.

## 22. Tests and explicit acceptance criteria

### Unit tests

- URL parser/provider classification: YouTube short URL, video with time, Bandcamp, SoundCloud, unsupported, malicious internal URL.
- Canonical matching, version disambiguation, same-title collisions.
- Ranking deterministic given seeded graph and fixed inputs.
- Discovery distance allocation and constraints, explanation provenance.
- Session feedback update: pass has weak effect, wrong direction changes session only, love respects opt-in.
- Repeated save is idempotent, duplicate prevention, fork/backtracking consistency.

### Integration tests

- `POST /sources/resolve`: resolved, ambiguous, unsupported, provider unavailable.
- `POST /digs`, `/next`, `/action`, `/fork`: persistent branch graph.
- Auth/RLS: User A cannot read User B's crate, session or imports.
- Music provider mock errors and fallback UI state.
- Import resolution followed by canonical confirmation.
- Shop CSV dry run and import ID stability (Phase 3).

### Browser E2E tests (Playwright)

1. **Guest digging:** open home → choose seed → get playable/linkable card → keep → see crate.
2. **Rabbit hole:** choose `Connections` → candidate shows reason → dig deeper → backtrack → resume session after reload.
3. **Bad branch:** choose surprising mode → wrong direction → verify new candidate path and stable taste unchanged.
4. **Save a link:** paste supported URL → resolve or review → save; unsupported URL retained without crash.
5. **Personalisation:** opt-out user sees no persistent taste updates, then opts in and Loves a track to update profile.
6. **A11y:** all actions possible with keyboard; reduced motion honoured.
7. **Error:** third-party player fails → open original source still available.
8. **Shop pilot (Phase 3):** import CSV → publish crate → browsing / checkout clickout → sold item hidden or flagged.

### Definition of Done for Phase 1

- Deployed PWA usable on mobile and desktop.
- Guest can complete one dig without sign-up.
- Seeded content drives real functional session logic and backtracking; not static fake cards.
- Real providers integrated only where legitimate; compliant external fallback everywhere else.
- Search, crates, imports, session history, explanations and preferences persist reliably.
- RLS, input validation, rate limits, provider error handling, monitoring and basic privacy screens in place.
- README setup, `.env.example`, database migration + seed scripts, API docs and tests all included.
- No placeholder "coming soon" masquerading as working Phase 1 features.

## 23. Implementation order: tasks for autonomous coding agent

**Sprint 0: repo + design system**

- Initialise Next.js, strict TypeScript, Tailwind, UI primitives, formatting/lint, tests, Supabase local setup, CI.
- Create design tokens, mobile bottom nav, route skeletons, error/loading states, README, env vars.
- Build and validate a local demo fixture.

**Sprint 1: domain and data**

- Write SQL migrations and RLS policies for catalogues, sources, graph, sessions, events, crates, imports, taste.
- Write typed DB repository interfaces, seed script, test fixture generators.
- Implement catalog search, entity detail, source playback status.

**Sprint 2: provider adapters and imports**

- Implement URL parser / SSRF defence, YouTube/SoundCloud/Bandcamp/generic adapters, mock provider.
- Test official embed/external fallback and asynchronous resolution jobs.
- Build paste URL, matching review and unresolved inbox.

**Sprint 3: algorithm and exploration**

- Implement graph traversal, four branching modes, three distances, rankings, diversity, explanation generator.
- Write unit tests for all ranking/cold-start/duplicate scenarios.
- Implement session/feedback/backtracking API transactions and idempotency.

**Sprint 4: complete user experience**

- Discovery screen, cards, player, controls, responsive history breadcrumbs, crate saving.
- Build History, Crates, Search, Imports, Profile pages and guest-to-login migration.
- Add keyboard/accessibility, loading/error/empty states and analytics.

**Sprint 5: QA and private beta**

- Device testing and profiling, privacy/export/delete, observability, migrations validation.
- Invite 10–20 serious diggers to test actual finds for 15–20 min and record qualitative feedback.
- Compare discovery quality against their existing routines, manually review bad branches, tune ranking weights.
- Iterate and release public MVP only after no major broken playback or privacy cases.

**Sprint 6: shop pilot (only after consumer loop is credible)**

- Multi-tenant store tables and ACL, CSV mapping + import, shop pages, staff crate builder, seller links and analytics.
- Pilot with one authorised independent record shop; measure traffic and actual clickouts.
- Shopify sync afterward if the pilot demonstrates value.

## 24. Dependencies and blockers the owner must resolve

- Choose final product name/domain and confirm trademark conflict status.
- Own rights or permissions for any copied images/audio beyond provider embeds.
- Obtain official developer credentials for providers that require them; verify API terms and quota before commercial use.
- Confirm MusicBrainz commercial API/data rights for planned usage, or use an appropriately licensed local dataset / paid licence.
- Confirm Discogs-specific use separately before integration, especially if driving traffic to independent stores.
- Provide 10–20 personally curated seed tracks/labels if precise underground taste is essential to initial quality. The demo must still run without these.
- Find a pilot store willing to share authorised CSV or API stock in Phase 3.
- Decide privacy/terms and legal jurisdictions before public launch.

## 25. Product risks and mitigation

| Risk | Mitigation |
|---|---|
| The product is just another swipe feed | Make branch navigation/explanations and history the main interaction |
| Recommendations become repetitive | Session distance, diversity controls, source provenance, seed anchoring, explicit correction |
| Cold start has poor music | Curated graph, seeded trails, URL-based starts, manual beta feedback |
| Provider APIs block playback | Capability-based provider adapters, official embeds, clearly labelled outbound player links |
| Songs are misidentified | Separate source and recording entities, manual confirmation, source-first saving |
| Record-store data is stale | Source-of-truth integrations, timestamps and availability warnings |
| Music metadata licence conflict | Licence registry, provenance fields, commercial rights review before production |
| Monetisation is unproven | Consumer usefulness first, CSV-based retail pilot, sell only demonstrated incremental value |
| Too much scope | Enforce Phase 1/2/3 gates and feature flags |
| Privacy concerns | Minimal data capture, no public saved tracks by default, opt-in stable taste, data export/delete |

## 26. Decisions that must not be silently changed

- Build a **digging engine**, not a new social network.
- The user must be able to start from **any track URL** and keep the URL even if identification fails.
- **Explainability and backtracking** are flagship features.
- Stable taste must not be inferred from incidental swipes or one unusual session.
- Swipes are not required; accessible controls are first class.
- Record stores are **Phase 3**, not a dependency for Phase 1.
- Discogs is not assumed to be a permitted unlimited commercial data source.
- Music copyright and player permissions cannot be solved by simply placing YouTube audio into a homemade player.
- Never label mock previews/metadata as live or licensed.
- The first release should be enjoyable for a single person with no friends using it.

## 27. Research and integration references (verified 23 October 2026)

Review these live before coding because terms and limits can change:

1. MusicBrainz public API and access notes: https://musicbrainz.org/doc/MusicBrainz_API
2. MusicBrainz rate limits: https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting
3. MusicBrainz data licence: https://musicbrainz.org/doc/About/Data_License
4. ListenBrainz recommendation API: https://listenbrainz.readthedocs.io/en/latest/users/api/recommendation.html
5. YouTube IFrame Player API: https://developers.google.com/youtube/iframe_api_reference
6. YouTube Data API quotas: https://developers.google.com/youtube/data/getting-started
7. SoundCloud Widget API: https://developers.soundcloud.com/docs/api/html5-widget
8. Bandcamp official embedded player guidance: https://get.bandcamp.help/en/articles/15263071-how-do-i-create-a-bandcamp-embedded-player
9. Discogs API terms of use: https://support.discogs.com/hc/en-us/articles/360009334593-API-Terms-of-Use
10. Spotify developer access update: https://developer.spotify.com/blog/2026-02-06-update-on-developer-access-and-platform-security
11. Shopify products integration reference: https://shopify.dev/docs/api/admin-graphql/2026-04/queries/products
12. Spotify track preview deprecation: https://developer.spotify.com/documentation/web-api/reference/get-track

**Important:** These references document technical *capabilities*, not blanket approval for this particular business or all uses of the data. Explicit review remains necessary.

---

## 28. Final delivery checklist for the coding agent

Before claiming Phase 1 complete, provide:

- [ ] Source code and reproducible local setup
- [ ] `.env.example` with no real secrets
- [ ] Postgres migrations, RLS policies and demo seed
- [ ] Responsive interactive DIG UI
- [ ] Paste-link ingestion with unresolved state
- [ ] Provider-specific playback and fallback states
- [ ] Four modes + three discovery distances
- [ ] Deterministic scoring + provenance-backed explanations
- [ ] Keep, Love, Pass, Wrong Direction actions
- [ ] Persistent, backtrackable, resumable session trails
- [ ] Crates, history and search
- [ ] Opt-in stable taste separated from session signals
- [ ] Input validation, auth, isolation, privacy/export/delete
- [ ] Unit, integration and browser tests passing
- [ ] CI checks passing and basic telemetry
- [ ] Known limitations and integration permissions list
- [ ] Demonstration of one complete rabbit hole with actual state persisted

**End product promise:** Open DIG with a track, keep following a trail of credible musical connections, never lose a good find, never be trapped by an algorithm's strange detours, and eventually shop real record-store stock without leaving the digging experience.
