-- Phase 1 (Navigation Performance Audit 2026): index the hot manufacturing
-- filter columns that previously forced sequential scans under concurrent load.
--
-- Non-CONCURRENTLY: the Supabase CLI runs each migration inside a single
-- transaction pipeline, which rejects CREATE INDEX CONCURRENTLY. These tables
-- are small (one row per window / per scheduled task), so the brief
-- AccessExclusiveLock during the build is acceptable.
--
-- Already covered elsewhere (intentionally NOT re-added here):
--   * window_manufacturing_schedule(scheduled_cut_date / _assembly_date / _qc_date)
--     and (unit_id) -> 20260410110000_manufacturing_scheduler.sql
--   * window_production_status(window_id) -> UNIQUE(window_id) in
--     20260406000000_manufacturer_production.sql
--   * scheduler_unit_assignments(unit_id) -> UNIQUE(unit_id) in
--     20260402000000_scheduler_unit_assignments.sql

-- Reflow + manufacturing-risk recompute filter window_production_status by
-- unit_id, then narrow by status in memory. A composite (unit_id, status)
-- index serves both the per-unit lookup and the status narrowing.
CREATE INDEX IF NOT EXISTS idx_window_production_status_unit_status
  ON public.window_production_status (unit_id, status);

-- Manufacturer / QC portals scan window_production_status globally by status.
CREATE INDEX IF NOT EXISTS idx_window_production_status_status
  ON public.window_production_status (status);

-- schedule_entries is filtered by status in the scheduler/installer views; it
-- only had indexes on unit_id, task_date, and owner_user_id.
CREATE INDEX IF NOT EXISTS idx_schedule_entries_status
  ON public.schedule_entries (status);
