-- Phase C2 (roadmap Phase 5): take computeAndUpdateManufacturingRisk off the
-- view path.
--
-- Before this, the risk computation ran in after() on EVERY cutter/assembler/qc
-- dashboard view as a serial per-unit N+1 (qc-count select + prev-flag select +
-- update + assignment select + notification insert) — ~170-230 queries per
-- dashboard open at current scale, each followed by a layout revalidatePath.
--
-- This RPC does the whole facility in ONE set-based statement. The working-day
-- math (addWorkingDays with settings/overrides) stays in TS, which precomputes
-- per-unit days_until and passes it as p_days = [{unit_id, days_until}]. The
-- function joins that to a per-unit qc_approved count, computes the flag with
-- the SAME thresholds as the old loop, updates only the units whose flag CHANGED
-- (no-op writes skipped), and RETURNS the rows that both changed AND cross the
-- notification threshold (yellow/red within 2 days) so TS emits notifications
-- once per transition (idempotent: a re-run with unchanged inputs returns no
-- rows, so no duplicate "behind schedule" notifications).

CREATE OR REPLACE FUNCTION public.recompute_manufacturing_risk_flags(p_days jsonb)
RETURNS TABLE (
  unit_id text,
  new_flag text,
  prev_flag text,
  days_until integer,
  scheduler_id text,
  client_name text,
  building_name text,
  unit_number text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH input AS (
    SELECT
      (x->>'unit_id')::text AS unit_id,
      (x->>'days_until')::int AS days_until
    FROM jsonb_array_elements(COALESCE(p_days, '[]'::jsonb)) x
  ),
  qc AS (
    SELECT wps.unit_id,
           count(*) FILTER (WHERE wps.status = 'qc_approved') AS qc_count
    FROM window_production_status wps
    WHERE wps.unit_id IN (SELECT i.unit_id FROM input i)
    GROUP BY wps.unit_id
  ),
  computed AS (
    SELECT
      u.id AS unit_id,
      u.manufacturing_risk_flag AS prev_flag,
      i.days_until,
      CASE
        WHEN u.window_count > 0 AND COALESCE(q.qc_count, 0) >= u.window_count THEN 'complete'
        WHEN i.days_until <= 0 THEN 'red'
        WHEN i.days_until <= 2 THEN 'yellow'
        ELSE 'green'
      END AS new_flag
    FROM units u
    JOIN input i ON i.unit_id = u.id
    LEFT JOIN qc q ON q.unit_id = u.id
    WHERE u.window_count > 0
  ),
  updated AS (
    UPDATE units u
    SET manufacturing_risk_flag = c.new_flag
    FROM computed c
    WHERE u.id = c.unit_id
      AND u.manufacturing_risk_flag IS DISTINCT FROM c.new_flag
    RETURNING u.id
  )
  SELECT
    c.unit_id,
    c.new_flag,
    c.prev_flag,
    c.days_until,
    sua.scheduler_id,
    u.client_name,
    u.building_name,
    u.unit_number
  FROM computed c
  JOIN units u ON u.id = c.unit_id
  LEFT JOIN scheduler_unit_assignments sua ON sua.unit_id = c.unit_id
  WHERE c.new_flag IS DISTINCT FROM c.prev_flag
    AND c.new_flag IN ('yellow', 'red')
    AND c.days_until <= 2;
END;
$$;

GRANT EXECUTE ON FUNCTION public.recompute_manufacturing_risk_flags(jsonb)
  TO authenticated, service_role;
