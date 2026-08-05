-- Dashboard pipeline: make "Cut" and "Assembled" reachable.
--
-- BUG. The owner/scheduler dashboards bucket units with getUnitCurrentStage()
-- (src/lib/current-stage.ts). On the global paths the dataset ships no
-- rooms/windows (Phases 10/D1), so `unit.currentStage` is undefined and the
-- function falls back to mapping the PERSISTED `units.status`:
--
--   installed → installation · manufactured → qc · bracketed → bracketing
--   measured  → measurement  · else → not_started
--
-- `units.status` has no cutting/assembling member (deriveUnitStatusFromCounts
-- only reaches `manufactured` once EVERY window is qc_approved), so a unit whose
-- windows are cut or assembled stays `measured`/`bracketed`. The dashboard's
-- "Cut" and "Assembled" rows were therefore structurally always 0, and units
-- sitting in the cutter/assembly queues were counted as Measured. Verified on
-- prod 2026-08-05: units 2305 / 2308 / 2309 (Lansdowne B) had all windows in
-- window_production_status ('cut' / 'assembled' / 'qc_approved') while the
-- dashboard showed 3 × Measured, 0 × Cut, 0 × Assembled.
--
-- FIX. Derive the stage from the production truth (windows +
-- window_production_status) in ONE place — the `unit_current_stages` view — and
-- return it as `current_stage` on the unit rows of the two global dataset RPCs,
-- plus use it for the owner dashboard's pre-aggregated counts. The view mirrors
-- deriveCurrentStageFromCounts() exactly, including the post-install-issue
-- precedence that getUnitCurrentStage() applies first.
--
-- ORDER. Apply AFTER 20260805120000_unit_installed_at.sql — that migration adds
-- units.installed_at and also replaces get_owner_dataset; this file's copy of the
-- projection carries its 'installed_at' key forward so neither change is lost.
-- The guard below fails loudly if the two are applied out of order.
--
-- Rollback: revert this file (re-apply 20260805120000 for get_owner_dataset and
-- 20260713170000 for get_scheduler_dataset / get_owner_dashboard_counts), then
-- DROP VIEW public.unit_current_stages. The TS side reads `current_stage`
-- optionally, so it degrades to today's status-derived behaviour without it.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'units' AND column_name = 'installed_at'
  ) THEN
    RAISE EXCEPTION
      'Apply 20260805120000_unit_installed_at.sql first — units.installed_at is missing.';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. The single source of truth for a unit's current pipeline stage.
-- ---------------------------------------------------------------------------
-- Mirrors src/lib/current-stage.ts deriveCurrentStageFromCounts(). Keep the two
-- in lockstep; scripts/deploy/parity-unit-current-stage.mjs asserts they agree
-- over the whole prod table.
CREATE OR REPLACE VIEW public.unit_current_stages AS
WITH win AS (
  -- windows.unit_id is NOT NULL and trigger-maintained (20260720160000), so no
  -- rooms hop is needed.
  SELECT
    w.unit_id,
    count(*)::int                                  AS total_windows,
    count(*) FILTER (WHERE w.measured)::int        AS measured_count,
    count(*) FILTER (WHERE w.bracketed)::int       AS bracketed_count,
    count(*) FILTER (WHERE w.installed)::int       AS installed_count
  FROM public.windows w
  GROUP BY w.unit_id
),
prod AS (
  -- Same "or later" roll-up the TS enrichment uses: a qc_approved window has
  -- also been cut and assembled.
  SELECT
    p.unit_id,
    count(*) FILTER (WHERE p.status IN ('cut', 'assembled', 'qc_approved'))::int AS cut_count,
    count(*) FILTER (WHERE p.status IN ('assembled', 'qc_approved'))::int        AS assembled_count,
    count(*) FILTER (WHERE p.status = 'qc_approved')::int                        AS qc_count
  FROM public.window_production_status p
  GROUP BY p.unit_id
)
SELECT
  u.id AS unit_id,
  CASE
    -- getUnitCurrentStage() checks this first; bake it in so consumers can use
    -- current_stage verbatim. (EXISTS is index-backed by idx_wpii_unit_open.)
    WHEN EXISTS (
      SELECT 1 FROM public.window_post_install_issues wpi
      WHERE wpi.unit_id = u.id AND wpi.status = 'open'
    ) THEN 'post_install_issue'
    WHEN COALESCE(win.total_windows, 0) = 0                       THEN 'not_started'
    WHEN COALESCE(win.installed_count, 0) >= win.total_windows    THEN 'installation'
    WHEN COALESCE(prod.qc_count, 0) >= win.total_windows          THEN 'qc'
    WHEN COALESCE(prod.assembled_count, 0) > 0                    THEN 'assembling'
    WHEN COALESCE(prod.cut_count, 0) > 0                          THEN 'cutting'
    WHEN COALESCE(win.bracketed_count, 0) >= win.total_windows    THEN 'bracketing'
    WHEN COALESCE(win.measured_count, 0) >= win.total_windows     THEN 'measurement'
    WHEN COALESCE(win.bracketed_count, 0) > 0                     THEN 'bracketing'
    WHEN COALESCE(win.measured_count, 0) > 0                      THEN 'measurement'
    ELSE 'not_started'
  END AS current_stage
FROM public.units u
LEFT JOIN win  ON win.unit_id  = u.id
LEFT JOIN prod ON prod.unit_id = u.id;

-- The view is an internal building block for the SECURITY DEFINER RPCs below
-- (which run as its owner). It is deliberately NOT exposed through PostgREST:
-- an ungated view would read across every unit regardless of the caller's row
-- policies. Phase 1/2 rule — no anon, no direct authenticated access.
REVOKE ALL ON public.unit_current_stages FROM PUBLIC;
REVOKE ALL ON public.unit_current_stages FROM anon;
REVOKE ALL ON public.unit_current_stages FROM authenticated;

-- ---------------------------------------------------------------------------
-- 2. get_owner_dataset — add current_stage to the units projection.
-- ---------------------------------------------------------------------------
-- Copied verbatim from 20260805120000 (D1 projection + installed_at) with one
-- added key: current_stage.
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
    -- Projection (D1): exactly the columns mapUnit reads — plus current_stage,
    -- which mapUnit now maps to Unit.currentStage so the dashboard can bucket
    -- cutting/assembling units without shipping rooms/windows.
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
          'current_stage', ucs.current_stage,
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
        LEFT JOIN unit_current_stages ucs ON ucs.unit_id = u.id
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

-- ---------------------------------------------------------------------------
-- 3. get_scheduler_dataset — same key on the scoped unit rows.
-- ---------------------------------------------------------------------------
-- Copied verbatim from 20260713170000 (the owner/self gate + Phase 11
-- enrichment fold); the only change is the 'units' aggregate, which now merges
-- current_stage into each full row.
CREATE OR REPLACE FUNCTION get_scheduler_dataset(p_scheduler_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  -- Callers may only request their own linked scheduler dataset (or be owner /
  -- service_role). An arbitrary p_scheduler_id is rejected.
  IF NOT COALESCE(
    COALESCE(auth.jwt() ->> 'role', '') = 'service_role'
    OR public.get_user_role() = 'owner'
    OR (p_scheduler_id IS NOT NULL AND p_scheduler_id = public.auth_scheduler_id())
  , false) THEN
    RAISE EXCEPTION 'Access denied: not your scheduler dataset'
      USING ERRCODE = '42501';
  END IF;

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
      COALESCE((
        SELECT jsonb_agg(
          -- Same full row as before (row_to_json(su.*)), plus the derived stage.
          row_to_json(su.*)::jsonb || jsonb_build_object('current_stage', ucs.current_stage)
          ORDER BY su.unit_number
        )
        FROM scoped_units su
        LEFT JOIN unit_current_stages ucs ON ucs.unit_id = su.id
      ), '[]'::jsonb),
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
    -- Raw rooms/windows are not shipped on the global scheduler path (20260628140000).
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
      COALESCE((SELECT jsonb_agg(row_to_json(i.*) ORDER BY i.name) FROM installers i), '[]'::jsonb),
    -- Phase 11: enrichment folded in, scoped to this scheduler's units (mirrors the global
    -- scheduler enrichment, which scopes by dataset.units = the scoped set).
    'manufacturing_escalations',
      COALESCE((
        SELECT jsonb_agg(row_to_json(wme.*) ORDER BY wme.opened_at DESC)
        FROM window_manufacturing_escalations wme
        WHERE wme.status = 'open'
          AND wme.unit_id IN (SELECT id FROM scoped_units)
      ), '[]'::jsonb),
    'units_with_open_post_install_issue',
      COALESCE((
        SELECT jsonb_agg(DISTINCT wpi.unit_id)
        FROM window_post_install_issues wpi
        WHERE wpi.status = 'open'
          AND wpi.unit_id IN (SELECT id FROM scoped_units)
      ), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_scheduler_dataset(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_scheduler_dataset(text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. get_owner_dashboard_counts — bucket by the derived stage.
-- ---------------------------------------------------------------------------
-- Copied verbatim from 20260713170000; the only change is `current_stage`, which
-- now comes from the view instead of the status CASE. The issue flags below
-- still key off persisted `units.status` (unchanged semantics).
CREATE OR REPLACE FUNCTION get_owner_dashboard_counts(p_today date DEFAULT CURRENT_DATE)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT COALESCE(
    COALESCE(auth.jwt() ->> 'role', '') = 'service_role'
    OR public.get_user_role() = 'owner'
  , false) THEN
    RAISE EXCEPTION 'Access denied: owner role required'
      USING ERRCODE = '42501';
  END IF;

  RETURN (
    WITH unit_scope AS (
      SELECT
        u.id,
        u.status,
        u.assigned_installer_id,
        u.bracketing_date,
        u.installation_date,
        -- Mirrors getUnitCurrentStage() (src/lib/current-stage.ts) for the owner
        -- path. The view already applies the open-post-install-issue precedence
        -- AND the cutting/assembling stages that `units.status` cannot express —
        -- deriving from status alone pinned those two buckets to 0 forever.
        COALESCE(ucs.current_stage, 'not_started') AS current_stage,
        EXISTS (
          SELECT 1
          FROM window_manufacturing_escalations wme
          WHERE wme.unit_id = u.id
            AND wme.status = 'open'
        ) AS has_open_escalation
      FROM units u
      LEFT JOIN unit_current_stages ucs ON ucs.unit_id = u.id
    ),
    flagged AS (
      -- bracketing_date / installation_date are DATE columns (units were migrated from
      -- TEXT to DATE in 20260407000000_schema_best_practices.sql), so compare date-to-date
      -- directly. NULL is the only "unset" sentinel — there is no empty-string case.
      SELECT
        *,
        status <> 'installed'
          AND (
            (
              bracketing_date IS NOT NULL
              AND bracketing_date < p_today
              AND status = 'not_started'
            )
            OR (
              installation_date IS NOT NULL
              AND installation_date < p_today
            )
          ) AS has_past_scheduled,
        status <> 'installed'
          AND (
            assigned_installer_id IS NULL
            OR bracketing_date IS NULL
            OR (installation_date IS NULL AND status IN ('measured', 'bracketed', 'manufactured'))
          ) AS has_missing,
        status <> 'installed'
          AND installation_date IS NOT NULL
          AND installation_date >= p_today
          AND installation_date <= p_today + 3 AS has_at_risk
      FROM unit_scope
    ),
    stage_counts AS (
      SELECT jsonb_build_object(
        'not_started', COUNT(*) FILTER (WHERE current_stage = 'not_started'),
        'measurement', COUNT(*) FILTER (WHERE current_stage = 'measurement'),
        'bracketing', COUNT(*) FILTER (WHERE current_stage = 'bracketing'),
        'cutting', COUNT(*) FILTER (WHERE current_stage = 'cutting'),
        'assembling', COUNT(*) FILTER (WHERE current_stage = 'assembling'),
        'qc', COUNT(*) FILTER (WHERE current_stage = 'qc'),
        'installation', COUNT(*) FILTER (WHERE current_stage = 'installation'),
        'post_install_issue', COUNT(*) FILTER (WHERE current_stage = 'post_install_issue')
      ) AS counts
      FROM flagged
    ),
    issue_counts AS (
      SELECT jsonb_build_object(
        'past_scheduled', COUNT(*) FILTER (WHERE has_past_scheduled),
        'escalations', COUNT(*) FILTER (WHERE has_open_escalation),
        'missing', COUNT(*) FILTER (WHERE has_missing),
        'at_risk', COUNT(*) FILTER (WHERE has_at_risk)
      ) AS counts
      FROM flagged
    )
    SELECT jsonb_build_object(
      'total_units', (SELECT COUNT(*) FROM flagged),
      'stage_counts', (SELECT counts FROM stage_counts),
      'issue_counts', (SELECT counts FROM issue_counts)
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_owner_dashboard_counts(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_owner_dashboard_counts(date) TO authenticated, service_role;
