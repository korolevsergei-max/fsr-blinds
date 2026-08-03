-- C1 follow-up: make the archive safe against unit re-entry.
--
-- 20260720140000 archives a unit's schedule rows once units.status='installed'.
-- But units.status is DERIVED (deriveUnitStatusFromCounts → recomputeUnitStatus):
-- adding a window to an already-installed unit drops it back into
-- ('measured','bracketed','manufactured'), which triggers
-- reflowManufacturingSchedules. Reflow reads ONLY the active table
-- (manufacturing-scheduler.ts), finds nothing for that unit, and mints fresh
-- mfg-<uuid> rows. Two defects follow:
--
--   1. Duplicate reads. Any p_include_archived=true read (completed screens,
--      management schedule) then returns TWO rows per window_id — duplicated
--      cards and doubled completed counts. The archive table is created with
--      (LIKE ... INCLUDING DEFAULTS), which does NOT copy the UNIQUE(window_id)
--      the upsert relies on, so nothing catches it.
--   2. Lost scheduler intent. is_schedule_locked / lock_reason /
--      manual_priority / moved_at silently reset to defaults on the new row —
--      a scheduler's manual lock is destroyed.
--
-- Fix (1) on the read side: the active table always wins over the archive.
-- Fix (2) on the write side: restore_schedules_from_archive() pulls a unit's
-- rows back before reflow rewrites them, so locks/priorities survive re-entry.
--
-- Both are no-ops while the archive is empty, so this is safe to apply before
-- the operator ever runs move_completed_schedules_to_archive().

-- ── Restore: archive → active, for units re-entering the manufacturing zone ──
CREATE OR REPLACE FUNCTION public.restore_schedules_from_archive(p_unit_ids text[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  restored integer;
BEGIN
  IF p_unit_ids IS NULL OR array_length(p_unit_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  WITH candidates AS (
    SELECT a.*
    FROM window_manufacturing_schedule_archive a
    WHERE a.unit_id = ANY(p_unit_ids)
      -- Never resurrect a row the active table already owns.
      AND NOT EXISTS (
        SELECT 1 FROM window_manufacturing_schedule s
        WHERE s.window_id = a.window_id
      )
  ),
  moved_rows AS (
    DELETE FROM window_manufacturing_schedule_archive a
    USING candidates c
    WHERE a.id = c.id
    RETURNING a.*
  )
  INSERT INTO window_manufacturing_schedule (
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

  GET DIAGNOSTICS restored = ROW_COUNT;
  RETURN restored;
END;
$$;

-- service_role only, matching move_completed_schedules_to_archive's grant:
-- the restore runs inside reflowManufacturingSchedules on the admin client.
REVOKE EXECUTE ON FUNCTION public.restore_schedules_from_archive(text[])
  FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.restore_schedules_from_archive(text[])
  TO service_role;

-- ── get_role_schedule: active wins over archive on window_id ────────────────
-- Identical to 20260720140000 except the archive leg of `src`, which now skips
-- any window_id the active table already has.
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
      a.id, a.window_id, a.unit_id, a.target_ready_date, a.scheduled_cut_date,
      a.scheduled_assembly_date, a.scheduled_qc_date, a.manual_priority,
      a.is_schedule_locked, a.lock_reason, a.last_reschedule_reason,
      a.over_capacity_override, a.moved_by_user_id, a.moved_at
    FROM window_manufacturing_schedule_archive a
    WHERE p_include_archived
      AND NOT EXISTS (
        SELECT 1 FROM window_manufacturing_schedule s
        WHERE s.window_id = a.window_id
      )
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

-- Guard against the duplicate class ever recurring in the archive itself.
CREATE UNIQUE INDEX IF NOT EXISTS window_manufacturing_schedule_archive_window_id_key
  ON public.window_manufacturing_schedule_archive (window_id);
