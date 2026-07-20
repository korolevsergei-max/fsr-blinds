-- Phase C1 (roadmap Phase 4): archive completed manufacturing schedule rows so
-- the active reads become O(active work) instead of O(all-time history).
--
-- window_manufacturing_schedule is never pruned: every read is O(all-time),
-- 2,000+ rows growing ~+41/day. Completed views legitimately need history;
-- active views (the factory queues/dashboards/production) do not.
--
-- Predicate: a unit's schedule rows are safe to archive once units.status =
-- 'installed'. reflowManufacturingSchedules only ever considers units in
-- ('measured','bracketed','manufactured') (manufacturing-scheduler.ts), so an
-- installed unit's rows are inert — reflow never reads or rewrites them, and no
-- factory queue/dashboard/production screen surfaces them (they filter to
-- pending/cut/assembled or productionEnteredAt + still-cutting). Only the
-- completed views and the management-schedule completed count read them.
--
-- SAFETY: this migration creates the archive table + move function + extends
-- get_role_schedule with an optional archive union, but does NOT run the
-- backfill move. On deploy the archive is empty, so active∪archive == active ==
-- today's full table: every read is byte-identical until an operator explicitly
-- runs SELECT move_completed_schedules_to_archive(). ARCHIVE, never DELETE —
-- rollback re-inserts from the archive (non-destructive by design).

-- ── Archive table (same columns as the source + archived_at) ────────────────
CREATE TABLE IF NOT EXISTS public.window_manufacturing_schedule_archive (
  LIKE public.window_manufacturing_schedule INCLUDING DEFAULTS
);

ALTER TABLE public.window_manufacturing_schedule_archive
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'window_manufacturing_schedule_archive_pkey'
  ) THEN
    ALTER TABLE public.window_manufacturing_schedule_archive
      ADD CONSTRAINT window_manufacturing_schedule_archive_pkey PRIMARY KEY (id);
  END IF;
END $$;

ALTER TABLE public.window_manufacturing_schedule_archive ENABLE ROW LEVEL SECURITY;

-- Mirror the source table's Phase 2 read scope (wms_select_staff): staff roles
-- read archived rows through the completed views. No authenticated write
-- policies at all — archive rows are inert; the only writer is the SECURITY
-- DEFINER move function below (table owner bypasses RLS), and rollback
-- re-inserts run as service_role.
DROP POLICY IF EXISTS "authenticated_all_window_manufacturing_schedule_archive"
  ON public.window_manufacturing_schedule_archive;
DROP POLICY IF EXISTS wms_archive_select_staff
  ON public.window_manufacturing_schedule_archive;
CREATE POLICY wms_archive_select_staff
  ON public.window_manufacturing_schedule_archive
  FOR SELECT TO authenticated
  USING (
    (SELECT public.get_user_role()) IN ('owner', 'installer', 'scheduler', 'cutter', 'assembler', 'qc')
  );

CREATE INDEX IF NOT EXISTS idx_wms_archive_unit_id
  ON public.window_manufacturing_schedule_archive (unit_id);
CREATE INDEX IF NOT EXISTS idx_wms_archive_window_id
  ON public.window_manufacturing_schedule_archive (window_id);

-- ── Move function: active → archive for fully-installed units ───────────────
-- Idempotent (re-running moves only newly-installed units). Returns the count
-- moved. Call from a daily cron and/or on the completion mutation, in after().
CREATE OR REPLACE FUNCTION public.move_completed_schedules_to_archive()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  moved integer;
BEGIN
  WITH completed AS (
    SELECT s.id
    FROM window_manufacturing_schedule s
    JOIN units u ON u.id = s.unit_id
    WHERE u.status = 'installed'
  ),
  moved_rows AS (
    DELETE FROM window_manufacturing_schedule s
    USING completed c
    WHERE s.id = c.id
    RETURNING s.*
  )
  INSERT INTO window_manufacturing_schedule_archive (
    id, window_id, unit_id, target_ready_date, scheduled_cut_date,
    scheduled_assembly_date, scheduled_qc_date, manual_priority,
    is_schedule_locked, lock_reason, last_reschedule_reason,
    over_capacity_override, moved_by_user_id, moved_at, created_at, updated_at
  )
  SELECT
    id, window_id, unit_id, target_ready_date, scheduled_cut_date,
    scheduled_assembly_date, scheduled_qc_date, manual_priority,
    is_schedule_locked, lock_reason, last_reschedule_reason,
    over_capacity_override, moved_by_user_id, moved_at, created_at, updated_at
  FROM moved_rows;

  GET DIAGNOSTICS moved = ROW_COUNT;
  RETURN moved;
END;
$$;

-- service_role only: the app never invokes the move as a signed-in user — it
-- runs from the runbook's manual activation step, a SQL cron, or an admin-client
-- after() hook. Granting it to authenticated would let any logged-in role
-- trigger the archive move.
REVOKE EXECUTE ON FUNCTION public.move_completed_schedules_to_archive()
  FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.move_completed_schedules_to_archive()
  TO service_role;

-- ── get_role_schedule: add optional archive union ───────────────────────────
-- Default (p_include_archived = false) reads the active table only — the
-- factory queue/dashboard/production win. The completed views + management
-- schedule pass true to read active∪archive (identical to today while the
-- archive is empty; correct once the move runs). Replaces the (text) signature
-- from 20260720130000 with a (text, boolean default false) overload; the 1-arg
-- named call resolves via the default.
DROP FUNCTION IF EXISTS public.get_role_schedule(text);

CREATE OR REPLACE FUNCTION public.get_role_schedule(
  p_date_column text,
  p_include_archived boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF p_date_column NOT IN (
    'scheduled_cut_date', 'scheduled_assembly_date', 'scheduled_qc_date'
  ) THEN
    RAISE EXCEPTION 'get_role_schedule: invalid date column %', p_date_column;
  END IF;

  WITH src AS (
    SELECT
      id, window_id, unit_id, target_ready_date, scheduled_cut_date,
      scheduled_assembly_date, scheduled_qc_date, manual_priority,
      is_schedule_locked, lock_reason, last_reschedule_reason,
      over_capacity_override, moved_by_user_id, moved_at
    FROM window_manufacturing_schedule
    UNION ALL
    SELECT
      id, window_id, unit_id, target_ready_date, scheduled_cut_date,
      scheduled_assembly_date, scheduled_qc_date, manual_priority,
      is_schedule_locked, lock_reason, last_reschedule_reason,
      over_capacity_override, moved_by_user_id, moved_at
    FROM window_manufacturing_schedule_archive
    WHERE p_include_archived
  )
  SELECT jsonb_build_object(
    'schedule_rows', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', s.id,
          'window_id', s.window_id,
          'unit_id', s.unit_id,
          'target_ready_date', s.target_ready_date,
          'scheduled_cut_date', s.scheduled_cut_date,
          'scheduled_assembly_date', s.scheduled_assembly_date,
          'scheduled_qc_date', s.scheduled_qc_date,
          'manual_priority', s.manual_priority,
          'is_schedule_locked', s.is_schedule_locked,
          'lock_reason', s.lock_reason,
          'last_reschedule_reason', s.last_reschedule_reason,
          'over_capacity_override', s.over_capacity_override,
          'moved_by_user_id', s.moved_by_user_id,
          'moved_at', s.moved_at
        )
        ORDER BY (CASE p_date_column
          WHEN 'scheduled_cut_date' THEN s.scheduled_cut_date
          WHEN 'scheduled_assembly_date' THEN s.scheduled_assembly_date
          ELSE s.scheduled_qc_date
        END) ASC NULLS LAST
      )
      FROM src s
    ), '[]'::jsonb),

    'units', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', u.id,
        'building_id', u.building_id,
        'client_id', u.client_id,
        'unit_number', u.unit_number,
        'building_name', u.building_name,
        'client_name', u.client_name,
        'installation_date', u.installation_date,
        'complete_by_date', u.complete_by_date,
        'status', u.status,
        'all_measured_at', u.all_measured_at,
        'production_entered_at', u.production_entered_at
      ))
      FROM units u
      WHERE u.id IN (SELECT DISTINCT unit_id FROM src)
    ), '[]'::jsonb),

    'windows', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', w.id,
        'room_id', w.room_id,
        'label', w.label,
        'blind_type', w.blind_type,
        'width', w.width,
        'height', w.height,
        'depth', w.depth,
        'notes', w.notes,
        'window_installation', w.window_installation,
        'wand_chain', w.wand_chain,
        'fabric_adjustment_side', w.fabric_adjustment_side,
        'fabric_adjustment_inches', w.fabric_adjustment_inches,
        'chain_side', w.chain_side
      ))
      FROM windows w
      WHERE w.id IN (SELECT DISTINCT window_id FROM src)
    ), '[]'::jsonb),

    'production', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'window_id', p.window_id,
        'status', p.status,
        'issue_status', p.issue_status,
        'issue_reason', p.issue_reason,
        'issue_notes', p.issue_notes,
        'cut_at', p.cut_at,
        'assembled_at', p.assembled_at,
        'qc_approved_at', p.qc_approved_at,
        'manufacturing_label_printed_at', p.manufacturing_label_printed_at,
        'packaging_label_printed_at', p.packaging_label_printed_at,
        'cut_list_printed_at', p.cut_list_printed_at
      ))
      FROM window_production_status p
      WHERE p.window_id IN (SELECT DISTINCT window_id FROM src)
    ), '[]'::jsonb),

    'rooms', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name))
      FROM rooms r
      WHERE r.id IN (
        SELECT DISTINCT w.room_id
        FROM windows w
        WHERE w.id IN (SELECT DISTINCT window_id FROM src)
      )
    ), '[]'::jsonb),

    'escalations', COALESCE((
      SELECT jsonb_agg(row_to_json(e.*) ORDER BY e.opened_at DESC)
      FROM window_manufacturing_escalations e
      WHERE e.window_id IN (SELECT DISTINCT window_id FROM src)
    ), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_role_schedule(text, boolean) TO authenticated, service_role;
