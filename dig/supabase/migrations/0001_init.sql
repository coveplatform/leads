-- DIG Phase 1 schema. Postgres 14+. Runs unchanged on Supabase and on the
-- embedded PGlite used in demo mode.

-- gen_random_uuid() is core since Postgres 13; no pgcrypto needed.

-- ─── Catalogue ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS artists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  sort_name TEXT,
  country TEXT,
  musicbrainz_id TEXT,
  external_ids JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','hidden','tombstoned')),
  provenance TEXT NOT NULL DEFAULT 'human_curator',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS artist_aliases (
  artist_id UUID NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  PRIMARY KEY (artist_id, alias)
);

CREATE TABLE IF NOT EXISTS labels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  country TEXT,
  musicbrainz_id TEXT,
  external_ids JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS recordings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_title TEXT NOT NULL,
  disambiguation TEXT,               -- "Original Mix", "Larry Heard Remix", "Live at ..."
  duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms > 0),
  musicbrainz_id TEXT,
  isrc TEXT,
  first_release_year INTEGER CHECK (first_release_year IS NULL OR first_release_year BETWEEN 1900 AND 2100),
  primary_artist_id UUID REFERENCES artists(id) ON DELETE SET NULL,
  metadata_confidence NUMERIC(3,2) NOT NULL DEFAULT 0.5 CHECK (metadata_confidence BETWEEN 0 AND 1),
  visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','hidden','tombstoned')),
  is_demo BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS releases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  release_type TEXT NOT NULL DEFAULT 'single' CHECK (release_type IN ('single','ep','album','compilation','mix','other')),
  label_id UUID REFERENCES labels(id) ON DELETE SET NULL,
  catalogue_number TEXT,
  release_date DATE,
  release_year INTEGER,
  country TEXT,
  musicbrainz_release_id TEXT,
  format TEXT,
  artwork_url TEXT,
  artwork_rights_state TEXT NOT NULL DEFAULT 'none' CHECK (artwork_rights_state IN ('none','provider_embed','licensed','own')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS recording_artists (
  recording_id UUID NOT NULL REFERENCES recordings(id) ON DELETE CASCADE,
  artist_id UUID NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'primary' CHECK (role IN ('primary','featured','remixer','producer','composer')),
  PRIMARY KEY (recording_id, artist_id, role)
);

CREATE TABLE IF NOT EXISTS release_recordings (
  release_id UUID NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
  recording_id UUID NOT NULL REFERENCES recordings(id) ON DELETE CASCADE,
  position TEXT,
  duration_ms INTEGER,
  PRIMARY KEY (release_id, recording_id)
);

CREATE TABLE IF NOT EXISTS release_labels (
  release_id UUID NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
  label_id UUID NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
  catalogue_number TEXT,
  PRIMARY KEY (release_id, label_id)
);

CREATE TABLE IF NOT EXISTS tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'style' CHECK (kind IN ('style','scene','mood','era','region'))
);

CREATE TABLE IF NOT EXISTS entity_tags (
  entity_type TEXT NOT NULL CHECK (entity_type IN ('recording','release','artist','label')),
  entity_id UUID NOT NULL,
  tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  provenance TEXT NOT NULL DEFAULT 'human_curator' CHECK (provenance IN ('verified_metadata','licensed_data','human_curator','inferred')),
  confidence NUMERIC(3,2) NOT NULL DEFAULT 0.8 CHECK (confidence BETWEEN 0 AND 1),
  PRIMARY KEY (entity_type, entity_id, tag_id)
);

CREATE TABLE IF NOT EXISTS artist_relations (
  from_artist_id UUID NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  to_artist_id UUID NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('alias','member_of','collaborated_with','produced_for')),
  provenance TEXT NOT NULL DEFAULT 'human_curator',
  PRIMARY KEY (from_artist_id, to_artist_id, type)
);

CREATE TABLE IF NOT EXISTS music_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL CHECK (provider IN ('youtube','soundcloud','bandcamp','discogs','instagram','generic','demo')),
  external_id TEXT,
  canonical_url TEXT NOT NULL,
  target_type TEXT NOT NULL DEFAULT 'unresolved' CHECK (target_type IN ('recording','release','unresolved','mix')),
  target_id UUID,
  display_title TEXT,
  display_artist TEXT,
  thumbnail_url TEXT,
  embed_type TEXT NOT NULL DEFAULT 'none' CHECK (embed_type IN ('youtube','soundcloud','bandcamp','none')),
  embed_url TEXT,
  playability TEXT NOT NULL DEFAULT 'unknown' CHECK (playability IN ('embeddable','external_only','unavailable','unknown')),
  rights_status TEXT NOT NULL DEFAULT 'link_only',   -- link_only | provider_embed | demo_placeholder
  attribution TEXT,
  last_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS music_sources_provider_external_idx
  ON music_sources (provider, external_id) WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS music_sources_target_idx ON music_sources (target_type, target_id);

CREATE TABLE IF NOT EXISTS music_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_type TEXT NOT NULL CHECK (from_type IN ('recording','release','artist','label','tag')),
  from_id UUID NOT NULL,
  to_type TEXT NOT NULL CHECK (to_type IN ('recording','release','artist','label','tag')),
  to_id UUID NOT NULL,
  relation_type TEXT NOT NULL CHECK (relation_type IN (
    'same_label','same_artist','artist_alias','remixed_by','same_release','producer_overlap',
    'collaborated_with','same_era_scene','curated_together','tag_similarity','similar_sound_unverified')),
  weight NUMERIC(3,2) NOT NULL DEFAULT 0.5 CHECK (weight BETWEEN 0 AND 1),
  provenance TEXT NOT NULL CHECK (provenance IN ('verified_metadata','licensed_data','human_curator','inferred')),
  provenance_ref TEXT,
  confidence NUMERIC(3,2) NOT NULL DEFAULT 0.5 CHECK (confidence BETWEEN 0 AND 1),
  explanation_template TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS music_edges_from_idx ON music_edges (from_type, from_id, relation_type);
CREATE INDEX IF NOT EXISTS music_edges_to_idx ON music_edges (to_type, to_id, relation_type);

CREATE TABLE IF NOT EXISTS curation_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  curator TEXT NOT NULL DEFAULT 'DIG editors',
  is_seed_route BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS curation_items (
  set_id UUID NOT NULL REFERENCES curation_sets(id) ON DELETE CASCADE,
  recording_id UUID REFERENCES recordings(id) ON DELETE CASCADE,
  music_source_id UUID REFERENCES music_sources(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  curator_note TEXT,
  PRIMARY KEY (set_id, position),
  CHECK (recording_id IS NOT NULL OR music_source_id IS NOT NULL)
);

-- ─── Principals (guests and signed-in users share one identity row) ────────

CREATE TABLE IF NOT EXISTS principals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL CHECK (kind IN ('guest','user')),
  guest_token_hash TEXT UNIQUE,
  auth_user_id UUID UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS profiles (
  principal_id UUID PRIMARY KEY REFERENCES principals(id) ON DELETE CASCADE,
  handle TEXT,
  home_region TEXT,
  personalization_opt_in BOOLEAN NOT NULL DEFAULT false,
  personalization_strength TEXT NOT NULL DEFAULT 'light' CHECK (personalization_strength IN ('off','light','moderate')),
  onboarding_complete BOOLEAN NOT NULL DEFAULT false,
  reduced_motion BOOLEAN NOT NULL DEFAULT false,
  high_contrast BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS taste_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  principal_id UUID NOT NULL REFERENCES principals(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('recording','artist','label','tag')),
  entity_id UUID NOT NULL,
  signal_type TEXT NOT NULL CHECK (signal_type IN ('love','keep','user_label')),
  strength NUMERIC(4,3) NOT NULL CHECK (strength BETWEEN -1 AND 1),
  provenance_event_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS taste_signals_principal_idx ON taste_signals (principal_id, created_at DESC);

-- ─── Dig sessions ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dig_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  principal_id UUID NOT NULL REFERENCES principals(id) ON DELETE CASCADE,
  seed_type TEXT NOT NULL CHECK (seed_type IN ('recording','url','scene','fork')),
  seed_id UUID,
  seed_url TEXT,
  title TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('feeling','connections','era_scene','unexpected')),
  discovery_distance TEXT NOT NULL CHECK (discovery_distance IN ('focused','explore','wild')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived','deleted')),
  current_node_id UUID,
  forked_from_session_id UUID REFERENCES dig_sessions(id) ON DELETE SET NULL,
  forked_from_node_id UUID,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dig_sessions_principal_idx ON dig_sessions (principal_id, last_activity_at DESC);

CREATE TABLE IF NOT EXISTS trail_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES dig_sessions(id) ON DELETE CASCADE,
  parent_node_id UUID REFERENCES trail_nodes(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('recording','source')),
  entity_id UUID,
  music_source_id UUID REFERENCES music_sources(id) ON DELETE SET NULL,
  depth INTEGER NOT NULL DEFAULT 0,
  via_edge_id UUID,
  explanation JSONB,
  branch_mode TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  outcome TEXT NOT NULL DEFAULT 'viewed' CHECK (outcome IN ('viewed','passed','kept','loved','wrong_direction','forked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS trail_nodes_session_idx ON trail_nodes (session_id, parent_node_id);

CREATE TABLE IF NOT EXISTS session_filters (
  session_id UUID PRIMARY KEY REFERENCES dig_sessions(id) ON DELETE CASCADE,
  rejected_edge_types JSONB NOT NULL DEFAULT '{}'::jsonb,
  rejected_tags JSONB NOT NULL DEFAULT '{}'::jsonb,
  accepted_tags JSONB NOT NULL DEFAULT '{}'::jsonb,
  candidate_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  seed_anchor UUID,
  last_good_node_id UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS discovery_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  principal_id UUID REFERENCES principals(id) ON DELETE CASCADE,
  session_id UUID REFERENCES dig_sessions(id) ON DELETE CASCADE,
  trail_node_id UUID,
  candidate_id TEXT,
  event_type TEXT NOT NULL,
  reason_code TEXT,
  idempotency_key TEXT,
  event_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS discovery_events_idem_idx
  ON discovery_events (session_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS discovery_events_session_idx ON discovery_events (session_id, created_at);

-- ─── Crates ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS crates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  principal_id UUID NOT NULL REFERENCES principals(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  is_system BOOLEAN NOT NULL DEFAULT false,
  system_key TEXT CHECK (system_key IS NULL OR system_key IN ('all_finds')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS crates_system_idx ON crates (principal_id, system_key) WHERE system_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS crate_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crate_id UUID NOT NULL REFERENCES crates(id) ON DELETE CASCADE,
  recording_id UUID REFERENCES recordings(id) ON DELETE SET NULL,
  release_id UUID REFERENCES releases(id) ON DELETE SET NULL,
  music_source_id UUID REFERENCES music_sources(id) ON DELETE SET NULL,
  imported_url TEXT,
  notes TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'saved' CHECK (status IN ('saved','loved','to_investigate','want_vinyl','heard','own','buy_later')),
  loved BOOLEAN NOT NULL DEFAULT false,
  saved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (recording_id IS NOT NULL OR release_id IS NOT NULL OR music_source_id IS NOT NULL OR imported_url IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS crate_items_recording_idx ON crate_items (crate_id, recording_id) WHERE recording_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS crate_items_source_idx ON crate_items (crate_id, music_source_id) WHERE recording_id IS NULL AND music_source_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS crate_items_crate_idx ON crate_items (crate_id, saved_at DESC);

-- ─── Imports ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  principal_id UUID REFERENCES principals(id) ON DELETE CASCADE,
  original_url TEXT NOT NULL,
  normalized_url TEXT NOT NULL,
  provider TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('identified','needs_confirmation','unresolved','unsupported','failed_retryable')),
  kind TEXT NOT NULL DEFAULT 'unresolved' CHECK (kind IN ('recording','release','mix','unresolved')),
  extracted_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  match_candidates JSONB NOT NULL DEFAULT '[]'::jsonb,
  resolved_entity_id UUID,
  music_source_id UUID REFERENCES music_sources(id) ON DELETE SET NULL,
  confidence NUMERIC(3,2),
  error_code TEXT,
  user_title TEXT,
  user_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS imports_principal_idx ON imports (principal_id, created_at DESC);

-- ─── Phase 3: shops (architected now, feature-flagged, no routes in Phase 1) ─

CREATE TABLE IF NOT EXISTS shops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_principal_id UUID NOT NULL REFERENCES principals(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  location_text TEXT,
  public_url TEXT,
  logo_url TEXT,
  is_published BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS shop_members (
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  principal_id UUID NOT NULL REFERENCES principals(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner','staff')),
  PRIMARY KEY (shop_id, principal_id)
);
CREATE TABLE IF NOT EXISTS shop_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('csv','shopify')),
  encrypted_credentials_ref TEXT,
  sync_cursor TEXT,
  status TEXT NOT NULL DEFAULT 'disconnected',
  last_synced_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS shop_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  external_inventory_id TEXT,
  release_id UUID REFERENCES releases(id) ON DELETE SET NULL,
  recording_id UUID REFERENCES recordings(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  catalogue_number TEXT,
  grading TEXT,
  price_minor INTEGER CHECK (price_minor IS NULL OR price_minor >= 0),
  currency CHAR(3),
  quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  availability TEXT NOT NULL DEFAULT 'unknown',
  original_checkout_url TEXT,
  source_of_truth TEXT NOT NULL DEFAULT 'shop',
  last_synced_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (shop_id, external_inventory_id)
);
CREATE TABLE IF NOT EXISTS shop_crates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_published BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (shop_id, slug)
);
CREATE TABLE IF NOT EXISTS shop_crate_items (
  shop_crate_id UUID NOT NULL REFERENCES shop_crates(id) ON DELETE CASCADE,
  shop_listing_id UUID NOT NULL REFERENCES shop_listings(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  PRIMARY KEY (shop_crate_id, shop_listing_id)
);
CREATE TABLE IF NOT EXISTS shop_outbound_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  listing_id UUID REFERENCES shop_listings(id) ON DELETE SET NULL,
  principal_id UUID,
  session_id UUID,
  event_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS shop_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  actor_id UUID,
  action TEXT NOT NULL,
  changed_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
