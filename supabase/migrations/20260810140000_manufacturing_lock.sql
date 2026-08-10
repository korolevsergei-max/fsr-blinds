-- ===========================================================================
-- MR4a — lock the manufacturer once manufacturing has started (enforcement)
-- ===========================================================================
-- Once real work exists on a unit, changing its manufacturer re-shows already
-- built blinds as open work on the other side — the ~$100-per-blind double
-- build this whole plan exists to prevent. From this migration on, a locked
-- unit's manufacturing_partner_id can only be changed by the OWNER, and only
-- when the same UPDATE carries a fresh override stamp (the "Transfer anyway"
-- confirmation, wired in MR4b).
--
-- LOCK PREDICATE (one place, is_manufacturing_locked below):
--   internal  — the cutter pulled it onto the floor (production_entered_at),
--               or any blind has moved past 'pending'.
--   external  — the vendor can already SEE it (all_measured_at, the worklist
--               predicate in get_subcontractor_worklist), or they finished a
--               blind (qc_approved). Partial internal-style progress does not
--               lock an external unit; only visibility or finished work does.
--
-- DEPENDS ON MR3 (20260810130000): the lock design assumes "locked ⟹ routed",
-- which only holds after that backfill stamped every unit with manufacturing
-- activity. Verified before writing this file.
--
-- No data write. Two metadata-only ADD COLUMNs, one function, one view, one
-- trigger-function restructure, three dataset-RPC projections. The trigger
-- restructure is the risky part — see the rehearsal script
-- scripts/deploy/rehearse-manufacturing-lock-trigger.sql (§4a.6): apply this
-- inside a transaction, run the role probes as real UPDATEs, ROLLBACK, and
-- only then apply for real.
--
-- Mirrors (keep in lockstep):
--   src/lib/manufacturing-lock.ts             computeManufacturingLock
--   src/app/actions/management-actions.ts     assignUnitsToManufacturingPartner
--   scripts/deploy/parity-manufacturing-lock.mjs  asserts SQL ↔ TS agree on prod
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. (§4a.1) The override stamp — two columns on units.
-- ---------------------------------------------------------------------------
-- Written in the SAME UPDATE as the partner change; the trigger below unlocks
-- only when the stamp is fresh in this statement (NEW IS DISTINCT FROM OLD)
-- AND the caller is the owner. That freshness test is what stops a
-- once-overridden unit from becoming permanently transferable.
--
-- Rejected alternatives (do not revisit): a transaction-local GUC cannot work
-- because PostgREST runs each supabase-js call in its own transaction, so a
-- local set_config is rolled back before the UPDATE and a non-local one leaks
-- across the pooled connection; a dedicated transfer RPC would add a second
-- routing write path, which is exactly the property the subcontract feature
-- treats as hard-won. The stamp keeps one write path and leaves a permanently
-- queryable audit trail on the row.
--
-- No default, no NOT NULL — metadata-only change, no table rewrite.
ALTER TABLE public.units
  ADD COLUMN IF NOT EXISTS manufacturing_transfer_override_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS manufacturing_transfer_override_by TEXT;

-- ---------------------------------------------------------------------------
-- 2. One lock predicate, in SQL.
-- ---------------------------------------------------------------------------
-- COALESCE(..., true): an unknown partner id reads as internal — the same
-- fail-direction as isInternalPartnerId in TS (the column defaults to
-- 'mp-internal', so absent/unknown means the in-house factory).
-- Both EXISTS probes ride idx_window_production_status_unit_status
-- (unit_id, status) from 20260627120000.
CREATE OR REPLACE FUNCTION public.is_manufacturing_locked(
  p_unit_id text, p_partner_id text,
  p_production_entered_at timestamptz, p_all_measured_at timestamptz
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN COALESCE((SELECT mp.is_internal FROM public.manufacturing_partners mp
                    WHERE mp.id = p_partner_id), true) THEN
      -- INTERNAL: cutter pulled it onto the floor, or a blind has moved.
      p_production_entered_at IS NOT NULL
      OR EXISTS (SELECT 1 FROM public.window_production_status w
                  WHERE w.unit_id = p_unit_id AND w.status <> 'pending')
    ELSE
      -- EXTERNAL: the vendor can see it (their worklist predicate), or
      -- finished a blind.
      p_all_measured_at IS NOT NULL
      OR EXISTS (SELECT 1 FROM public.window_production_status w
                  WHERE w.unit_id = p_unit_id AND w.status = 'qc_approved')
  END;
$$;

-- Executed by the guard trigger and the view below, both of which run as the
-- function owner — no client role ever needs to call it directly.
REVOKE ALL ON FUNCTION public.is_manufacturing_locked(text, text, timestamptz, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_manufacturing_locked(text, text, timestamptz, timestamptz)
  TO service_role;

-- ---------------------------------------------------------------------------
-- 3. unit_manufacturing_locks — the lock plus the two counts the transfer
--    dialog needs.
-- ---------------------------------------------------------------------------
--   qc_count       — finished blinds; they survive a transfer.
--   in_flight_count — part-built blinds that get REBUILT on transfer, ~$100
--                     each; the number the owner confirms against in MR4b.
-- Calls the function so there is literally one predicate.
CREATE OR REPLACE VIEW public.unit_manufacturing_locks AS
WITH prod AS (
  SELECT
    p.unit_id,
    count(*) FILTER (WHERE p.status <> 'pending')::int     AS started_count,
    count(*) FILTER (WHERE p.status = 'qc_approved')::int  AS qc_count
  FROM public.window_production_status p
  GROUP BY p.unit_id
)
SELECT
  u.id AS unit_id,
  public.is_manufacturing_locked(
    u.id, u.manufacturing_partner_id, u.production_entered_at, u.all_measured_at
  ) AS manufacturing_locked,
  COALESCE(prod.qc_count, 0)                                   AS qc_count,
  COALESCE(prod.started_count, 0) - COALESCE(prod.qc_count, 0) AS in_flight_count
FROM public.units u
LEFT JOIN prod ON prod.unit_id = u.id;

-- Same privilege posture as unit_current_stages (20260805130000): an internal
-- building block for the SECURITY DEFINER RPCs only. PG views default to
-- security_invoker = off, so a direct client SELECT would run with the view
-- owner's privileges, bypass the units RLS policies, and leak lock state
-- across scope — hence no anon and no authenticated. service_role keeps its
-- default grant for scripts/deploy/parity-manufacturing-lock.mjs.
REVOKE ALL ON public.unit_manufacturing_locks FROM PUBLIC;
REVOKE ALL ON public.unit_manufacturing_locks FROM anon;
REVOKE ALL ON public.unit_manufacturing_locks FROM authenticated;

-- ---------------------------------------------------------------------------
-- 4. units_guard_ownership_columns — enforce the lock at the write.
-- ---------------------------------------------------------------------------
-- Restructured from 20260806120000: the owner short-circuit used to precede
-- everything, so the lock check (which binds the owner too, absent a fresh
-- override) must move above it. The scheduler branch and the catch-all are
-- copied verbatim, with the two override columns added to the catch-all's
-- immutability list.
--
-- Deploy-risk containment (§4a.6): the lock check is gated on v_changed — the
-- partner actually changing — so recomputeUnitStatus, date edits, and the
-- subcontractor's own units.status writes never reach it. The override-column
-- check compares NEW to OLD, and untouched columns carry OLD's value in a
-- BEFORE UPDATE trigger, so ordinary writes don't trip it either.
CREATE OR REPLACE FUNCTION public.units_guard_ownership_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role    text;
  v_changed boolean;
  v_locked  boolean;
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') = 'service_role' THEN
    RETURN NEW;
  END IF;

  v_role    := public.get_user_role();
  v_changed := NEW.manufacturing_partner_id IS DISTINCT FROM OLD.manufacturing_partner_id;

  -- Only the owner may ever stamp the override columns.
  IF v_role IS DISTINCT FROM 'owner' AND (
       NEW.manufacturing_transfer_override_at IS DISTINCT FROM OLD.manufacturing_transfer_override_at
    OR NEW.manufacturing_transfer_override_by IS DISTINCT FROM OLD.manufacturing_transfer_override_by) THEN
    RAISE EXCEPTION 'Only the owner may record a manufacturing transfer override'
      USING ERRCODE = '42501';
  END IF;

  -- LOCK. Evaluated from OLD state (the lock depends on which side CURRENTLY
  -- owns the unit) and only on a partner change, so recomputeUnitStatus and
  -- the subcontractor's own units.status writes never reach it. The owner
  -- passes only with a stamp that is fresh in this same statement — a stale
  -- stamp from an earlier override does not keep the unit transferable.
  IF v_changed THEN
    v_locked := public.is_manufacturing_locked(
      OLD.id, OLD.manufacturing_partner_id, OLD.production_entered_at, OLD.all_measured_at);
    IF v_locked AND NOT (v_role = 'owner'
         AND NEW.manufacturing_transfer_override_at IS NOT NULL
         AND NEW.manufacturing_transfer_override_at IS DISTINCT FROM OLD.manufacturing_transfer_override_at) THEN
      RAISE EXCEPTION 'Manufacturing has already started on this unit — only the owner may transfer it, with confirmation'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF v_role = 'owner' THEN
    RETURN NEW;
  END IF;

  -- Schedulers may make the INITIAL manufacturer choice (the room-creation gate
  -- runs in their portal too), but not change it afterwards. Re-routing a unit
  -- mid-build moves real work between two companies, so it is an owner decision.
  -- `manufacturing_assigned_at` is the discriminator: NULL means nobody has
  -- chosen yet, because manufacturing_partner_id defaults to in-house.
  IF v_role = 'scheduler' THEN
    IF NEW.manufacturing_partner_id IS DISTINCT FROM OLD.manufacturing_partner_id
       AND OLD.manufacturing_assigned_at IS NOT NULL THEN
      RAISE EXCEPTION 'Only the owner may change a unit''s manufacturer once it has been set'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.assigned_installer_id IS DISTINCT FROM OLD.assigned_installer_id
     OR NEW.building_id IS DISTINCT FROM OLD.building_id
     OR NEW.client_id IS DISTINCT FROM OLD.client_id
     OR NEW.manufacturing_partner_id IS DISTINCT FROM OLD.manufacturing_partner_id
     OR NEW.manufacturing_transfer_override_at IS DISTINCT FROM OLD.manufacturing_transfer_override_at
     OR NEW.manufacturing_transfer_override_by IS DISTINCT FROM OLD.manufacturing_transfer_override_by THEN
    RAISE EXCEPTION 'Only owner/scheduler may change a unit''s installer, building, client, or manufacturing partner'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Dataset projections — ship the derived boolean to the pickers.
-- ---------------------------------------------------------------------------
-- ⚠️ SAFE DEFAULT IS THE OPPOSITE OF THE PARTNER DEFAULT: an absent
-- `manufacturing_locked` must read FALSE on the client (mapUnit does
-- `?? false`), so an old RPC shape leaves the picker usable rather than
-- freezing every unit. The server action and the trigger above are the real
-- enforcement — the client boolean is presentation only.

-- 5a. get_owner_dataset — copied verbatim from 20260806120000; the only
--     changes are the unit_manufacturing_locks join and the
--     'manufacturing_locked' key.
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
          'manufacturing_risk_flag', u.manufacturing_risk_flag,
          'manufacturing_partner_id', u.manufacturing_partner_id,
          'manufacturing_assigned_at', u.manufacturing_assigned_at,
          'manufacturing_locked', COALESCE(uml.manufacturing_locked, false)
        ) ORDER BY u.unit_number)
        FROM units u
        LEFT JOIN unit_current_stages ucs ON ucs.unit_id = u.id
        LEFT JOIN unit_manufacturing_locks uml ON uml.unit_id = u.id
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
    'manufacturing_partners',
      COALESCE((
        SELECT jsonb_agg(row_to_json(mp.*) ORDER BY mp.is_internal DESC, mp.name)
        FROM manufacturing_partners mp
      ), '[]'::jsonb),
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

-- 5b. get_scheduler_dataset — copied verbatim from 20260805130000; the only
--     change extends the row_to_json merge. row_to_json gets table columns
--     free, but not a DERIVED value — hence the explicit merge.
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
          -- Same full row as before (row_to_json(su.*)), plus the derived
          -- stage and the manufacturing lock.
          row_to_json(su.*)::jsonb || jsonb_build_object(
            'current_stage', ucs.current_stage,
            'manufacturing_locked', COALESCE(uml.manufacturing_locked, false)
          )
          ORDER BY su.unit_number
        )
        FROM scoped_units su
        LEFT JOIN unit_current_stages ucs ON ucs.unit_id = su.id
        LEFT JOIN unit_manufacturing_locks uml ON uml.unit_id = su.id
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

-- 5c. get_full_dataset — copied verbatim from 20260713170000; the only change
--     is the same merge on the units aggregate (this RPC serves the owner
--     units list fallback path, where the bulk-assign sheet lives).
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
      COALESCE((
        SELECT jsonb_agg(
          row_to_json(u.*)::jsonb || jsonb_build_object(
            'manufacturing_locked', COALESCE(uml.manufacturing_locked, false)
          )
          ORDER BY u.unit_number
        )
        FROM units u
        LEFT JOIN unit_manufacturing_locks uml ON uml.unit_id = u.id
      ), '[]'::jsonb),
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

REVOKE ALL ON FUNCTION public.get_full_dataset() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_full_dataset() TO authenticated, service_role;

-- ============================================================
-- DOWN (reversible)
-- ============================================================
-- Re-apply units_guard_ownership_columns from 20260806120000, get_owner_dataset
-- from 20260806120000, get_scheduler_dataset from 20260805130000, and
-- get_full_dataset from 20260713170000. Then:
-- DROP VIEW IF EXISTS public.unit_manufacturing_locks;
-- DROP FUNCTION IF EXISTS public.is_manufacturing_locked(text, text, timestamptz, timestamptz);
-- ALTER TABLE public.units DROP COLUMN IF EXISTS manufacturing_transfer_override_at;
-- ALTER TABLE public.units DROP COLUMN IF EXISTS manufacturing_transfer_override_by;
-- (Dropping the columns is optional — stamps left in place are a harmless,
-- true audit record. mapUnit reads manufacturing_locked with `?? false`, so
-- the TS side degrades to "nothing locked" without any of this.)
