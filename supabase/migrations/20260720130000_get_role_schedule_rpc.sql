-- Phase B2 (roadmap Phase 3): collapse the manufacturing queue read into ONE
-- DB round-trip.
--
-- Before this, loadPersistedRoleSchedule (src/lib/manufacturing-scheduler.ts)
-- (a) pages the entire window_manufacturing_schedule table, then (b) fans out
-- FIVE chunked query families over ~2,000 window ids (units, windows,
-- window_production_status, open escalations, escalation history — note the
-- last two scan the same 10-row table twice) at concurrency 4, then (c) a rooms
-- wave. A faithful replica measured ~3-5 s and ~100 queries against prod on
-- every cutter/assembler/qc dashboard, queue, completed, and post-action view.
--
-- get_role_schedule returns the SAME graph the TS loader assembles today, keyed
-- snake_case so it feeds the identical mapping code (assembleRoleScheduleItems).
-- Escalations are returned once (all rows, opened_at DESC); the loader derives
-- both the open-per-window map and the per-window history from that single
-- array, folding the duplicate scan (roadmap Phase 3 task 1).
--
-- SECURITY DEFINER + GRANT authenticated mirrors the dataset RPCs. The queue
-- read runs as the service-role admin client (facility-wide, by design — see
-- getSettingsAndOverrides), so this RPC does not widen visibility: it returns
-- the same all-rows set the loader already reads. Additive CREATE OR REPLACE;
-- the TS retains the chunked path as the pre-migration / rollback fallback.

CREATE OR REPLACE FUNCTION get_role_schedule(p_date_column text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  -- Whitelist the sort column: it is interpolated into ORDER BY below.
  IF p_date_column NOT IN (
    'scheduled_cut_date', 'scheduled_assembly_date', 'scheduled_qc_date'
  ) THEN
    RAISE EXCEPTION 'get_role_schedule: invalid date column %', p_date_column;
  END IF;

  SELECT jsonb_build_object(
    -- All schedule rows, ordered by the role's date column ASC NULLS LAST to
    -- mirror the loader's .order(dateColumn, { ascending: true, nullsFirst: false }).
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
      FROM window_manufacturing_schedule s
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
      WHERE u.id IN (SELECT DISTINCT unit_id FROM window_manufacturing_schedule)
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
      WHERE w.id IN (SELECT DISTINCT window_id FROM window_manufacturing_schedule)
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
      WHERE p.window_id IN (SELECT DISTINCT window_id FROM window_manufacturing_schedule)
    ), '[]'::jsonb),

    'rooms', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name))
      FROM rooms r
      WHERE r.id IN (
        SELECT DISTINCT w.room_id
        FROM windows w
        WHERE w.id IN (SELECT DISTINCT window_id FROM window_manufacturing_schedule)
      )
    ), '[]'::jsonb),

    -- One scan, all statuses, newest first. The loader splits this into the
    -- open-per-window map and the per-window history (folds the old double scan).
    'escalations', COALESCE((
      SELECT jsonb_agg(row_to_json(e.*) ORDER BY e.opened_at DESC)
      FROM window_manufacturing_escalations e
      WHERE e.window_id IN (SELECT DISTINCT window_id FROM window_manufacturing_schedule)
    ), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_role_schedule(text) TO authenticated;
