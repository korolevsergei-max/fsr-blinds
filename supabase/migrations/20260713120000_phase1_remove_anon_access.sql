-- Phase 1 emergency lockdown (C1 + wider anon-policy sweep): remove every
-- remaining `dev_anon_all_*` / `TO anon` / `TO public` policy left over from
-- the initial dev schema. These predate the `authenticated_all_*` policies
-- added later and were never dropped, so anyone with only the public
-- Supabase anon key could read/write clients, buildings, installers, units,
-- rooms, windows, schedule_entries, media_uploads, notifications,
-- notification_reads, and unit_activity_log directly via PostgREST, and
-- write/delete any object in the fsr-media storage bucket.

-- 1. Core tables already have an `authenticated_all_*` policy in place
--    (20250324190000_authenticated_rls_core_tables.sql / 20250322200000).
--    Dropping the anon policy just removes the redundant unauthenticated path.
DROP POLICY IF EXISTS "dev_anon_all_clients" ON clients;
DROP POLICY IF EXISTS "dev_anon_all_buildings" ON buildings;
DROP POLICY IF EXISTS "dev_anon_all_installers" ON installers;
DROP POLICY IF EXISTS "dev_anon_all_units" ON units;
DROP POLICY IF EXISTS "dev_anon_all_rooms" ON rooms;
DROP POLICY IF EXISTS "dev_anon_all_windows" ON windows;
DROP POLICY IF EXISTS "dev_anon_all_schedule_entries" ON schedule_entries;
DROP POLICY IF EXISTS "dev_anon_all_media_uploads" ON media_uploads;
DROP POLICY IF EXISTS "dev_anon_all_notifications" ON notifications;
DROP POLICY IF EXISTS "dev_anon_all_notification_reads" ON notification_reads;

-- 2. unit_activity_log has NO authenticated policy today (only the anon one
--    being removed) but server actions insert/select it via the user-context
--    client (src/app/actions/management-actions.ts,
--    src/app/actions/post-install-issue-actions.ts, src/lib/unit-milestones.ts,
--    src/lib/unit-progress.ts, src/lib/server-data/notifications.ts). Add the
--    authenticated policy in the same migration as the anon drop so activity
--    logging doesn't break.
DROP POLICY IF EXISTS "dev_anon_all_unit_activity_log" ON unit_activity_log;
DROP POLICY IF EXISTS "authenticated_all_unit_activity_log" ON unit_activity_log;
CREATE POLICY "authenticated_all_unit_activity_log"
  ON unit_activity_log FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 3. Storage: fsr-media is a public bucket and images are rendered via public
--    URL by logged-out and logged-in users alike, so keep public SELECT. Only
--    remove the `TO public` INSERT/UPDATE/DELETE that let anyone write or
--    delete any object in the bucket.
DROP POLICY IF EXISTS "fsr_media_objects_all" ON storage.objects;

CREATE POLICY "fsr_media_objects_read"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'fsr-media');

CREATE POLICY "fsr_media_objects_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'fsr-media');

CREATE POLICY "fsr_media_objects_update"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'fsr-media')
WITH CHECK (bucket_id = 'fsr-media');

CREATE POLICY "fsr_media_objects_delete"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'fsr-media');
