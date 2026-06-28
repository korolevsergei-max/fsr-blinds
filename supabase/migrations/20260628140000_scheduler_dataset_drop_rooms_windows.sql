-- Phase 10: drop raw rooms/windows from the scheduler global payload (mirror get_owner_dataset).
-- The scheduler shell's global screens (dashboard, units list, schedule) read only unit-level
-- data + manufacturing escalations; raw rooms/windows are read only by the scheduler unit-detail
-- subtree, which now loads its own scoped copy via loadSchedulerUnitDetail (nested provider).
-- rooms (866) + windows (1989) were the two largest arrays in the scheduler response.
--
-- Additive CREATE OR REPLACE; scope/shape otherwise identical to 20260628120000. Param stays text.
CREATE OR REPLACE FUNCTION get_scheduler_dataset(p_scheduler_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  WITH scoped_units AS (
    SELECT u.*
    FROM units u
    WHERE u.id IN (
      SELECT sua.unit_id
      FROM scheduler_unit_assignments sua
      WHERE sua.scheduler_id = p_scheduler_id
      UNION
      SELECT u2.id
      FROM units u2
      JOIN installers i ON i.id = u2.assigned_installer_id
      WHERE i.scheduler_id = p_scheduler_id
    )
  )
  SELECT jsonb_build_object(
    'units',
      COALESCE((SELECT jsonb_agg(row_to_json(su.*) ORDER BY su.unit_number) FROM scoped_units su), '[]'::jsonb),
    'assignments',
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object('unit_id', sua.unit_id, 'assigned_at', sua.assigned_at))
        FROM scheduler_unit_assignments sua
        WHERE sua.scheduler_id = p_scheduler_id
      ), '[]'::jsonb),
    'scheduler',
      (SELECT row_to_json(s.*) FROM schedulers s WHERE s.id = p_scheduler_id),
    'buildings',
      COALESCE((
        SELECT jsonb_agg(row_to_json(b.*) ORDER BY b.name)
        FROM buildings b
        WHERE b.id IN (SELECT DISTINCT building_id FROM scoped_units)
      ), '[]'::jsonb),
    'clients',
      COALESCE((
        SELECT jsonb_agg(row_to_json(c.*) ORDER BY c.name)
        FROM clients c
        WHERE c.id IN (SELECT DISTINCT client_id FROM scoped_units)
      ), '[]'::jsonb),
    -- Raw rooms/windows are no longer shipped on the global scheduler path (see header).
    'rooms', '[]'::jsonb,
    'windows', '[]'::jsonb,
    'schedule_entries',
      COALESCE((
        SELECT jsonb_agg(row_to_json(se.*) ORDER BY se.task_date)
        FROM schedule_entries se
        WHERE se.unit_id IN (SELECT id FROM scoped_units)
      ), '[]'::jsonb),
    'team_installers',
      COALESCE((
        SELECT jsonb_agg(row_to_json(ti.*) ORDER BY ti.name)
        FROM installers ti
        WHERE ti.scheduler_id = p_scheduler_id
      ), '[]'::jsonb),
    'all_installers',
      COALESCE((SELECT jsonb_agg(row_to_json(i.*) ORDER BY i.name) FROM installers i), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_scheduler_dataset(text) TO authenticated;
