-- Allow logged-in users (role "authenticated") to read/write core app tables.
-- Without these policies, only "anon" had access from the initial seed; JWT-backed
-- requests use "authenticated" and would hit: new row violates row-level security policy.

DROP POLICY IF EXISTS "authenticated_all_clients" ON clients;
CREATE POLICY "authenticated_all_clients" ON clients
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_all_buildings" ON buildings;
CREATE POLICY "authenticated_all_buildings" ON buildings
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_all_installers" ON installers;
CREATE POLICY "authenticated_all_installers" ON installers
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_all_units" ON units;
CREATE POLICY "authenticated_all_units" ON units
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_all_rooms" ON rooms;
CREATE POLICY "authenticated_all_rooms" ON rooms
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_all_windows" ON windows;
CREATE POLICY "authenticated_all_windows" ON windows
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_all_schedule" ON schedule_entries;
CREATE POLICY "authenticated_all_schedule" ON schedule_entries
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
