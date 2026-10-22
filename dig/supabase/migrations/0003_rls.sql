-- Row Level Security for private user state.
--
-- The app server connects with a privileged role and scopes every query by
-- principal in code (see src/lib/db/repo.ts); these policies additionally
-- protect the data when Supabase clients (PostgREST) reach the tables
-- directly. Outside Supabase, auth.uid() does not exist, so a stub returning
-- NULL is created: every private row is then invisible to non-owner roles.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'auth') THEN
    CREATE SCHEMA auth;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'auth' AND p.proname = 'uid'
  ) THEN
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS 'SELECT NULL::uuid';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION dig_current_principal_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT id FROM principals WHERE auth_user_id = auth.uid() LIMIT 1
$$;

-- Public catalogue stays readable by everyone.
ALTER TABLE principals ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE taste_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE dig_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE trail_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_filters ENABLE ROW LEVEL SECURITY;
ALTER TABLE discovery_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE crates ENABLE ROW LEVEL SECURITY;
ALTER TABLE crate_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE shops ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_crates ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_crate_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS principals_self ON principals;
CREATE POLICY principals_self ON principals FOR ALL
  USING (id = dig_current_principal_id()) WITH CHECK (id = dig_current_principal_id());

DROP POLICY IF EXISTS profiles_own ON profiles;
CREATE POLICY profiles_own ON profiles FOR ALL
  USING (principal_id = dig_current_principal_id()) WITH CHECK (principal_id = dig_current_principal_id());

DROP POLICY IF EXISTS taste_own ON taste_signals;
CREATE POLICY taste_own ON taste_signals FOR ALL
  USING (principal_id = dig_current_principal_id()) WITH CHECK (principal_id = dig_current_principal_id());

DROP POLICY IF EXISTS sessions_own ON dig_sessions;
CREATE POLICY sessions_own ON dig_sessions FOR ALL
  USING (principal_id = dig_current_principal_id()) WITH CHECK (principal_id = dig_current_principal_id());

DROP POLICY IF EXISTS trail_own ON trail_nodes;
CREATE POLICY trail_own ON trail_nodes FOR ALL
  USING (session_id IN (SELECT id FROM dig_sessions WHERE principal_id = dig_current_principal_id()));

DROP POLICY IF EXISTS filters_own ON session_filters;
CREATE POLICY filters_own ON session_filters FOR ALL
  USING (session_id IN (SELECT id FROM dig_sessions WHERE principal_id = dig_current_principal_id()));

DROP POLICY IF EXISTS events_own ON discovery_events;
CREATE POLICY events_own ON discovery_events FOR ALL
  USING (principal_id = dig_current_principal_id()) WITH CHECK (principal_id = dig_current_principal_id());

DROP POLICY IF EXISTS crates_own ON crates;
CREATE POLICY crates_own ON crates FOR ALL
  USING (principal_id = dig_current_principal_id()) WITH CHECK (principal_id = dig_current_principal_id());

DROP POLICY IF EXISTS crate_items_own ON crate_items;
CREATE POLICY crate_items_own ON crate_items FOR ALL
  USING (crate_id IN (SELECT id FROM crates WHERE principal_id = dig_current_principal_id()));

DROP POLICY IF EXISTS imports_own ON imports;
CREATE POLICY imports_own ON imports FOR ALL
  USING (principal_id = dig_current_principal_id()) WITH CHECK (principal_id = dig_current_principal_id());

-- Shops: published shops and their published crates are public; staff edit their own shop.
DROP POLICY IF EXISTS shops_public_read ON shops;
CREATE POLICY shops_public_read ON shops FOR SELECT USING (is_published OR owner_principal_id = dig_current_principal_id());
DROP POLICY IF EXISTS shops_staff_write ON shops;
CREATE POLICY shops_staff_write ON shops FOR ALL
  USING (id IN (SELECT shop_id FROM shop_members WHERE principal_id = dig_current_principal_id()));
DROP POLICY IF EXISTS shop_members_self ON shop_members;
CREATE POLICY shop_members_self ON shop_members FOR SELECT USING (principal_id = dig_current_principal_id());
DROP POLICY IF EXISTS shop_integrations_staff ON shop_integrations;
CREATE POLICY shop_integrations_staff ON shop_integrations FOR ALL
  USING (shop_id IN (SELECT shop_id FROM shop_members WHERE principal_id = dig_current_principal_id()));
DROP POLICY IF EXISTS shop_listings_read ON shop_listings;
CREATE POLICY shop_listings_read ON shop_listings FOR SELECT
  USING (shop_id IN (SELECT id FROM shops WHERE is_published)
      OR shop_id IN (SELECT shop_id FROM shop_members WHERE principal_id = dig_current_principal_id()));
DROP POLICY IF EXISTS shop_listings_staff ON shop_listings;
CREATE POLICY shop_listings_staff ON shop_listings FOR ALL
  USING (shop_id IN (SELECT shop_id FROM shop_members WHERE principal_id = dig_current_principal_id()));
DROP POLICY IF EXISTS shop_crates_read ON shop_crates;
CREATE POLICY shop_crates_read ON shop_crates FOR SELECT
  USING ((is_published AND shop_id IN (SELECT id FROM shops WHERE is_published))
      OR shop_id IN (SELECT shop_id FROM shop_members WHERE principal_id = dig_current_principal_id()));
DROP POLICY IF EXISTS shop_crates_staff ON shop_crates;
CREATE POLICY shop_crates_staff ON shop_crates FOR ALL
  USING (shop_id IN (SELECT shop_id FROM shop_members WHERE principal_id = dig_current_principal_id()));
DROP POLICY IF EXISTS shop_crate_items_read ON shop_crate_items;
CREATE POLICY shop_crate_items_read ON shop_crate_items FOR SELECT
  USING (shop_crate_id IN (SELECT id FROM shop_crates WHERE is_published));
