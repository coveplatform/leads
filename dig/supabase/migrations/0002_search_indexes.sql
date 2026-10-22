-- Trigram indexes when pg_trgm is available (Supabase: yes; PGlite: loaded
-- by the app). Plain btree fallbacks keep ILIKE search working either way.
DO $$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_trgm;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pg_trgm unavailable; skipping trigram indexes';
  END;
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
    CREATE INDEX IF NOT EXISTS recordings_title_trgm ON recordings USING gin (canonical_title gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS artists_name_trgm ON artists USING gin (name gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS releases_title_trgm ON releases USING gin (title gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS labels_name_trgm ON labels USING gin (name gin_trgm_ops);
  END IF;
END $$;
