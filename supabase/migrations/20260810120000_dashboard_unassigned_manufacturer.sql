-- ===========================================================================
-- MR2 — surface units nobody has routed to a manufacturer
-- ===========================================================================
-- `units.manufacturing_partner_id` defaults to 'mp-internal', so the id alone
-- cannot distinguish "we chose the in-house factory" from "nobody was ever
-- asked". `manufacturing_assigned_at IS NULL` is the only signal that the
-- decision has not been made, and today it is invisible everywhere except the
-- room-creation gate — which installers skip entirely.
--
-- This adds an `unassigned_manufacturer` issue bucket to the owner dashboard's
-- pre-aggregated counts. It is deliberately shipped BEFORE the phase that stops
-- building unrouted units in-house (MR3): the owner needs to see the list and
-- work it to zero while those units still flow, not discover it afterwards when
-- they have silently stopped being scheduled.
--
-- Read-only change: one CREATE OR REPLACE of a counting function. No table is
-- touched, no row is written. The previous client ignores the extra key, so the
-- migration is safe to apply ahead of the code deploy.
--
-- Mirrors (keep in lockstep):
--   src/lib/unit-flags.ts        computeUnitFlags -> "missing_manufacturer"
--   src/lib/dashboard-issues.ts  getUnitIssues    -> "unassigned_manufacturer"
--   src/lib/server-data/owner.ts normalizeOwnerDashboardCounts (must read the key)
-- Parity is asserted by src/lib/owner-dashboard-counts.test.mts.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- get_owner_dashboard_counts — add the unassigned-manufacturer bucket.
-- ---------------------------------------------------------------------------
-- Copied verbatim from 20260805130000; the only changes are the two extra
-- columns on unit_scope, the has_unassigned_manufacturer flag, and its entry in
-- issue_counts.
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
        u.manufacturing_assigned_at,
        u.window_count,
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
        -- Nobody chose a manufacturer. window_count > 0 keeps units with nothing
        -- to build out of the bucket: they do not need an answer yet, and
        -- including them would bury the real ones under a freshly imported
        -- building. Mirrors computeUnitFlags' "missing_manufacturer".
        status <> 'installed'
          AND manufacturing_assigned_at IS NULL
          AND COALESCE(window_count, 0) > 0 AS has_unassigned_manufacturer,
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
        'unassigned_manufacturer', COUNT(*) FILTER (WHERE has_unassigned_manufacturer),
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

-- ============================================================
-- DOWN (reversible)
-- ============================================================
-- Re-apply the get_owner_dashboard_counts body from
-- 20260805130000_unit_current_stage.sql. Nothing else to undo — no schema or
-- data change was made.
