-- M6: per-unit manufacturing counts as one set-based read.
--
-- loadManufacturingProcessRowsForUnits fetched every room for every unit, then
-- every installed window for every room, then every production-status row, and
-- tallied them in JS: ~22 chunked queries / ~1,062 ms measured, to produce four
-- integers per unit. The room hop existed only to map window -> unit; C4's
-- windows.unit_id (20260720160000, backfilled and NOT NULL) removes it.
--
-- SECURITY INVOKER (the default) on purpose: the caller runs on the RLS user
-- client, and the scheduler/installer variants depend on their row policies to
-- scope the result. A SECURITY DEFINER function here would hand every role the
-- owner's facility-wide view.
CREATE OR REPLACE FUNCTION public.get_manufacturing_process_counts(
  p_unit_ids text[] DEFAULT NULL
)
RETURNS TABLE (
  unit_id text,
  cut_count integer,
  assembled_count integer,
  qc_approved_count integer,
  installed_count integer
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH scope AS (
    SELECT u.id
    FROM units u
    WHERE u.window_count > 0
      AND (p_unit_ids IS NULL OR u.id = ANY(p_unit_ids))
  ),
  prod AS (
    SELECT
      p.unit_id,
      count(*) FILTER (
        WHERE p.status IN ('cut', 'assembled', 'qc_approved')
      )::integer AS cut_count,
      count(*) FILTER (
        WHERE p.status IN ('assembled', 'qc_approved')
      )::integer AS assembled_count,
      count(*) FILTER (WHERE p.status = 'qc_approved')::integer AS qc_approved_count
    FROM window_production_status p
    JOIN scope s ON s.id = p.unit_id
    GROUP BY p.unit_id
  ),
  inst AS (
    SELECT w.unit_id, count(*)::integer AS installed_count
    FROM windows w
    JOIN scope s ON s.id = w.unit_id
    WHERE w.installed
    GROUP BY w.unit_id
  )
  SELECT
    s.id AS unit_id,
    COALESCE(prod.cut_count, 0)          AS cut_count,
    COALESCE(prod.assembled_count, 0)    AS assembled_count,
    COALESCE(prod.qc_approved_count, 0)  AS qc_approved_count,
    COALESCE(inst.installed_count, 0)    AS installed_count
  FROM scope s
  LEFT JOIN prod ON prod.unit_id = s.id
  LEFT JOIN inst ON inst.unit_id = s.id;
$$;

GRANT EXECUTE ON FUNCTION public.get_manufacturing_process_counts(text[])
  TO authenticated, service_role;

-- The installed tally filters on a boolean over the whole windows table; a
-- partial index keeps it to the matching rows only.
CREATE INDEX IF NOT EXISTS idx_windows_unit_id_installed
  ON public.windows (unit_id)
  WHERE installed;
