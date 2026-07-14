-- Phase 2 (audit finding C2): move per-role authorization into the database.
--
-- Two layers, moved together (scoping one while the other stays open fixes nothing):
--   1. Table RLS  — replace every blanket `authenticated ... USING (true)` policy with
--      role/ownership-scoped policies derived from auth.uid() (never from client input).
--   2. RPC gates  — the five SECURITY DEFINER dataset RPCs now resolve the caller from
--      auth.uid() and reject callers outside their scope; their EXECUTE grants to
--      anon/PUBLIC (the zero-credential leak confirmed in Phase 0) are revoked.
--
-- Visibility contract (must reproduce the Phase 0 golden set byte-identically):
--   owner                = everything
--   installer            = units where assigned_installer_id = their linked installer id,
--                          plus those units' buildings/clients/rooms/windows/schedule
--   scheduler            = units in scheduler_unit_assignments for them, UNION units whose
--                          assigned installer is on their team (installers.scheduler_id),
--                          plus the same per-unit subtree + team/all installers
--   cutter/assembler/qc  = the manufacturing scope they use: all units/rooms/windows +
--                          production/schedule/settings tables. NO clients/buildings access
--                          (their portals read the denormalized unit.building_name/client_name).
--   client (unused role) = nothing
--
-- The dataset RPCs are SECURITY DEFINER, so golden-set parity is carried by their bodies
-- (unchanged below, byte-identical to the live definitions) plus the new gates. Table RLS
-- governs the app's direct PostgREST reads/writes (unit detail, actions, realtime).
--
-- Rollback: docs/security/PHASE2_ROLLBACK.sql restores the pre-Phase-2 authenticated
-- visibility (blanket policies + ungated RPCs) WITHOUT re-opening anon access.

-- ============================================================================
-- Part 1 — helper functions (SECURITY DEFINER so policy evaluation bypasses RLS
-- on the tables they consult: no recursion, no double-filtering)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.auth_installer_id()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM installers WHERE auth_user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.auth_scheduler_id()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM schedulers WHERE auth_user_id = auth.uid();
$$;

-- Central per-role unit visibility predicate. Manufacturing roles see every unit
-- (their portals operate on the facility-wide production queue).
CREATE OR REPLACE FUNCTION public.can_access_unit(p_unit_id text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE public.get_user_role()
    WHEN 'owner' THEN true
    WHEN 'cutter' THEN true
    WHEN 'assembler' THEN true
    WHEN 'qc' THEN true
    WHEN 'installer' THEN EXISTS (
      SELECT 1
      FROM units u
      JOIN installers i ON i.auth_user_id = auth.uid()
      WHERE u.id = p_unit_id
        AND u.assigned_installer_id = i.id
    )
    WHEN 'scheduler' THEN EXISTS (
      SELECT 1
      FROM schedulers s
      WHERE s.auth_user_id = auth.uid()
        AND (
          EXISTS (
            SELECT 1 FROM scheduler_unit_assignments sua
            WHERE sua.unit_id = p_unit_id AND sua.scheduler_id = s.id
          )
          OR EXISTS (
            SELECT 1
            FROM units u
            JOIN installers i ON i.id = u.assigned_installer_id
            WHERE u.id = p_unit_id AND i.scheduler_id = s.id
          )
        )
    )
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION public.can_access_room(p_room_id text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.can_access_unit((SELECT r.unit_id FROM rooms r WHERE r.id = p_room_id));
$$;

CREATE OR REPLACE FUNCTION public.can_access_issue(p_issue_id text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.can_access_unit(
    (SELECT wpi.unit_id FROM window_post_install_issues wpi WHERE wpi.id = p_issue_id)
  );
$$;

REVOKE ALL ON FUNCTION public.auth_installer_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.auth_scheduler_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_access_unit(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_access_room(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_access_issue(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_installer_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.auth_scheduler_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_access_unit(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_access_room(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_access_issue(text) TO authenticated, service_role;

-- Indexes backing the new predicates (the rest already exist).
CREATE INDEX IF NOT EXISTS idx_schedulers_auth_user_id ON schedulers (auth_user_id);
CREATE INDEX IF NOT EXISTS idx_installers_scheduler_id ON installers (scheduler_id);

-- ============================================================================
-- Part 2 — RPC caller gates. Bodies are byte-identical to the live definitions
-- (verified against pg_get_functiondef before this migration); only the gate at
-- the top is new. service_role passes so server-admin tooling and the golden-set
-- parity script keep working.
--
-- Every gate is wrapped in COALESCE(<allow>, false) and fails CLOSED: the
-- caller-id comparisons (auth_installer_id / auth_scheduler_id) return NULL for
-- callers of the wrong role, and `p_id = NULL` is NULL — without the COALESCE,
-- `IF NOT (… OR NULL)` evaluates to `IF NULL` and skips the RAISE, leaking the
-- dataset (SQL three-valued logic). COALESCE turns that NULL into a denial.
-- ============================================================================

CREATE OR REPLACE FUNCTION get_full_dataset()
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
    'units',
      COALESCE((SELECT jsonb_agg(row_to_json(u.*) ORDER BY u.unit_number) FROM units u), '[]'::jsonb),
    'rooms',
      COALESCE((SELECT jsonb_agg(row_to_json(r.*) ORDER BY r.name) FROM rooms r), '[]'::jsonb),
    'windows',
      COALESCE((SELECT jsonb_agg(row_to_json(w.*) ORDER BY w.label) FROM windows w), '[]'::jsonb),
    'installers',
      COALESCE((SELECT jsonb_agg(row_to_json(i.*) ORDER BY i.name) FROM installers i), '[]'::jsonb),
    'schedule_entries',
      COALESCE((SELECT jsonb_agg(row_to_json(s.*) ORDER BY s.task_date) FROM schedule_entries s), '[]'::jsonb),
    'cutters',
      COALESCE((SELECT jsonb_agg(row_to_json(ct.*) ORDER BY ct.name) FROM cutters ct), '[]'::jsonb),
    'schedulers',
      COALESCE((SELECT jsonb_agg(row_to_json(sc.*) ORDER BY sc.name) FROM schedulers sc), '[]'::jsonb),
    'scheduler_unit_assignments',
      COALESCE((SELECT jsonb_agg(row_to_json(sua.*)) FROM scheduler_unit_assignments sua), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$$;

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
    'units',
      COALESCE((SELECT jsonb_agg(row_to_json(u.*) ORDER BY u.unit_number) FROM units u), '[]'::jsonb),
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
    -- Phase 11: enrichment folded in (replaces withManufacturingEscalations + the open-PI
    -- probe in withPostInstallIssues). Owner scope = all units, so no unit filter is needed.
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

CREATE OR REPLACE FUNCTION get_installer_dataset(p_installer_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  -- Callers may only request their own linked installer dataset (or be owner /
  -- service_role). An arbitrary p_installer_id is rejected.
  IF NOT COALESCE(
    COALESCE(auth.jwt() ->> 'role', '') = 'service_role'
    OR public.get_user_role() = 'owner'
    OR (p_installer_id IS NOT NULL AND p_installer_id = public.auth_installer_id())
  , false) THEN
    RAISE EXCEPTION 'Access denied: not your installer dataset'
      USING ERRCODE = '42501';
  END IF;

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

-- Converted from LANGUAGE sql to plpgsql solely to host the gate; the query inside
-- RETURN (...) is byte-identical to the previous body.
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
        -- Mirror getUnitCurrentStage() (src/lib/current-stage.ts) for the owner path,
        -- where currentStage is not derived: an open post-install issue takes precedence
        -- over the status-derived stage. Without this the post_install_issue bucket is
        -- always 0 and those units are silently mis-counted into their status bucket.
        -- (EXISTS is index-backed by idx_wpii_unit_open.)
        CASE
          WHEN EXISTS (
            SELECT 1 FROM window_post_install_issues wpi
            WHERE wpi.unit_id = u.id AND wpi.status = 'open'
          ) THEN 'post_install_issue'
          WHEN u.status = 'installed' THEN 'installation'
          WHEN u.status = 'manufactured' THEN 'qc'
          WHEN u.status = 'bracketed' THEN 'bracketing'
          WHEN u.status = 'measured' THEN 'measurement'
          ELSE 'not_started'
        END AS current_stage,
        EXISTS (
          SELECT 1
          FROM window_manufacturing_escalations wme
          WHERE wme.unit_id = u.id
            AND wme.status = 'open'
        ) AS has_open_escalation
      FROM units u
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

-- Close the zero-credential door: no PUBLIC/anon EXECUTE on any dataset RPC.
REVOKE ALL ON FUNCTION public.get_full_dataset() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_owner_dataset() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_installer_dataset(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_scheduler_dataset(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_owner_dashboard_counts(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_full_dataset() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_owner_dataset() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_installer_dataset(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_scheduler_dataset(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_owner_dashboard_counts(date) TO authenticated, service_role;

-- get_user_role() needs no anon path either (anon has no profile row).
REVOKE ALL ON FUNCTION public.get_user_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_role() TO authenticated, service_role;

-- ============================================================================
-- Part 3 — table RLS: drop each blanket policy, create scoped per-command policies.
-- Shorthand used throughout: (SELECT public.get_user_role()) is an InitPlan —
-- evaluated once per statement, not per row.
-- ============================================================================

-- ── clients ─────────────────────────────────────────────────────────────────
-- installer/scheduler see only clients that own a unit visible to them (the EXISTS
-- runs under the caller's units RLS, so it is exactly their unit scope). The
-- manufacturing portals read the denormalized units.client_name, not this table.
DROP POLICY IF EXISTS "authenticated_all_clients" ON clients;
CREATE POLICY clients_select_scoped ON clients FOR SELECT TO authenticated
  USING (
    (SELECT public.get_user_role()) = 'owner'
    OR (
      (SELECT public.get_user_role()) IN ('installer', 'scheduler')
      AND EXISTS (SELECT 1 FROM units u WHERE u.client_id = clients.id)
    )
  );
CREATE POLICY clients_insert_owner ON clients FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.get_user_role()) = 'owner');
CREATE POLICY clients_update_owner ON clients FOR UPDATE TO authenticated
  USING ((SELECT public.get_user_role()) = 'owner')
  WITH CHECK ((SELECT public.get_user_role()) = 'owner');
CREATE POLICY clients_delete_owner ON clients FOR DELETE TO authenticated
  USING ((SELECT public.get_user_role()) = 'owner');

-- ── buildings ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "authenticated_all_buildings" ON buildings;
CREATE POLICY buildings_select_scoped ON buildings FOR SELECT TO authenticated
  USING (
    (SELECT public.get_user_role()) = 'owner'
    OR (
      (SELECT public.get_user_role()) IN ('installer', 'scheduler')
      AND EXISTS (SELECT 1 FROM units u WHERE u.building_id = buildings.id)
    )
    OR (
      (SELECT public.get_user_role()) = 'scheduler'
      AND EXISTS (
        SELECT 1 FROM scheduler_building_access sba
        WHERE sba.building_id = buildings.id
      )
    )
  );
CREATE POLICY buildings_insert_owner ON buildings FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.get_user_role()) = 'owner');
CREATE POLICY buildings_update_owner ON buildings FOR UPDATE TO authenticated
  USING ((SELECT public.get_user_role()) = 'owner')
  WITH CHECK ((SELECT public.get_user_role()) = 'owner');
CREATE POLICY buildings_delete_owner ON buildings FOR DELETE TO authenticated
  USING ((SELECT public.get_user_role()) = 'owner');

-- ── units ───────────────────────────────────────────────────────────────────
-- Inline predicate (not can_access_unit) to avoid a redundant per-row self-lookup.
-- The sua/installers subqueries run under those tables' own policies, which for a
-- scheduler already scope to their rows.
DROP POLICY IF EXISTS "authenticated_all_units" ON units;
CREATE POLICY units_select_scoped ON units FOR SELECT TO authenticated
  USING (
    (SELECT public.get_user_role()) IN ('owner', 'cutter', 'assembler', 'qc')
    OR (
      (SELECT public.get_user_role()) = 'installer'
      AND assigned_installer_id = (SELECT public.auth_installer_id())
    )
    OR (
      (SELECT public.get_user_role()) = 'scheduler'
      AND (
        EXISTS (
          SELECT 1 FROM scheduler_unit_assignments sua
          WHERE sua.unit_id = units.id
            AND sua.scheduler_id = (SELECT public.auth_scheduler_id())
        )
        OR EXISTS (
          SELECT 1 FROM installers i
          WHERE i.id = units.assigned_installer_id
            AND i.scheduler_id = (SELECT public.auth_scheduler_id())
        )
      )
    )
  );
CREATE POLICY units_insert_owner ON units FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.get_user_role()) = 'owner');
-- UPDATE: visible row required (USING); the post-image check lets schedulers hand
-- units to any installer (their pick list may legitimately fall back to all
-- installers), while installers may not move a unit out of their own scope.
CREATE POLICY units_update_scoped ON units FOR UPDATE TO authenticated
  USING (
    (SELECT public.get_user_role()) IN ('owner', 'cutter', 'assembler', 'qc')
    OR (
      (SELECT public.get_user_role()) = 'installer'
      AND assigned_installer_id = (SELECT public.auth_installer_id())
    )
    OR (
      (SELECT public.get_user_role()) = 'scheduler'
      AND (
        EXISTS (
          SELECT 1 FROM scheduler_unit_assignments sua
          WHERE sua.unit_id = units.id
            AND sua.scheduler_id = (SELECT public.auth_scheduler_id())
        )
        OR EXISTS (
          SELECT 1 FROM installers i
          WHERE i.id = units.assigned_installer_id
            AND i.scheduler_id = (SELECT public.auth_scheduler_id())
        )
      )
    )
  )
  WITH CHECK (
    (SELECT public.get_user_role()) IN ('owner', 'scheduler', 'cutter', 'assembler', 'qc')
    OR (
      (SELECT public.get_user_role()) = 'installer'
      AND assigned_installer_id = (SELECT public.auth_installer_id())
    )
  );
CREATE POLICY units_delete_owner ON units FOR DELETE TO authenticated
  USING ((SELECT public.get_user_role()) = 'owner');

-- Column immutability: RLS can't restrict WHICH columns an UPDATE touches, and
-- manufacturing roles (cutter/assembler/qc) need units UPDATE for status /
-- production_entered_at / manufacturing_risk_flag. This trigger stops any role
-- other than owner/scheduler (and the service-role admin client used by imports,
-- backfills, and the reflow) from moving a unit's installer, building, or client.
-- Installers keep assigned_installer_id = self (unchanged), so they are unaffected
-- unless they try to reassign/move a unit — which is denied here as well.
CREATE OR REPLACE FUNCTION public.units_guard_ownership_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') = 'service_role'
     OR public.get_user_role() IN ('owner', 'scheduler') THEN
    RETURN NEW;
  END IF;
  IF NEW.assigned_installer_id IS DISTINCT FROM OLD.assigned_installer_id
     OR NEW.building_id IS DISTINCT FROM OLD.building_id
     OR NEW.client_id IS DISTINCT FROM OLD.client_id THEN
    RAISE EXCEPTION 'Only owner/scheduler may change a unit''s installer, building, or client'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS units_guard_ownership_columns ON units;
CREATE TRIGGER units_guard_ownership_columns
  BEFORE UPDATE ON units
  FOR EACH ROW
  EXECUTE FUNCTION public.units_guard_ownership_columns();

-- ── rooms ───────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "authenticated_all_rooms" ON rooms;
CREATE POLICY rooms_select_scoped ON rooms FOR SELECT TO authenticated
  USING (public.can_access_unit(unit_id));
CREATE POLICY rooms_insert_scoped ON rooms FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.get_user_role()) IN ('owner', 'installer', 'scheduler')
    AND public.can_access_unit(unit_id)
  );
CREATE POLICY rooms_update_scoped ON rooms FOR UPDATE TO authenticated
  USING (
    (SELECT public.get_user_role()) IN ('owner', 'installer', 'scheduler')
    AND public.can_access_unit(unit_id)
  )
  WITH CHECK (
    (SELECT public.get_user_role()) IN ('owner', 'installer', 'scheduler')
    AND public.can_access_unit(unit_id)
  );
CREATE POLICY rooms_delete_scoped ON rooms FOR DELETE TO authenticated
  USING (
    (SELECT public.get_user_role()) IN ('owner', 'installer', 'scheduler')
    AND public.can_access_unit(unit_id)
  );

-- ── windows ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "authenticated_all_windows" ON windows;
CREATE POLICY windows_select_scoped ON windows FOR SELECT TO authenticated
  USING (public.can_access_room(room_id));
CREATE POLICY windows_insert_scoped ON windows FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.get_user_role()) IN ('owner', 'installer', 'scheduler')
    AND public.can_access_room(room_id)
  );
CREATE POLICY windows_update_scoped ON windows FOR UPDATE TO authenticated
  USING (
    (SELECT public.get_user_role()) IN ('owner', 'installer', 'scheduler')
    AND public.can_access_room(room_id)
  )
  WITH CHECK (
    (SELECT public.get_user_role()) IN ('owner', 'installer', 'scheduler')
    AND public.can_access_room(room_id)
  );
CREATE POLICY windows_delete_scoped ON windows FOR DELETE TO authenticated
  USING (
    (SELECT public.get_user_role()) IN ('owner', 'installer', 'scheduler')
    AND public.can_access_room(room_id)
  );

-- ── schedule_entries ────────────────────────────────────────────────────────
-- Installers UPDATE entry statuses on their units (unit-progress sync); only
-- owner/scheduler create or delete entries.
DROP POLICY IF EXISTS "authenticated_all_schedule" ON schedule_entries;
CREATE POLICY schedule_select_scoped ON schedule_entries FOR SELECT TO authenticated
  USING (public.can_access_unit(unit_id));
CREATE POLICY schedule_insert_scoped ON schedule_entries FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.get_user_role()) IN ('owner', 'scheduler')
    AND public.can_access_unit(unit_id)
  );
CREATE POLICY schedule_update_scoped ON schedule_entries FOR UPDATE TO authenticated
  USING (
    (SELECT public.get_user_role()) IN ('owner', 'scheduler', 'installer')
    AND public.can_access_unit(unit_id)
  )
  WITH CHECK (
    (SELECT public.get_user_role()) IN ('owner', 'scheduler', 'installer')
    AND public.can_access_unit(unit_id)
  );
CREATE POLICY schedule_delete_scoped ON schedule_entries FOR DELETE TO authenticated
  USING (
    (SELECT public.get_user_role()) IN ('owner', 'scheduler')
    AND public.can_access_unit(unit_id)
  );

-- ── media_uploads ───────────────────────────────────────────────────────────
-- Installers may delete only their own uploads (mirrors the app rule in
-- fsr-data/photos.ts); window deletion still cleans residual media via the
-- ON DELETE CASCADE FK, which runs outside RLS.
DROP POLICY IF EXISTS "authenticated_all_media" ON media_uploads;
CREATE POLICY media_select_scoped ON media_uploads FOR SELECT TO authenticated
  USING (public.can_access_unit(unit_id));
CREATE POLICY media_insert_scoped ON media_uploads FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.get_user_role()) IN ('owner', 'installer', 'scheduler')
    AND public.can_access_unit(unit_id)
  );
CREATE POLICY media_delete_scoped ON media_uploads FOR DELETE TO authenticated
  USING (
    (
      (SELECT public.get_user_role()) IN ('owner', 'scheduler')
      AND public.can_access_unit(unit_id)
    )
    OR (
      (SELECT public.get_user_role()) = 'installer'
      AND public.can_access_unit(unit_id)
      AND uploaded_by_user_id = auth.uid()::text
    )
  );

-- ── notifications ───────────────────────────────────────────────────────────
-- Only 'installer' and 'scheduler' recipient kinds exist (verified live).
-- INSERT is service-role only (emit-notification.ts uses the admin client), so
-- the old blanket INSERT policy is dropped without replacement.
DROP POLICY IF EXISTS "authenticated_insert_notifications" ON notifications;
DROP POLICY IF EXISTS "authenticated_read_own_notifications" ON notifications;
DROP POLICY IF EXISTS "authenticated_all_notifications" ON notifications;
CREATE POLICY notifications_select_scoped ON notifications FOR SELECT TO authenticated
  USING (
    (SELECT public.get_user_role()) = 'owner'
    OR (recipient_role = 'installer' AND recipient_id = (SELECT public.auth_installer_id()))
    OR (recipient_role = 'scheduler' AND recipient_id = (SELECT public.auth_scheduler_id()))
  );
CREATE POLICY notifications_delete_owner ON notifications FOR DELETE TO authenticated
  USING ((SELECT public.get_user_role()) = 'owner');

-- ── notification_reads ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "authenticated_read_own_notification_reads" ON notification_reads;
CREATE POLICY notification_reads_select_own ON notification_reads FOR SELECT TO authenticated
  USING (
    (SELECT public.get_user_role()) = 'owner'
    OR (user_role = 'installer' AND user_id = (SELECT public.auth_installer_id()))
    OR (user_role = 'scheduler' AND user_id = (SELECT public.auth_scheduler_id()))
  );
CREATE POLICY notification_reads_insert_own ON notification_reads FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.get_user_role()) = 'owner'
    OR (user_role = 'installer' AND user_id = (SELECT public.auth_installer_id()))
    OR (user_role = 'scheduler' AND user_id = (SELECT public.auth_scheduler_id()))
  );
CREATE POLICY notification_reads_update_own ON notification_reads FOR UPDATE TO authenticated
  USING (
    (SELECT public.get_user_role()) = 'owner'
    OR (user_role = 'installer' AND user_id = (SELECT public.auth_installer_id()))
    OR (user_role = 'scheduler' AND user_id = (SELECT public.auth_scheduler_id()))
  )
  WITH CHECK (
    (SELECT public.get_user_role()) = 'owner'
    OR (user_role = 'installer' AND user_id = (SELECT public.auth_installer_id()))
    OR (user_role = 'scheduler' AND user_id = (SELECT public.auth_scheduler_id()))
  );
CREATE POLICY notification_reads_delete_owner ON notification_reads FOR DELETE TO authenticated
  USING ((SELECT public.get_user_role()) = 'owner');

-- ── unit_activity_log ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "authenticated_all_unit_activity_log" ON unit_activity_log;
CREATE POLICY unit_activity_log_select_scoped ON unit_activity_log FOR SELECT TO authenticated
  USING (public.can_access_unit(unit_id));
CREATE POLICY unit_activity_log_insert_scoped ON unit_activity_log FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.get_user_role()) IN ('owner', 'installer', 'scheduler', 'cutter', 'assembler', 'qc')
    AND public.can_access_unit(unit_id)
  );

-- ── installers ──────────────────────────────────────────────────────────────
-- Everyone resolves their own linked row (role inference in lib/auth.ts);
-- schedulers read the full list (all_installers pick-list fallback).
DROP POLICY IF EXISTS "authenticated_all_installers" ON installers;
CREATE POLICY installers_select_scoped ON installers FOR SELECT TO authenticated
  USING (
    auth_user_id = auth.uid()
    OR (SELECT public.get_user_role()) IN ('owner', 'scheduler')
  );
CREATE POLICY installers_write_owner ON installers FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.get_user_role()) = 'owner');
CREATE POLICY installers_update_owner ON installers FOR UPDATE TO authenticated
  USING ((SELECT public.get_user_role()) = 'owner')
  WITH CHECK ((SELECT public.get_user_role()) = 'owner');
CREATE POLICY installers_delete_owner ON installers FOR DELETE TO authenticated
  USING ((SELECT public.get_user_role()) = 'owner');

-- ── schedulers ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "authenticated_all_schedulers" ON schedulers;
CREATE POLICY schedulers_select_scoped ON schedulers FOR SELECT TO authenticated
  USING (
    auth_user_id = auth.uid()
    OR (SELECT public.get_user_role()) = 'owner'
  );
CREATE POLICY schedulers_insert_owner ON schedulers FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.get_user_role()) = 'owner');
CREATE POLICY schedulers_update_owner ON schedulers FOR UPDATE TO authenticated
  USING ((SELECT public.get_user_role()) = 'owner')
  WITH CHECK ((SELECT public.get_user_role()) = 'owner');
CREATE POLICY schedulers_delete_owner ON schedulers FOR DELETE TO authenticated
  USING ((SELECT public.get_user_role()) = 'owner');

-- ── cutters / assemblers / qcs ──────────────────────────────────────────────
DROP POLICY IF EXISTS "authenticated_all_cutters" ON cutters;
CREATE POLICY cutters_select_scoped ON cutters FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid() OR (SELECT public.get_user_role()) = 'owner');
CREATE POLICY cutters_insert_owner ON cutters FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.get_user_role()) = 'owner');
CREATE POLICY cutters_update_owner ON cutters FOR UPDATE TO authenticated
  USING ((SELECT public.get_user_role()) = 'owner')
  WITH CHECK ((SELECT public.get_user_role()) = 'owner');
CREATE POLICY cutters_delete_owner ON cutters FOR DELETE TO authenticated
  USING ((SELECT public.get_user_role()) = 'owner');

DROP POLICY IF EXISTS "authenticated_all_assemblers" ON assemblers;
CREATE POLICY assemblers_select_scoped ON assemblers FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid() OR (SELECT public.get_user_role()) = 'owner');
CREATE POLICY assemblers_insert_owner ON assemblers FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.get_user_role()) = 'owner');
CREATE POLICY assemblers_update_owner ON assemblers FOR UPDATE TO authenticated
  USING ((SELECT public.get_user_role()) = 'owner')
  WITH CHECK ((SELECT public.get_user_role()) = 'owner');
CREATE POLICY assemblers_delete_owner ON assemblers FOR DELETE TO authenticated
  USING ((SELECT public.get_user_role()) = 'owner');

DROP POLICY IF EXISTS "authenticated_all_qcs" ON qcs;
CREATE POLICY qcs_select_scoped ON qcs FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid() OR (SELECT public.get_user_role()) = 'owner');
CREATE POLICY qcs_insert_owner ON qcs FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.get_user_role()) = 'owner');
CREATE POLICY qcs_update_owner ON qcs FOR UPDATE TO authenticated
  USING ((SELECT public.get_user_role()) = 'owner')
  WITH CHECK ((SELECT public.get_user_role()) = 'owner');
CREATE POLICY qcs_delete_owner ON qcs FOR DELETE TO authenticated
  USING ((SELECT public.get_user_role()) = 'owner');

-- ── scheduler_unit_assignments ──────────────────────────────────────────────
-- Manufacturing roles read assignments to resolve which scheduler to notify
-- (production-actions / manufacturing-actions fan-out).
DROP POLICY IF EXISTS "authenticated_manage_scheduler_unit_assignments" ON scheduler_unit_assignments;
CREATE POLICY sua_select_scoped ON scheduler_unit_assignments FOR SELECT TO authenticated
  USING (
    (SELECT public.get_user_role()) IN ('owner', 'cutter', 'assembler', 'qc')
    OR scheduler_id = (SELECT public.auth_scheduler_id())
  );
CREATE POLICY sua_insert_scoped ON scheduler_unit_assignments FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.get_user_role()) = 'owner'
    OR scheduler_id = (SELECT public.auth_scheduler_id())
  );
CREATE POLICY sua_update_scoped ON scheduler_unit_assignments FOR UPDATE TO authenticated
  USING (
    (SELECT public.get_user_role()) = 'owner'
    OR scheduler_id = (SELECT public.auth_scheduler_id())
  )
  WITH CHECK (
    (SELECT public.get_user_role()) = 'owner'
    OR scheduler_id = (SELECT public.auth_scheduler_id())
  );
CREATE POLICY sua_delete_scoped ON scheduler_unit_assignments FOR DELETE TO authenticated
  USING (
    (SELECT public.get_user_role()) = 'owner'
    OR scheduler_id = (SELECT public.auth_scheduler_id())
  );

-- ── scheduler_building_access ───────────────────────────────────────────────
DROP POLICY IF EXISTS "authenticated_manage_scheduler_building_access" ON scheduler_building_access;
CREATE POLICY sba_select_scoped ON scheduler_building_access FOR SELECT TO authenticated
  USING (
    (SELECT public.get_user_role()) = 'owner'
    OR scheduler_id = (SELECT public.auth_scheduler_id())
  );
CREATE POLICY sba_insert_owner ON scheduler_building_access FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.get_user_role()) = 'owner');
CREATE POLICY sba_update_owner ON scheduler_building_access FOR UPDATE TO authenticated
  USING ((SELECT public.get_user_role()) = 'owner')
  WITH CHECK ((SELECT public.get_user_role()) = 'owner');
CREATE POLICY sba_delete_owner ON scheduler_building_access FOR DELETE TO authenticated
  USING ((SELECT public.get_user_role()) = 'owner');

-- ── manufacturing_settings ──────────────────────────────────────────────────
-- Read by every staff role (the schedule reflow consults capacities); written
-- only by the owner (updateManufacturingSettings requires owner).
DROP POLICY IF EXISTS "authenticated_all_manufacturing_settings" ON manufacturing_settings;
CREATE POLICY mfg_settings_select_staff ON manufacturing_settings FOR SELECT TO authenticated
  USING (
    (SELECT public.get_user_role()) IN ('owner', 'installer', 'scheduler', 'cutter', 'assembler', 'qc')
  );
CREATE POLICY mfg_settings_insert_owner ON manufacturing_settings FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.get_user_role()) = 'owner');
CREATE POLICY mfg_settings_update_owner ON manufacturing_settings FOR UPDATE TO authenticated
  USING ((SELECT public.get_user_role()) = 'owner')
  WITH CHECK ((SELECT public.get_user_role()) = 'owner');
CREATE POLICY mfg_settings_delete_owner ON manufacturing_settings FOR DELETE TO authenticated
  USING ((SELECT public.get_user_role()) = 'owner');

-- ── manufacturing_calendar_overrides ────────────────────────────────────────
DROP POLICY IF EXISTS "authenticated_all_manufacturing_calendar_overrides" ON manufacturing_calendar_overrides;
CREATE POLICY mfg_calendar_select_staff ON manufacturing_calendar_overrides FOR SELECT TO authenticated
  USING (
    (SELECT public.get_user_role()) IN ('owner', 'installer', 'scheduler', 'cutter', 'assembler', 'qc')
  );
CREATE POLICY mfg_calendar_insert_mfg ON manufacturing_calendar_overrides FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.get_user_role()) IN ('owner', 'cutter', 'assembler', 'qc'));
CREATE POLICY mfg_calendar_update_mfg ON manufacturing_calendar_overrides FOR UPDATE TO authenticated
  USING ((SELECT public.get_user_role()) IN ('owner', 'cutter', 'assembler', 'qc'))
  WITH CHECK ((SELECT public.get_user_role()) IN ('owner', 'cutter', 'assembler', 'qc'));
CREATE POLICY mfg_calendar_delete_mfg ON manufacturing_calendar_overrides FOR DELETE TO authenticated
  USING ((SELECT public.get_user_role()) IN ('owner', 'cutter', 'assembler', 'qc'));

-- ── window_production_status ────────────────────────────────────────────────
DROP POLICY IF EXISTS "authenticated_all_window_production_status" ON window_production_status;
CREATE POLICY wps_select_scoped ON window_production_status FOR SELECT TO authenticated
  USING (public.can_access_unit(unit_id));
CREATE POLICY wps_insert_mfg ON window_production_status FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.get_user_role()) IN ('owner', 'cutter', 'assembler', 'qc'));
CREATE POLICY wps_update_mfg ON window_production_status FOR UPDATE TO authenticated
  USING ((SELECT public.get_user_role()) IN ('owner', 'cutter', 'assembler', 'qc'))
  WITH CHECK ((SELECT public.get_user_role()) IN ('owner', 'cutter', 'assembler', 'qc'));
CREATE POLICY wps_delete_owner ON window_production_status FOR DELETE TO authenticated
  USING ((SELECT public.get_user_role()) = 'owner');

-- ── window_manufacturing_schedule ───────────────────────────────────────────
-- The facility-wide reflow now runs on the service-role client
-- (src/lib/manufacturing-scheduler.ts); user-context writes remain for the
-- manufacturing portal's manual shift/lock actions.
DROP POLICY IF EXISTS "authenticated_all_window_manufacturing_schedule" ON window_manufacturing_schedule;
CREATE POLICY wms_select_staff ON window_manufacturing_schedule FOR SELECT TO authenticated
  USING (
    (SELECT public.get_user_role()) IN ('owner', 'installer', 'scheduler', 'cutter', 'assembler', 'qc')
  );
CREATE POLICY wms_insert_mfg ON window_manufacturing_schedule FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.get_user_role()) IN ('owner', 'cutter', 'assembler', 'qc'));
CREATE POLICY wms_update_mfg ON window_manufacturing_schedule FOR UPDATE TO authenticated
  USING ((SELECT public.get_user_role()) IN ('owner', 'cutter', 'assembler', 'qc'))
  WITH CHECK ((SELECT public.get_user_role()) IN ('owner', 'cutter', 'assembler', 'qc'));
CREATE POLICY wms_delete_mfg ON window_manufacturing_schedule FOR DELETE TO authenticated
  USING ((SELECT public.get_user_role()) IN ('owner', 'cutter', 'assembler', 'qc'));

-- ── window_manufacturing_escalations ────────────────────────────────────────
-- Opened by manufacturing users, resolved by cutter/assembler pushback flows;
-- schedulers/installers read them (dataset enrichment + unit detail).
DROP POLICY IF EXISTS "authenticated_all_window_manufacturing_escalations" ON window_manufacturing_escalations;
CREATE POLICY wme_select_scoped ON window_manufacturing_escalations FOR SELECT TO authenticated
  USING (public.can_access_unit(unit_id));
CREATE POLICY wme_insert_mfg ON window_manufacturing_escalations FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.get_user_role()) IN ('owner', 'cutter', 'assembler', 'qc'));
CREATE POLICY wme_update_mfg ON window_manufacturing_escalations FOR UPDATE TO authenticated
  USING ((SELECT public.get_user_role()) IN ('owner', 'cutter', 'assembler', 'qc'))
  WITH CHECK ((SELECT public.get_user_role()) IN ('owner', 'cutter', 'assembler', 'qc'));
CREATE POLICY wme_delete_owner ON window_manufacturing_escalations FOR DELETE TO authenticated
  USING ((SELECT public.get_user_role()) = 'owner');

-- ── window_post_install_issues ──────────────────────────────────────────────
-- Managed by owner/scheduler (requirePostInstallIssueUser); installers read them
-- on their unit detail pages.
DROP POLICY IF EXISTS "authenticated_all_window_post_install_issues" ON window_post_install_issues;
CREATE POLICY wpii_select_scoped ON window_post_install_issues FOR SELECT TO authenticated
  USING (public.can_access_unit(unit_id));
CREATE POLICY wpii_insert_scoped ON window_post_install_issues FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.get_user_role()) IN ('owner', 'scheduler')
    AND public.can_access_unit(unit_id)
  );
CREATE POLICY wpii_update_scoped ON window_post_install_issues FOR UPDATE TO authenticated
  USING (
    (SELECT public.get_user_role()) IN ('owner', 'scheduler')
    AND public.can_access_unit(unit_id)
  )
  WITH CHECK (
    (SELECT public.get_user_role()) IN ('owner', 'scheduler')
    AND public.can_access_unit(unit_id)
  );
CREATE POLICY wpii_delete_owner ON window_post_install_issues FOR DELETE TO authenticated
  USING ((SELECT public.get_user_role()) = 'owner');

-- ── window_post_install_issue_notes ─────────────────────────────────────────
DROP POLICY IF EXISTS "authenticated_all_window_post_install_issue_notes" ON window_post_install_issue_notes;
CREATE POLICY wpiin_select_scoped ON window_post_install_issue_notes FOR SELECT TO authenticated
  USING (public.can_access_issue(issue_id));
CREATE POLICY wpiin_insert_scoped ON window_post_install_issue_notes FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.get_user_role()) IN ('owner', 'scheduler')
    AND public.can_access_issue(issue_id)
  );
CREATE POLICY wpiin_delete_owner ON window_post_install_issue_notes FOR DELETE TO authenticated
  USING ((SELECT public.get_user_role()) = 'owner');

-- ── daily_progress_snapshots ────────────────────────────────────────────────
-- Written exclusively by the service-role snapshot job (lib/progress-snapshot.ts).
DROP POLICY IF EXISTS "authenticated_all_daily_progress_snapshots" ON daily_progress_snapshots;
CREATE POLICY dps_select_owner ON daily_progress_snapshots FOR SELECT TO authenticated
  USING ((SELECT public.get_user_role()) = 'owner');

-- ============================================================================
-- Part 4 — defense in depth: drop anon's default table-level grants so
-- unauthenticated probes fail loudly (401/42501) instead of returning `[]`.
-- Phase 1 already removed all anon policies; this removes the underlying grants.
-- ============================================================================

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon;

-- ============================================================================
-- Part 5 — self-test: fail the migration (and any future `db reset` replay)
-- if a blanket policy or an anon-executable dataset RPC survives.
-- ============================================================================

DO $$
DECLARE
  blanket_count integer;
  anon_rpc_count integer;
  norls_count integer;
BEGIN
  -- No authenticated ALL/SELECT policy with a bare `true` qual may remain on the
  -- scoped tables (user_profiles/owner_verification_photos were already scoped).
  SELECT count(*) INTO blanket_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND qual = 'true'
    AND tablename NOT IN ('user_profiles', 'owner_verification_photos');
  IF blanket_count > 0 THEN
    RAISE EXCEPTION 'Phase 2 self-test failed: % blanket USING(true) policies remain', blanket_count;
  END IF;

  -- No dataset RPC may be executable by anon or PUBLIC.
  SELECT count(*) INTO anon_rpc_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, ARRAY[]::aclitem[])) AS acl
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'get_full_dataset', 'get_owner_dataset', 'get_installer_dataset',
      'get_scheduler_dataset', 'get_owner_dashboard_counts',
      'auth_installer_id', 'auth_scheduler_id',
      'can_access_unit', 'can_access_room', 'can_access_issue'
    )
    AND (acl.grantee = 0 OR acl.grantee::regrole::text = 'anon');
  IF anon_rpc_count > 0 THEN
    RAISE EXCEPTION 'Phase 2 self-test failed: % dataset/helper RPC grants to anon/PUBLIC remain', anon_rpc_count;
  END IF;

  -- RLS must still be enabled on every public table.
  SELECT count(*) INTO norls_count
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND NOT c.relrowsecurity;
  IF norls_count > 0 THEN
    RAISE EXCEPTION 'Phase 2 self-test failed: % public tables without RLS', norls_count;
  END IF;
END;
$$;
