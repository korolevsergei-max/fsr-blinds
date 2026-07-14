-- Phase 2 rollback — restores the pre-Phase-2 AUTHENTICATED visibility if the
-- scoped policies lock out a legitimate user. Run via the Supabase SQL editor /
-- Management API as postgres. It does NOT re-open anon access (Phase 1 stays)
-- and keeps the anon grant revocations from Phase 2 Part 4.
--
-- After running: NOTIFY pgrst, 'reload schema';

-- ── 1. Drop the Phase 2 scoped policies ─────────────────────────────────────
DROP POLICY IF EXISTS clients_select_scoped ON clients;
DROP POLICY IF EXISTS clients_insert_owner ON clients;
DROP POLICY IF EXISTS clients_update_owner ON clients;
DROP POLICY IF EXISTS clients_delete_owner ON clients;
DROP POLICY IF EXISTS buildings_select_scoped ON buildings;
DROP POLICY IF EXISTS buildings_insert_owner ON buildings;
DROP POLICY IF EXISTS buildings_update_owner ON buildings;
DROP POLICY IF EXISTS buildings_delete_owner ON buildings;
DROP POLICY IF EXISTS units_select_scoped ON units;
DROP POLICY IF EXISTS units_insert_owner ON units;
DROP POLICY IF EXISTS units_update_scoped ON units;
DROP POLICY IF EXISTS units_delete_owner ON units;
DROP POLICY IF EXISTS rooms_select_scoped ON rooms;
DROP POLICY IF EXISTS rooms_insert_scoped ON rooms;
DROP POLICY IF EXISTS rooms_update_scoped ON rooms;
DROP POLICY IF EXISTS rooms_delete_scoped ON rooms;
DROP POLICY IF EXISTS windows_select_scoped ON windows;
DROP POLICY IF EXISTS windows_insert_scoped ON windows;
DROP POLICY IF EXISTS windows_update_scoped ON windows;
DROP POLICY IF EXISTS windows_delete_scoped ON windows;
DROP POLICY IF EXISTS schedule_select_scoped ON schedule_entries;
DROP POLICY IF EXISTS schedule_insert_scoped ON schedule_entries;
DROP POLICY IF EXISTS schedule_update_scoped ON schedule_entries;
DROP POLICY IF EXISTS schedule_delete_scoped ON schedule_entries;
DROP POLICY IF EXISTS media_select_scoped ON media_uploads;
DROP POLICY IF EXISTS media_insert_scoped ON media_uploads;
DROP POLICY IF EXISTS media_delete_scoped ON media_uploads;
DROP POLICY IF EXISTS notifications_select_scoped ON notifications;
DROP POLICY IF EXISTS notifications_delete_owner ON notifications;
DROP POLICY IF EXISTS notification_reads_select_own ON notification_reads;
DROP POLICY IF EXISTS notification_reads_insert_own ON notification_reads;
DROP POLICY IF EXISTS notification_reads_update_own ON notification_reads;
DROP POLICY IF EXISTS notification_reads_delete_owner ON notification_reads;
DROP POLICY IF EXISTS unit_activity_log_select_scoped ON unit_activity_log;
DROP POLICY IF EXISTS unit_activity_log_insert_scoped ON unit_activity_log;
DROP POLICY IF EXISTS installers_select_scoped ON installers;
DROP POLICY IF EXISTS installers_write_owner ON installers;
DROP POLICY IF EXISTS installers_update_owner ON installers;
DROP POLICY IF EXISTS installers_delete_owner ON installers;
DROP POLICY IF EXISTS schedulers_select_scoped ON schedulers;
DROP POLICY IF EXISTS schedulers_insert_owner ON schedulers;
DROP POLICY IF EXISTS schedulers_update_owner ON schedulers;
DROP POLICY IF EXISTS schedulers_delete_owner ON schedulers;
DROP POLICY IF EXISTS cutters_select_scoped ON cutters;
DROP POLICY IF EXISTS cutters_insert_owner ON cutters;
DROP POLICY IF EXISTS cutters_update_owner ON cutters;
DROP POLICY IF EXISTS cutters_delete_owner ON cutters;
DROP POLICY IF EXISTS assemblers_select_scoped ON assemblers;
DROP POLICY IF EXISTS assemblers_insert_owner ON assemblers;
DROP POLICY IF EXISTS assemblers_update_owner ON assemblers;
DROP POLICY IF EXISTS assemblers_delete_owner ON assemblers;
DROP POLICY IF EXISTS qcs_select_scoped ON qcs;
DROP POLICY IF EXISTS qcs_insert_owner ON qcs;
DROP POLICY IF EXISTS qcs_update_owner ON qcs;
DROP POLICY IF EXISTS qcs_delete_owner ON qcs;
DROP POLICY IF EXISTS sua_select_scoped ON scheduler_unit_assignments;
DROP POLICY IF EXISTS sua_insert_scoped ON scheduler_unit_assignments;
DROP POLICY IF EXISTS sua_update_scoped ON scheduler_unit_assignments;
DROP POLICY IF EXISTS sua_delete_scoped ON scheduler_unit_assignments;
DROP POLICY IF EXISTS sba_select_scoped ON scheduler_building_access;
DROP POLICY IF EXISTS sba_insert_owner ON scheduler_building_access;
DROP POLICY IF EXISTS sba_update_owner ON scheduler_building_access;
DROP POLICY IF EXISTS sba_delete_owner ON scheduler_building_access;
DROP POLICY IF EXISTS mfg_settings_select_staff ON manufacturing_settings;
DROP POLICY IF EXISTS mfg_settings_insert_owner ON manufacturing_settings;
DROP POLICY IF EXISTS mfg_settings_update_owner ON manufacturing_settings;
DROP POLICY IF EXISTS mfg_settings_delete_owner ON manufacturing_settings;
DROP POLICY IF EXISTS mfg_calendar_select_staff ON manufacturing_calendar_overrides;
DROP POLICY IF EXISTS mfg_calendar_insert_mfg ON manufacturing_calendar_overrides;
DROP POLICY IF EXISTS mfg_calendar_update_mfg ON manufacturing_calendar_overrides;
DROP POLICY IF EXISTS mfg_calendar_delete_mfg ON manufacturing_calendar_overrides;
DROP POLICY IF EXISTS wps_select_scoped ON window_production_status;
DROP POLICY IF EXISTS wps_insert_mfg ON window_production_status;
DROP POLICY IF EXISTS wps_update_mfg ON window_production_status;
DROP POLICY IF EXISTS wps_delete_owner ON window_production_status;
DROP POLICY IF EXISTS wms_select_staff ON window_manufacturing_schedule;
DROP POLICY IF EXISTS wms_insert_mfg ON window_manufacturing_schedule;
DROP POLICY IF EXISTS wms_update_mfg ON window_manufacturing_schedule;
DROP POLICY IF EXISTS wms_delete_mfg ON window_manufacturing_schedule;
DROP POLICY IF EXISTS wme_select_scoped ON window_manufacturing_escalations;
DROP POLICY IF EXISTS wme_insert_mfg ON window_manufacturing_escalations;
DROP POLICY IF EXISTS wme_update_mfg ON window_manufacturing_escalations;
DROP POLICY IF EXISTS wme_delete_owner ON window_manufacturing_escalations;
DROP POLICY IF EXISTS wpii_select_scoped ON window_post_install_issues;
DROP POLICY IF EXISTS wpii_insert_scoped ON window_post_install_issues;
DROP POLICY IF EXISTS wpii_update_scoped ON window_post_install_issues;
DROP POLICY IF EXISTS wpii_delete_owner ON window_post_install_issues;
DROP POLICY IF EXISTS wpiin_select_scoped ON window_post_install_issue_notes;
DROP POLICY IF EXISTS wpiin_insert_scoped ON window_post_install_issue_notes;
DROP POLICY IF EXISTS wpiin_delete_owner ON window_post_install_issue_notes;
DROP POLICY IF EXISTS dps_select_owner ON daily_progress_snapshots;

-- ── units ownership-column immutability trigger ─────────────────────────────
DROP TRIGGER IF EXISTS units_guard_ownership_columns ON units;
DROP FUNCTION IF EXISTS public.units_guard_ownership_columns();

-- ── 2. Recreate the pre-Phase-2 blanket authenticated policies ──────────────
CREATE POLICY "authenticated_all_clients" ON clients FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all_buildings" ON buildings FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all_units" ON units FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all_rooms" ON rooms FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all_windows" ON windows FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all_schedule" ON schedule_entries FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all_media" ON media_uploads FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_insert_notifications" ON notifications FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated_read_own_notifications" ON notifications FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read_own_notification_reads" ON notification_reads FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all_unit_activity_log" ON unit_activity_log FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all_installers" ON installers FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all_schedulers" ON schedulers FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all_cutters" ON cutters FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all_assemblers" ON assemblers FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all_qcs" ON qcs FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_manage_scheduler_unit_assignments" ON scheduler_unit_assignments FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_manage_scheduler_building_access" ON scheduler_building_access FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all_manufacturing_settings" ON manufacturing_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all_manufacturing_calendar_overrides" ON manufacturing_calendar_overrides FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all_window_production_status" ON window_production_status FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all_window_manufacturing_schedule" ON window_manufacturing_schedule FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all_window_manufacturing_escalations" ON window_manufacturing_escalations FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all_window_post_install_issues" ON window_post_install_issues FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all_window_post_install_issue_notes" ON window_post_install_issue_notes FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all_daily_progress_snapshots" ON daily_progress_snapshots FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── 3. Remove the RPC caller gates ──────────────────────────────────────────
-- Re-apply the ungated bodies from the source migrations:
--   get_full_dataset            -> supabase/migrations/20260408110000_get_full_dataset_rpc.sql
--   get_owner_dataset           -> supabase/migrations/20260628150000_fold_enrichment_into_dataset_rpcs.sql
--   get_scheduler_dataset       -> supabase/migrations/20260628150000_fold_enrichment_into_dataset_rpcs.sql
--   get_installer_dataset       -> supabase/migrations/20260628120000_scheduler_installer_dataset_scoping.sql
--   get_owner_dashboard_counts  -> supabase/migrations/20260627163000_owner_dataset_scoping.sql
-- Do NOT re-grant EXECUTE to anon/PUBLIC — that grant was the C2 zero-credential
-- leak. `GRANT EXECUTE ... TO authenticated, service_role` is sufficient.
