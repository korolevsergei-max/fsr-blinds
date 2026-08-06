-- Subcontract manufacturing: manufacturing partners + the `subcontractor` role.
--
-- CONTEXT. Manufacturing is moving from all-internal (cutter → assembler → qc)
-- to a mixed model: some units are made in-house, others are handed wholesale to
-- an external subcontractor who cuts, assembles, QCs and packages them, then
-- hands back finished blinds. Nothing in the schema recorded *who* manufactures a
-- unit, so every measured unit was swept into the internal factory schedule by
-- reflowManufacturingSchedules() and appeared in the cutter queue.
--
-- MODEL. `manufacturing_partners` holds companies (row one is 'FSR Internal');
-- `units.manufacturing_partner_id` points at one, defaulting to the internal row
-- so existing data is unchanged. `subcontractors` holds the login accounts —
-- several logins may share one partner, the installers.scheduler_id pattern.
--
-- DELIBERATELY NOT CHANGED: `unit_current_stages`, `get_owner_dashboard_counts`,
-- and the UnitStatus / ProductionStatus enums. A partner marks a unit complete by
-- writing window_production_status.status = 'qc_approved' for every window, which
-- is a state the pipeline already understands end-to-end. There is no new stage.
--
-- Rollback: see the DOWN block at the foot of this file.

-- ---------------------------------------------------------------------------
-- 1. Partners (companies) and subcontractors (their logins)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.manufacturing_partners (
  id            TEXT        PRIMARY KEY,
  name          TEXT        NOT NULL,
  contact_name  TEXT        NOT NULL DEFAULT '',
  contact_email TEXT        NOT NULL DEFAULT '',
  contact_phone TEXT        NOT NULL DEFAULT '',
  -- true for the in-house factory only. Drives which units the cutter/assembler/
  -- qc portals and the capacity reflow consider theirs.
  is_internal   BOOLEAN     NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ
);

-- The in-house row. `units.manufacturing_partner_id` defaults to this id, so the
-- INSERT must land before the column is added below.
INSERT INTO public.manufacturing_partners (id, name, is_internal)
VALUES ('mp-internal', 'FSR Internal', true)
ON CONFLICT (id) DO NOTHING;

-- Exactly one internal partner, enforced rather than assumed: INTERNAL_PARTNER_ID
-- in src/lib/manufacturing-partners.ts is a constant, and a second internal row
-- would silently split the factory's own work in two.
CREATE UNIQUE INDEX IF NOT EXISTS idx_manufacturing_partners_single_internal
  ON public.manufacturing_partners ((is_internal)) WHERE is_internal;

CREATE TABLE IF NOT EXISTS public.subcontractors (
  id           TEXT        PRIMARY KEY,
  partner_id   TEXT        NOT NULL REFERENCES public.manufacturing_partners(id) ON DELETE CASCADE,
  name         TEXT        NOT NULL,
  email        TEXT        NOT NULL,
  phone        TEXT        NOT NULL DEFAULT '',
  auth_user_id UUID        UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_subcontractors_email_unique
  ON public.subcontractors (email) WHERE email <> '';
CREATE INDEX IF NOT EXISTS idx_subcontractors_partner_id
  ON public.subcontractors (partner_id);
CREATE INDEX IF NOT EXISTS idx_subcontractors_auth_user_id
  ON public.subcontractors (auth_user_id);

ALTER TABLE public.manufacturing_partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subcontractors         ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_set_updated_at ON public.manufacturing_partners;
CREATE TRIGGER trg_set_updated_at
  BEFORE UPDATE ON public.manufacturing_partners
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_set_updated_at ON public.subcontractors;
CREATE TRIGGER trg_set_updated_at
  BEFORE UPDATE ON public.subcontractors
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. units.manufacturing_partner_id + completion attribution
-- ---------------------------------------------------------------------------
-- NOT NULL DEFAULT means the backfill IS the default: every existing unit becomes
-- internal, which is exactly today's behaviour. ON DELETE SET DEFAULT returns a
-- deleted partner's units to the in-house factory rather than orphaning them.
ALTER TABLE public.units
  ADD COLUMN IF NOT EXISTS manufacturing_partner_id TEXT NOT NULL DEFAULT 'mp-internal'
    REFERENCES public.manufacturing_partners(id) ON DELETE SET DEFAULT;

CREATE INDEX IF NOT EXISTS idx_units_manufacturing_partner_id
  ON public.units (manufacturing_partner_id);

-- When the unit was handed to its current partner. The subcontractor's work list
-- is ordered oldest-first by the day the unit entered THEIR queue, which is the
-- later of this and all_measured_at (a unit assigned before measuring is not yet
-- manufacturable, so it only appears once measurement completes).
ALTER TABLE public.units
  ADD COLUMN IF NOT EXISTS manufacturing_assigned_at TIMESTAMPTZ;

ALTER TABLE public.window_production_status
  ADD COLUMN IF NOT EXISTS completed_by_subcontractor_id TEXT
    REFERENCES public.subcontractors(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 3. Role registration
-- ---------------------------------------------------------------------------
ALTER TABLE public.user_profiles
  DROP CONSTRAINT IF EXISTS user_profiles_role_check;
ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_role_check
  CHECK (role IN ('owner', 'installer', 'cutter', 'client', 'scheduler',
                  'assembler', 'qc', 'subcontractor'));

ALTER TABLE public.unit_activity_log
  DROP CONSTRAINT IF EXISTS unit_activity_log_actor_role_check;
ALTER TABLE public.unit_activity_log
  ADD CONSTRAINT unit_activity_log_actor_role_check
  CHECK (actor_role IN ('owner', 'installer', 'cutter', 'scheduler',
                        'assembler', 'qc', 'subcontractor', 'system'));

-- ---------------------------------------------------------------------------
-- 4. RLS helpers
-- ---------------------------------------------------------------------------
-- Same shape as public.auth_scheduler_id() (20260713170000).
CREATE OR REPLACE FUNCTION public.auth_partner_id()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT partner_id FROM subcontractors WHERE auth_user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.auth_partner_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_partner_id() TO authenticated, service_role;

-- Copied verbatim from 20260713170000 with one added branch. A subcontractor sees
-- only units assigned to their own partner — unlike cutter/assembler/qc, who see
-- the whole facility.
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
    WHEN 'subcontractor' THEN EXISTS (
      SELECT 1
      FROM units u
      WHERE u.id = p_unit_id
        AND u.manufacturing_partner_id = public.auth_partner_id()
    )
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

-- Column immutability. Copied verbatim from 20260713170000 with
-- manufacturing_partner_id added: a subcontractor holds units UPDATE (they need
-- it for units.status via recomputeUnitStatus), so without this guard they could
-- reassign any unit — including one of a rival partner's — to themselves.
CREATE OR REPLACE FUNCTION public.units_guard_ownership_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') = 'service_role' THEN
    RETURN NEW;
  END IF;

  v_role := public.get_user_role();

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
     OR NEW.manufacturing_partner_id IS DISTINCT FROM OLD.manufacturing_partner_id THEN
    RAISE EXCEPTION 'Only owner/scheduler may change a unit''s installer, building, client, or manufacturing partner'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. RLS policies
-- ---------------------------------------------------------------------------
-- manufacturing_partners: staff read (the assign pickers and the dashboard filter
-- need names); owner writes.
DROP POLICY IF EXISTS mfg_partners_select_staff ON public.manufacturing_partners;
CREATE POLICY mfg_partners_select_staff ON public.manufacturing_partners
  FOR SELECT TO authenticated
  USING (
    (SELECT public.get_user_role()) IN
      ('owner', 'scheduler', 'installer', 'cutter', 'assembler', 'qc', 'subcontractor')
  );
DROP POLICY IF EXISTS mfg_partners_insert_owner ON public.manufacturing_partners;
CREATE POLICY mfg_partners_insert_owner ON public.manufacturing_partners
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.get_user_role()) = 'owner');
DROP POLICY IF EXISTS mfg_partners_update_owner ON public.manufacturing_partners;
CREATE POLICY mfg_partners_update_owner ON public.manufacturing_partners
  FOR UPDATE TO authenticated
  USING ((SELECT public.get_user_role()) = 'owner')
  WITH CHECK ((SELECT public.get_user_role()) = 'owner');
DROP POLICY IF EXISTS mfg_partners_delete_owner ON public.manufacturing_partners;
CREATE POLICY mfg_partners_delete_owner ON public.manufacturing_partners
  FOR DELETE TO authenticated
  USING ((SELECT public.get_user_role()) = 'owner');

-- subcontractors: self or owner. Mirrors qcs_select_scoped exactly.
DROP POLICY IF EXISTS subcontractors_select_scoped ON public.subcontractors;
CREATE POLICY subcontractors_select_scoped ON public.subcontractors
  FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid() OR (SELECT public.get_user_role()) = 'owner');
DROP POLICY IF EXISTS subcontractors_insert_owner ON public.subcontractors;
CREATE POLICY subcontractors_insert_owner ON public.subcontractors
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.get_user_role()) = 'owner');
DROP POLICY IF EXISTS subcontractors_update_owner ON public.subcontractors;
CREATE POLICY subcontractors_update_owner ON public.subcontractors
  FOR UPDATE TO authenticated
  USING ((SELECT public.get_user_role()) = 'owner')
  WITH CHECK ((SELECT public.get_user_role()) = 'owner');
DROP POLICY IF EXISTS subcontractors_delete_owner ON public.subcontractors;
CREATE POLICY subcontractors_delete_owner ON public.subcontractors
  FOR DELETE TO authenticated
  USING ((SELECT public.get_user_role()) = 'owner');

-- units: add the subcontractor to SELECT and UPDATE, scoped to their partner.
-- Copied verbatim from 20260713170000 with the new branch; rooms/windows/
-- window_production_status SELECT need no edit because they route through
-- can_access_unit / can_access_room, which already know about the role.
DROP POLICY IF EXISTS units_select_scoped ON units;
CREATE POLICY units_select_scoped ON units FOR SELECT TO authenticated
  USING (
    (SELECT public.get_user_role()) IN ('owner', 'cutter', 'assembler', 'qc')
    OR (
      (SELECT public.get_user_role()) = 'subcontractor'
      AND manufacturing_partner_id = (SELECT public.auth_partner_id())
    )
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

-- UPDATE is needed because recomputeUnitStatus() writes units.status on the
-- user-context client after a partner marks work complete. The guard trigger
-- above is what stops that turning into a reassignment.
DROP POLICY IF EXISTS units_update_scoped ON units;
CREATE POLICY units_update_scoped ON units FOR UPDATE TO authenticated
  USING (
    (SELECT public.get_user_role()) IN ('owner', 'cutter', 'assembler', 'qc')
    OR (
      (SELECT public.get_user_role()) = 'subcontractor'
      AND manufacturing_partner_id = (SELECT public.auth_partner_id())
    )
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
      (SELECT public.get_user_role()) = 'subcontractor'
      AND manufacturing_partner_id = (SELECT public.auth_partner_id())
    )
    OR (
      (SELECT public.get_user_role()) = 'installer'
      AND assigned_installer_id = (SELECT public.auth_installer_id())
    )
  );

-- window_production_status: the partner's write path. Unlike the internal roles,
-- theirs is unit-scoped — cutter/assembler/qc may write any row in the facility,
-- a subcontractor only rows belonging to their own partner's units.
DROP POLICY IF EXISTS wps_insert_mfg ON window_production_status;
CREATE POLICY wps_insert_mfg ON window_production_status FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.get_user_role()) IN ('owner', 'cutter', 'assembler', 'qc')
    OR (
      (SELECT public.get_user_role()) = 'subcontractor'
      AND public.can_access_unit(unit_id)
    )
  );
DROP POLICY IF EXISTS wps_update_mfg ON window_production_status;
CREATE POLICY wps_update_mfg ON window_production_status FOR UPDATE TO authenticated
  USING (
    (SELECT public.get_user_role()) IN ('owner', 'cutter', 'assembler', 'qc')
    OR (
      (SELECT public.get_user_role()) = 'subcontractor'
      AND public.can_access_unit(unit_id)
    )
  )
  WITH CHECK (
    (SELECT public.get_user_role()) IN ('owner', 'cutter', 'assembler', 'qc')
    OR (
      (SELECT public.get_user_role()) = 'subcontractor'
      AND public.can_access_unit(unit_id)
    )
  );

-- ---------------------------------------------------------------------------
-- 6. get_owner_dataset — ship the partner id and the partner list
-- ---------------------------------------------------------------------------
-- Copied verbatim from 20260805130000 (D1 projection + installed_at +
-- current_stage) with two added keys: 'manufacturing_partner_id' on each unit and
-- a top-level 'manufacturing_partners' array. The client resolves partner NAMES
-- from that array rather than us denormalising a name onto units — realtime
-- postgres_changes ships raw unit columns, so an id survives a live update and a
-- joined name would not.
--
-- get_full_dataset and get_scheduler_dataset need no change: both project units
-- with row_to_json(u.*), so the new column rides along automatically.
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
          'manufacturing_assigned_at', u.manufacturing_assigned_at
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

-- ---------------------------------------------------------------------------
-- 7. get_subcontractor_worklist — the partner portal's single read
-- ---------------------------------------------------------------------------
-- One round trip returning units + rooms + windows + production for the caller's
-- partner. Scoped to units where every window has been measured
-- (all_measured_at IS NOT NULL) — that is the same readiness gate the internal
-- cutter queue applies, and it is the point at which a unit is manufacturable.
--
-- The fail-closed COALESCE(<allow>, false) wrapper is load-bearing and matches
-- every other dataset RPC: `IF NOT (x OR NULL)` would skip the RAISE and leak.
-- Clients/buildings are deliberately absent — the cut list reads
-- units.building_name / units.client_name, which are denormalised on the unit.
CREATE OR REPLACE FUNCTION public.get_subcontractor_worklist()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result     jsonb;
  v_partner  text;
BEGIN
  IF NOT COALESCE(
    COALESCE(auth.jwt() ->> 'role', '') = 'service_role'
    OR public.get_user_role() = 'subcontractor'
  , false) THEN
    RAISE EXCEPTION 'Access denied: subcontractor role required'
      USING ERRCODE = '42501';
  END IF;

  v_partner := public.auth_partner_id();
  IF v_partner IS NULL THEN
    RAISE EXCEPTION 'Access denied: no manufacturing partner linked to this account'
      USING ERRCODE = '42501';
  END IF;

  WITH scoped_units AS (
    SELECT u.*
    FROM units u
    WHERE u.manufacturing_partner_id = v_partner
      AND u.all_measured_at IS NOT NULL
  )
  SELECT jsonb_build_object(
    'partner',
      (SELECT row_to_json(mp.*) FROM manufacturing_partners mp WHERE mp.id = v_partner),
    'units',
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', su.id,
          'building_id', su.building_id,
          'client_id', su.client_id,
          'unit_number', su.unit_number,
          'building_name', su.building_name,
          'client_name', su.client_name,
          'installation_date', su.installation_date,
          'complete_by_date', su.complete_by_date,
          'status', su.status,
          'all_measured_at', su.all_measured_at,
          'manufacturing_assigned_at', su.manufacturing_assigned_at,
          'production_entered_at', su.production_entered_at
        ) ORDER BY su.unit_number)
        FROM scoped_units su
      ), '[]'::jsonb),
    'rooms',
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', r.id, 'unit_id', r.unit_id, 'name', r.name)
                         ORDER BY r.name)
        FROM rooms r
        WHERE r.unit_id IN (SELECT id FROM scoped_units)
      ), '[]'::jsonb),
    'windows',
      COALESCE((
        SELECT jsonb_agg(row_to_json(w.*) ORDER BY w.label)
        FROM windows w
        WHERE w.unit_id IN (SELECT id FROM scoped_units)
      ), '[]'::jsonb),
    'production',
      COALESCE((
        SELECT jsonb_agg(row_to_json(p.*))
        FROM window_production_status p
        WHERE p.unit_id IN (SELECT id FROM scoped_units)
      ), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_subcontractor_worklist() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_subcontractor_worklist() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8. EXCLUSIVITY: a unit is never actionable by both sides at once
-- ---------------------------------------------------------------------------
-- THE INVARIANT: the exact same window must never appear in the in-house factory
-- queues AND a subcontractor's work list. Building the same blind twice is the
-- expensive failure this whole feature has to avoid.
--
-- `units.manufacturing_partner_id` is a single column, so ownership is exclusive
-- by construction. The danger is not the data model — it is the two READ paths
-- disagreeing about it:
--
--   internal side  → window_manufacturing_schedule rows (get_role_schedule)
--   partner side   → manufacturing_partner_id = auth_partner_id()
--
-- Those are different predicates. reflowManufacturingSchedules deletes schedule
-- rows for reassigned units, but that runs in Next's after() — so between the
-- UPDATE committing and the purge landing (or forever, if the purge fails or the
-- process restarts) a reassigned unit satisfied BOTH predicates. That window is
-- closed here by making the internal read derive from the SAME column the
-- partner read uses, so the two sets are provably disjoint no matter what state
-- the schedule table is in.
--
-- Copied verbatim from 20260721120000 (archive read dedupe); the only change is
-- the `JOIN units` filter on the `src` CTE, which every other key derives from,
-- plus manufacturing_partner_id on the units projection for the TS-side assert.
CREATE OR REPLACE FUNCTION public.get_role_schedule(
  p_date_column text,
  p_include_archived boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF p_date_column NOT IN (
    'scheduled_cut_date', 'scheduled_assembly_date', 'scheduled_qc_date'
  ) THEN
    RAISE EXCEPTION 'get_role_schedule: invalid date column %', p_date_column;
  END IF;

  WITH src AS (
    SELECT
      s.id, s.window_id, s.unit_id, s.target_ready_date, s.scheduled_cut_date,
      s.scheduled_assembly_date, s.scheduled_qc_date, s.manual_priority,
      s.is_schedule_locked, s.lock_reason, s.last_reschedule_reason,
      s.over_capacity_override, s.moved_by_user_id, s.moved_at
    FROM window_manufacturing_schedule s
    JOIN units u ON u.id = s.unit_id
    JOIN manufacturing_partners mp ON mp.id = u.manufacturing_partner_id
    WHERE mp.is_internal
    UNION ALL
    SELECT
      a.id, a.window_id, a.unit_id, a.target_ready_date, a.scheduled_cut_date,
      a.scheduled_assembly_date, a.scheduled_qc_date, a.manual_priority,
      a.is_schedule_locked, a.lock_reason, a.last_reschedule_reason,
      a.over_capacity_override, a.moved_by_user_id, a.moved_at
    FROM window_manufacturing_schedule_archive a
    JOIN units u2 ON u2.id = a.unit_id
    JOIN manufacturing_partners mp2 ON mp2.id = u2.manufacturing_partner_id
    WHERE p_include_archived
      AND mp2.is_internal
      AND NOT EXISTS (
        SELECT 1 FROM window_manufacturing_schedule s2
        WHERE s2.window_id = a.window_id
      )
  )
  SELECT jsonb_build_object(
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
      FROM src s
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
        'production_entered_at', u.production_entered_at,
        'manufacturing_partner_id', u.manufacturing_partner_id
      ))
      FROM units u
      WHERE u.id IN (SELECT DISTINCT unit_id FROM src)
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
      WHERE w.id IN (SELECT DISTINCT window_id FROM src)
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
      WHERE p.window_id IN (SELECT DISTINCT window_id FROM src)
    ), '[]'::jsonb),

    'rooms', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name))
      FROM rooms r
      WHERE r.id IN (
        SELECT DISTINCT w.room_id
        FROM windows w
        WHERE w.id IN (SELECT DISTINCT window_id FROM src)
      )
    ), '[]'::jsonb),

    'escalations', COALESCE((
      SELECT jsonb_agg(row_to_json(e.*) ORDER BY e.opened_at DESC)
      FROM window_manufacturing_escalations e
      WHERE e.window_id IN (SELECT DISTINCT window_id FROM src)
    ), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_role_schedule(text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_role_schedule(text, boolean) TO authenticated, service_role;

CREATE INDEX IF NOT EXISTS idx_wms_unit_id ON public.window_manufacturing_schedule (unit_id);

-- ---------------------------------------------------------------------------
-- 9. EXCLUSIVITY, write side: nobody can record work on the other side's unit
-- ---------------------------------------------------------------------------
-- The read filters above stop a unit from APPEARING in both places. This stops
-- the write even if it somehow does — a stale browser tab, a cached RSC payload,
-- a bookmarked /cutter/units/<id>, or a replayed server action. Marking a blind
-- cut/assembled/qc-approved all flows through window_production_status, so one
-- trigger covers every one of those paths, present and future.
--
-- Deliberately narrow: it rejects ONLY the two cross-boundary cases and lets
-- everything else through, so it cannot break an unrelated writer. service_role
-- (reflow, admin backfills) and owner (repair/backfill actions) always pass.
CREATE OR REPLACE FUNCTION public.wps_guard_manufacturing_ownership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role       text;
  v_internal   boolean;
  v_partner    text;
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') = 'service_role' THEN
    RETURN NEW;
  END IF;

  v_role := public.get_user_role();
  IF v_role = 'owner' THEN
    RETURN NEW;
  END IF;

  SELECT mp.is_internal, u.manufacturing_partner_id
    INTO v_internal, v_partner
  FROM units u
  JOIN manufacturing_partners mp ON mp.id = u.manufacturing_partner_id
  WHERE u.id = NEW.unit_id;

  IF v_internal IS NULL THEN
    RETURN NEW;  -- unit vanished mid-statement; FK will deal with it
  END IF;

  IF v_internal AND v_role = 'subcontractor' THEN
    RAISE EXCEPTION 'This unit is manufactured in-house — a subcontractor cannot record work on it'
      USING ERRCODE = '42501';
  END IF;

  IF NOT v_internal AND v_role IN ('cutter', 'assembler', 'qc') THEN
    RAISE EXCEPTION 'This unit is manufactured by a subcontractor — in-house roles cannot record work on it'
      USING ERRCODE = '42501';
  END IF;

  IF NOT v_internal AND v_role = 'subcontractor'
     AND v_partner IS DISTINCT FROM public.auth_partner_id() THEN
    RAISE EXCEPTION 'This unit belongs to a different manufacturer'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS wps_guard_manufacturing_ownership ON public.window_production_status;
CREATE TRIGGER wps_guard_manufacturing_ownership
  BEFORE INSERT OR UPDATE ON public.window_production_status
  FOR EACH ROW
  EXECUTE FUNCTION public.wps_guard_manufacturing_ownership();

-- ============================================================
-- DOWN (reversible)
-- ============================================================
-- DROP TRIGGER IF EXISTS wps_guard_manufacturing_ownership ON public.window_production_status;
-- DROP FUNCTION IF EXISTS public.wps_guard_manufacturing_ownership();
-- DROP FUNCTION IF EXISTS public.get_subcontractor_worklist();
-- Re-apply 20260721120000 for get_role_schedule.
-- ALTER TABLE public.window_production_status DROP COLUMN IF EXISTS completed_by_subcontractor_id;
-- ALTER TABLE public.units DROP COLUMN IF EXISTS manufacturing_assigned_at;
-- ALTER TABLE public.units DROP COLUMN IF EXISTS manufacturing_partner_id;
-- DROP TABLE IF EXISTS public.subcontractors;
-- DROP TABLE IF EXISTS public.manufacturing_partners;
-- DROP FUNCTION IF EXISTS public.auth_partner_id();
-- Then re-apply 20260713170000 for can_access_unit / units_guard_ownership_columns
-- / units_select_scoped / units_update_scoped / wps_insert_mfg / wps_update_mfg,
-- and 20260805130000 for get_owner_dataset.
