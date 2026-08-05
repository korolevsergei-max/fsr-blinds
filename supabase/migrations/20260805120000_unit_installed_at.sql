-- units.installed_at: the day a unit ACTUALLY became fully installed.
--
-- Why this exists
-- ---------------
-- The owner Progress Report answered "what was completed in this period?" with
-- units.installation_date. That column is the SCHEDULED install date, written
-- only by the scheduler assignment flow (fsr-data/assignments.ts) and by CSV
-- import — never by the act of installing. Two defects followed:
--
--   1. Silent undercount. A unit installed without a scheduled assignment keeps
--      installation_date NULL and vanishes from the report with no warning. As
--      of 2026-08-05 that was 69 units / 477 blinds in Lansdowne Building B —
--      the exact gap between the Manufacturing Process screen (300 units, 1,846
--      blinds) and the Progress Report (231 units, 1,369 windows).
--   2. Wrong period. Even for units that had a date, it was the plan, not the
--      completion. 227 of 374 installed units had a planned date differing from
--      their real completion day, several by more than a month.
--
-- installation_date keeps its meaning (the plan, used by scheduling and by
-- manufacturing-risk); installed_at is the new completion fact. The Progress
-- Report reads installed_at, so it now ties to the Manufacturing Process screen
-- by construction: both count a unit once every one of its windows is installed.
--
-- Going forward the column is stamped by recomputeUnitStatus (unit-progress.ts),
-- the sole writer of units.status, on the transition into 'installed' — and
-- cleared on the transition out, so an undone install does not leave a stale
-- completion date behind.

ALTER TABLE public.units ADD COLUMN IF NOT EXISTS installed_at DATE;

COMMENT ON COLUMN public.units.installed_at IS
  'Calendar day (America/Toronto) the unit became fully installed. Set by recomputeUnitStatus on the transition into status = ''installed'', cleared on the transition out. Distinct from installation_date, which is the SCHEDULED install date.';

-- Backfill. Evidence, in order of preference:
--   1. The most recent unit_activity_log 'status_changed' entry into 'installed'.
--      Most recent (not earliest) because a unit can be un-installed and
--      re-installed; the last transition in is the one that stuck, and current
--      status is 'installed' so no transition out followed it.
--   2. installation_date, for units whose status predates the activity log
--      (e.g. seeded rows, or the 20260602120000 drift backfill, which set status
--      by direct UPDATE and wrote no log entry).
--
-- Measured against production on 2026-08-05 across 374 installed units: 301
-- resolve from the log, 73 from installation_date, 0 from neither. Only rows
-- with status = 'installed' are touched, so this is idempotent and re-running it
-- is a no-op (the IS NULL guard also stops it from overwriting live stamps).
WITH last_install_log AS (
  SELECT
    l.unit_id,
    max(l.created_at) AS installed_ts
  FROM public.unit_activity_log l
  WHERE l.action = 'status_changed'
    AND l.details ->> 'to' = 'installed'
  GROUP BY l.unit_id
)
UPDATE public.units u
SET installed_at = COALESCE(
  (lil.installed_ts AT TIME ZONE 'America/Toronto')::date,
  u.installation_date
)
FROM (SELECT id FROM public.units) AS scope
LEFT JOIN last_install_log lil ON lil.unit_id = scope.id
WHERE u.id = scope.id
  AND u.status = 'installed'
  AND u.installed_at IS NULL
  AND COALESCE(
    (lil.installed_ts AT TIME ZONE 'America/Toronto')::date,
    u.installation_date
  ) IS NOT NULL;

-- The report filters completed units by building over a date range.
CREATE INDEX IF NOT EXISTS idx_units_building_installed_at
  ON public.units (building_id, installed_at)
  WHERE status = 'installed';

-- Add installed_at to the owner dataset projection (D1, 20260720170000).
-- Everything else below is copied verbatim from that migration; the ONLY change
-- is the new 'installed_at' key, which mapUnit now reads.
CREATE OR REPLACE FUNCTION get_owner_dataset()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT COALESCE(
    COALESCE(auth.jwt() ->> 'role', '') = 'service_role'
    OR public.get_user_role() = 'owner'
  , false) THEN
    RAISE EXCEPTION 'Access denied: owner role required'
      USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'clients',
      COALESCE((SELECT jsonb_agg(row_to_json(c.*) ORDER BY c.name) FROM clients c), '[]'::jsonb),
    'buildings',
      COALESCE((SELECT jsonb_agg(row_to_json(b.*) ORDER BY b.name) FROM buildings b), '[]'::jsonb),
    -- Projection (D1): exactly the columns mapUnit reads — byte-identical mapUnit
    -- output, unmapped columns dropped from the payload.
    'units',
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', u.id,
          'building_id', u.building_id,
          'client_id', u.client_id,
          'client_name', u.client_name,
          'building_name', u.building_name,
          'unit_number', u.unit_number,
          'status', u.status,
          'assigned_installer_id', u.assigned_installer_id,
          'assigned_installer_name', u.assigned_installer_name,
          'measurement_date', u.measurement_date,
          'bracketing_date', u.bracketing_date,
          'installation_date', u.installation_date,
          'installed_at', u.installed_at,
          'earliest_bracketing_date', u.earliest_bracketing_date,
          'earliest_installation_date', u.earliest_installation_date,
          'complete_by_date', u.complete_by_date,
          'room_count', u.room_count,
          'window_count', u.window_count,
          'photos_uploaded', u.photos_uploaded,
          'notes_count', u.notes_count,
          'created_at', u.created_at,
          'manufacturing_risk_flag', u.manufacturing_risk_flag
        ) ORDER BY u.unit_number)
        FROM units u
      ), '[]'::jsonb),
    'rooms',
      '[]'::jsonb,
    'windows',
      '[]'::jsonb,
    'installers',
      COALESCE((SELECT jsonb_agg(row_to_json(i.*) ORDER BY i.name) FROM installers i), '[]'::jsonb),
    'schedule_entries',
      COALESCE((SELECT jsonb_agg(row_to_json(s.*) ORDER BY s.task_date) FROM schedule_entries s), '[]'::jsonb),
    'cutters',
      COALESCE((SELECT jsonb_agg(row_to_json(ct.*) ORDER BY ct.name) FROM cutters ct), '[]'::jsonb),
    'schedulers',
      COALESCE((SELECT jsonb_agg(row_to_json(sc.*) ORDER BY sc.name) FROM schedulers sc), '[]'::jsonb),
    'scheduler_unit_assignments',
      COALESCE((SELECT jsonb_agg(row_to_json(sua.*)) FROM scheduler_unit_assignments sua), '[]'::jsonb),
    'manufacturing_escalations',
      COALESCE((
        SELECT jsonb_agg(row_to_json(wme.*) ORDER BY wme.opened_at DESC)
        FROM window_manufacturing_escalations wme
        WHERE wme.status = 'open'
      ), '[]'::jsonb),
    'units_with_open_post_install_issue',
      COALESCE((
        SELECT jsonb_agg(DISTINCT wpi.unit_id)
        FROM window_post_install_issues wpi
        WHERE wpi.status = 'open'
      ), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_owner_dataset() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_owner_dataset() TO authenticated, service_role;
