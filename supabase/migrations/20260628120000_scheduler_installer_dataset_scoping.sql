-- Scheduler / installer portal scoping helpers (Phase 9).
-- Mirror get_owner_dataset(): collapse the 6+ chunked PostgREST round-trips that
-- loadSchedulerDataset / loadInstallerDataset make into ONE SECURITY DEFINER RPC each.
-- These return the SAME raw scoped rows the chunked loaders fetch today — ALL mapping
-- and business logic (scheduler-name injection, self-pick row, installer fallback,
-- schedule normalization) stays in TS, so visibility is unchanged. The existing chunked
-- paths remain as the rollback / pre-migration fallback.

-- NOTE: id columns (schedulers.id, installers.id, units.assigned_installer_id,
-- scheduler_unit_assignments.scheduler_id) are TEXT (e.g. 'sch-...', 'inst-...'), not uuid.
-- The RPC parameters MUST be text or the call fails with "invalid input syntax for type uuid".

-- ── Scheduler ────────────────────────────────────────────────────────────────
-- Scope (must match getSchedulerScopedUnitIds + loadSchedulerDataset exactly):
--   units with a row in scheduler_unit_assignments for this scheduler, UNION
--   units whose assigned_installer_id is an installer on this scheduler's team
--   (installers.scheduler_id = p_scheduler_id).
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
  ),
  scoped_rooms AS (
    SELECT r.* FROM rooms r WHERE r.unit_id IN (SELECT id FROM scoped_units)
  ),
  scoped_windows AS (
    SELECT w.* FROM windows w WHERE w.room_id IN (SELECT id FROM scoped_rooms)
  )
  SELECT jsonb_build_object(
    'units',
      COALESCE((SELECT jsonb_agg(row_to_json(su.*) ORDER BY su.unit_number) FROM scoped_units su), '[]'::jsonb),
    -- explicit assignment rows only (team-installer units have no assigned_at), keyed by unit
    'assignments',
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object('unit_id', sua.unit_id, 'assigned_at', sua.assigned_at))
        FROM scheduler_unit_assignments sua
        WHERE sua.scheduler_id = p_scheduler_id
      ), '[]'::jsonb),
    -- the scheduler's own row: used for schedulerName + the synthetic self pick-list entry
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
    'rooms',
      COALESCE((SELECT jsonb_agg(row_to_json(sr.*) ORDER BY sr.name) FROM scoped_rooms sr), '[]'::jsonb),
    'windows',
      COALESCE((SELECT jsonb_agg(row_to_json(sw.*) ORDER BY sw.label) FROM scoped_windows sw), '[]'::jsonb),
    'schedule_entries',
      COALESCE((
        SELECT jsonb_agg(row_to_json(se.*) ORDER BY se.task_date)
        FROM schedule_entries se
        WHERE se.unit_id IN (SELECT id FROM scoped_units)
      ), '[]'::jsonb),
    -- this scheduler's team installers; TS falls back to all_installers when empty
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

-- ── Installer ────────────────────────────────────────────────────────────────
-- Scope (must match loadInstallerDataset exactly): units where
-- assigned_installer_id = p_installer_id, plus their buildings/clients/rooms/windows/schedule.
CREATE OR REPLACE FUNCTION get_installer_dataset(p_installer_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  WITH scoped_units AS (
    SELECT u.* FROM units u WHERE u.assigned_installer_id = p_installer_id
  ),
  scoped_rooms AS (
    SELECT r.* FROM rooms r WHERE r.unit_id IN (SELECT id FROM scoped_units)
  ),
  scoped_windows AS (
    SELECT w.* FROM windows w WHERE w.room_id IN (SELECT id FROM scoped_rooms)
  )
  SELECT jsonb_build_object(
    'units',
      COALESCE((SELECT jsonb_agg(row_to_json(su.*) ORDER BY su.unit_number) FROM scoped_units su), '[]'::jsonb),
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
    'rooms',
      COALESCE((SELECT jsonb_agg(row_to_json(sr.*) ORDER BY sr.name) FROM scoped_rooms sr), '[]'::jsonb),
    'windows',
      COALESCE((SELECT jsonb_agg(row_to_json(sw.*) ORDER BY sw.label) FROM scoped_windows sw), '[]'::jsonb),
    'schedule_entries',
      COALESCE((
        SELECT jsonb_agg(row_to_json(se.*) ORDER BY se.task_date)
        FROM schedule_entries se
        WHERE se.unit_id IN (SELECT id FROM scoped_units)
      ), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_installer_dataset(text) TO authenticated;

-- Drop the earlier uuid-typed signatures from the first apply of this migration so only
-- the correct text-typed overloads remain (id columns are text, not uuid).
DROP FUNCTION IF EXISTS get_scheduler_dataset(uuid);
DROP FUNCTION IF EXISTS get_installer_dataset(uuid);
