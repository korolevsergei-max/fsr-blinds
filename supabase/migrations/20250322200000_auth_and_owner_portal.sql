-- Auth-linked user profiles
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'installer', 'manufacturer')),
  display_name TEXT NOT NULL,
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Helper to read current user role (SECURITY DEFINER bypasses RLS on user_profiles)
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM user_profiles WHERE id = auth.uid();
$$;

-- Auto-create profile when a new auth user is inserted.
-- If metadata includes a role (set by owner invite), use that.
-- Otherwise the very first user becomes owner; everyone else defaults to installer.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  owner_count INTEGER;
  user_role TEXT;
BEGIN
  user_role := NEW.raw_user_meta_data->>'role';
  IF user_role IS NULL OR user_role = '' THEN
    SELECT COUNT(*) INTO owner_count FROM user_profiles WHERE role = 'owner';
    IF owner_count = 0 THEN
      user_role := 'owner';
    ELSE
      user_role := 'installer';
    END IF;
  END IF;

  INSERT INTO user_profiles (id, role, display_name, email)
  VALUES (
    NEW.id,
    user_role,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.email, '')
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- user_profiles RLS
CREATE POLICY "users_read_own_profile" ON user_profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());

CREATE POLICY "owner_manage_all_profiles" ON user_profiles
  FOR ALL TO authenticated
  USING (public.get_user_role() = 'owner')
  WITH CHECK (public.get_user_role() = 'owner');

-- Manufacturers
CREATE TABLE IF NOT EXISTS manufacturers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  contact_name TEXT NOT NULL DEFAULT '',
  contact_email TEXT NOT NULL DEFAULT '',
  contact_phone TEXT NOT NULL DEFAULT '',
  auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE manufacturers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_manage_manufacturers" ON manufacturers
  FOR ALL TO authenticated
  USING (public.get_user_role() = 'owner')
  WITH CHECK (public.get_user_role() = 'owner');

CREATE POLICY "manufacturer_read_own" ON manufacturers
  FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid());

-- Link installers to auth users
ALTER TABLE installers ADD COLUMN IF NOT EXISTS auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL;

-- Unit scheduling constraint dates (earliest dates for bracketing / installation)
ALTER TABLE units ADD COLUMN IF NOT EXISTS earliest_bracketing_date TEXT;
ALTER TABLE units ADD COLUMN IF NOT EXISTS earliest_installation_date TEXT;

-- Authenticated-user policies for all existing tables
CREATE POLICY "authenticated_all_clients" ON clients FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all_buildings" ON buildings FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all_installers" ON installers FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all_units" ON units FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all_rooms" ON rooms FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all_windows" ON windows FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all_schedule" ON schedule_entries FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all_media" ON media_uploads FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all_notifications" ON notifications FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all_notification_reads" ON notification_reads FOR ALL TO authenticated USING (true) WITH CHECK (true);
