-- Manufacturing stations: a second in-house station, walled off from the first.
--
-- CONTEXT. In-house manufacturing has been one undifferentiated factory: every
-- cutter/assembler/QC account could see and act on every internal unit, and
-- `manufacturing_partners` enforced (by unique index) that exactly ONE row was
-- internal. FSR has opened a second station whose staff must not be able to read
-- the first station's work at all.
--
-- MODEL. A station IS a `manufacturing_partners` row with is_internal = true.
-- Station A is the existing 'mp-internal' row, renamed; Station B is new. So
-- `units.manufacturing_partner_id` — one column, already NOT NULL, indexed and
-- FK'd — keeps being the single answer to "who builds this", now three-way:
-- Station A, Station B, or a subcontractor. Staff accounts gain
-- `station_id` on cutters/assemblers/qcs, resolved in RLS by auth_station_id().
--
-- Because 'mp-internal' keeps its id, every existing internal unit and every
-- existing staff account stays where it is. The NOT NULL DEFAULT on station_id
-- IS the backfill, the trick units.manufacturing_partner_id used in 20260806120000.
--
-- THREE RULES this migration exists to uphold (see docs/MANUFACTURING_STATIONS.md):
--   1. The station lives in exactly ONE column. Never denormalise station onto
--      windows / window_production_status / window_manufacturing_schedule — the
--      gap between updating two copies IS the double-build window.
--   2. An internal→internal move never DELETEs a schedule row. Queue membership
--      is "has schedule rows AND the unit's partner is mine"; delete the rows and
--      the unit silently vanishes from every queue.
--   3. Never rewrite attribution on a move. cut_by_cutter_id keeps pointing at
--      whoever cut it; their station is recoverable via cutters.station_id.
--
-- DELIBERATELY NOT CHANGED: no new role, no new portal, no new pipeline stage,
-- no new window_production_status value, no change to UnitStatus. The three
-- existing manufacturing roles simply gain a station.
--
-- Rollback: see the DOWN block at the foot of this file.

-- ---------------------------------------------------------------------------
-- 1. More than one internal partner becomes possible
-- ---------------------------------------------------------------------------
-- The guarantee this index provided ("exactly one internal row", so TS could
-- compare against the INTERNAL_PARTNER_ID constant instead of joining) is
-- precisely what a second station lifts. src/lib/manufacturing-partners.ts is
-- updated in the same change to resolve internality from the partner list.
DROP INDEX IF EXISTS public.idx_manufacturing_partners_single_internal;

UPDATE public.manufacturing_partners
   SET name = 'Station A'
 WHERE id = 'mp-internal' AND name = 'FSR Internal';

INSERT INTO public.manufacturing_partners (id, name, is_internal)
VALUES ('mp-station-b', 'Station B', true)
ON CONFLICT (id) DO NOTHING;

-- Partial index replacing the unique one: the internal set is read on every
-- reflow and by purgeExternalSchedules, and it is tiny.
CREATE INDEX IF NOT EXISTS idx_manufacturing_partners_internal
  ON public.manufacturing_partners (id) WHERE is_internal;

-- ---------------------------------------------------------------------------
-- 2. Staff accounts belong to a station
-- ---------------------------------------------------------------------------
-- NOT NULL DEFAULT means the backfill IS the default: every existing cutter,
-- assembler and QC lands on Station A, which is exactly today's behaviour.
-- ON DELETE SET DEFAULT returns a deleted station's staff to Station A rather
-- than breaking their login.
ALTER TABLE public.cutters
  ADD COLUMN IF NOT EXISTS station_id TEXT NOT NULL DEFAULT 'mp-internal'
    REFERENCES public.manufacturing_partners(id) ON DELETE SET DEFAULT;
ALTER TABLE public.assemblers
  ADD COLUMN IF NOT EXISTS station_id TEXT NOT NULL DEFAULT 'mp-internal'
    REFERENCES public.manufacturing_partners(id) ON DELETE SET DEFAULT;
ALTER TABLE public.qcs
  ADD COLUMN IF NOT EXISTS station_id TEXT NOT NULL DEFAULT 'mp-internal'
    REFERENCES public.manufacturing_partners(id) ON DELETE SET DEFAULT;

CREATE INDEX IF NOT EXISTS idx_cutters_station_id    ON public.cutters (station_id);
CREATE INDEX IF NOT EXISTS idx_assemblers_station_id ON public.assemblers (station_id);
CREATE INDEX IF NOT EXISTS idx_qcs_station_id        ON public.qcs (station_id);

-- A CHECK constraint cannot span tables, so the "a station is never a vendor"
-- invariant needs a trigger. Without it an owner could attach a cutter to
-- Progressive Distribution, and auth_station_id() would then hand that cutter
-- read access to a subcontractor's units — the exact wall this migration builds.
-- Fail-closed COALESCE(..., false): an unresolvable partner is rejected.
CREATE OR REPLACE FUNCTION public.assert_station_is_internal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT COALESCE((
    SELECT mp.is_internal FROM public.manufacturing_partners mp WHERE mp.id = NEW.station_id
  ), false) THEN
    RAISE EXCEPTION 'station_id must reference an in-house station, not a subcontractor (%)', NEW.station_id
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assert_station_is_internal ON public.cutters;
CREATE TRIGGER trg_assert_station_is_internal
  BEFORE INSERT OR UPDATE OF station_id ON public.cutters
  FOR EACH ROW EXECUTE FUNCTION public.assert_station_is_internal();

DROP TRIGGER IF EXISTS trg_assert_station_is_internal ON public.assemblers;
CREATE TRIGGER trg_assert_station_is_internal
  BEFORE INSERT OR UPDATE OF station_id ON public.assemblers
  FOR EACH ROW EXECUTE FUNCTION public.assert_station_is_internal();

DROP TRIGGER IF EXISTS trg_assert_station_is_internal ON public.qcs;
CREATE TRIGGER trg_assert_station_is_internal
  BEFORE INSERT OR UPDATE OF station_id ON public.qcs
  FOR EACH ROW EXECUTE FUNCTION public.assert_station_is_internal();

-- ---------------------------------------------------------------------------
-- 3. Capacity is per station; the working calendar is not
-- ---------------------------------------------------------------------------
-- Only the three *_daily_capacity columns are per-station: a station has its own
-- people and its own throughput. `apply_ontario_holidays` and
-- `manufacturing_calendar_overrides` describe the BUILDING and stay facility-wide
-- — which is why recomputeManufacturingRiskFlags (src/lib/manufacturing-risk.ts),
-- whose only use of settings is addWorkingDays, needs no station awareness.
--
-- `id` stays the opaque PK (adding a column beats mutating a primary key value);
-- station_id is the real key from here on and reads use .eq("station_id", …).
ALTER TABLE public.manufacturing_settings
  ADD COLUMN IF NOT EXISTS station_id TEXT NOT NULL DEFAULT 'mp-internal'
    REFERENCES public.manufacturing_partners(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_manufacturing_settings_station
  ON public.manufacturing_settings (station_id);

-- Station B starts with Station A's numbers; the owner tunes them in
-- /management/settings. Copied rather than defaulted so a facility that has
-- already tuned Station A does not silently get 30/30/30 for the new line.
INSERT INTO public.manufacturing_settings (
  id, station_id, cutter_daily_capacity, assembler_daily_capacity,
  qc_daily_capacity, apply_ontario_holidays
)
SELECT 'mp-station-b', 'mp-station-b', s.cutter_daily_capacity,
       s.assembler_daily_capacity, s.qc_daily_capacity, s.apply_ontario_holidays
FROM public.manufacturing_settings s
WHERE s.station_id = 'mp-internal'
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. RLS helper: which station is the caller's?
-- ---------------------------------------------------------------------------
-- Same shape as public.auth_partner_id() (20260806120000:126). One auth user is
-- in at most one of the three role tables, so the UNION ALL has at most one row.
-- Returns NULL only for a non-station user; because station_id is NOT NULL, the
-- fail-closed direction (a real cutter seeing nothing) is unreachable.
CREATE OR REPLACE FUNCTION public.auth_station_id()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT station_id FROM cutters    WHERE auth_user_id = auth.uid()
  UNION ALL
  SELECT station_id FROM assemblers WHERE auth_user_id = auth.uid()
  UNION ALL
  SELECT station_id FROM qcs        WHERE auth_user_id = auth.uid()
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.auth_station_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_station_id() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. can_access_unit — the one predicate the whole subtree hangs off
-- ---------------------------------------------------------------------------
-- Copied verbatim from 20260806120000:140-182 with three branches changed:
-- cutter/assembler/qc were unconditionally `true` (they saw the whole facility)
-- and are now scoped to their own station's units.
--
-- This is the highest-leverage edit in the migration: rooms, windows,
-- window_production_status and window_manufacturing_escalations all route their
-- SELECT policies through can_access_unit / can_access_room, so the entire
-- subtree scopes for free — the same leverage the subcontractor migration took.
--
-- NOTE the asymmetry for UNROUTED units (manufacturing_assigned_at IS NULL):
-- they carry the column default 'mp-internal', so Station A staff can see them
-- and Station B staff cannot. Harmless — an unrouted unit is in nobody's queue
-- (MR3, 20260810130000) and is escalated by the dashboard's own bucket.
CREATE OR REPLACE FUNCTION public.can_access_unit(p_unit_id text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE public.get_user_role()
    WHEN 'owner' THEN true
    WHEN 'cutter' THEN EXISTS (
      SELECT 1
      FROM units u
      WHERE u.id = p_unit_id
        AND u.manufacturing_partner_id = public.auth_station_id()
    )
    WHEN 'assembler' THEN EXISTS (
      SELECT 1
      FROM units u
      WHERE u.id = p_unit_id
        AND u.manufacturing_partner_id = public.auth_station_id()
    )
    WHEN 'qc' THEN EXISTS (
      SELECT 1
      FROM units u
      WHERE u.id = p_unit_id
        AND u.manufacturing_partner_id = public.auth_station_id()
    )
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

-- ---------------------------------------------------------------------------
-- 6. units policies — copied whole from 20260806120000:281-351
-- ---------------------------------------------------------------------------
-- Only the internal-role arm changes: the blanket
-- `role IN ('owner','cutter','assembler','qc')` splits into owner (blanket) and
-- the three station roles (scoped to their station).
DROP POLICY IF EXISTS units_select_scoped ON units;
CREATE POLICY units_select_scoped ON units FOR SELECT TO authenticated
  USING (
    (SELECT public.get_user_role()) = 'owner'
    OR (
      (SELECT public.get_user_role()) IN ('cutter', 'assembler', 'qc')
      AND manufacturing_partner_id = (SELECT public.auth_station_id())
    )
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
-- user-context client after work is recorded. units_guard_ownership_columns is
-- what stops that turning into a reassignment — its catch-all already rejects
-- cutter/assembler/qc changing manufacturing_partner_id, so a cutter cannot pull
-- another station's unit onto their own line.
DROP POLICY IF EXISTS units_update_scoped ON units;
CREATE POLICY units_update_scoped ON units FOR UPDATE TO authenticated
  USING (
    (SELECT public.get_user_role()) = 'owner'
    OR (
      (SELECT public.get_user_role()) IN ('cutter', 'assembler', 'qc')
      AND manufacturing_partner_id = (SELECT public.auth_station_id())
    )
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
    (SELECT public.get_user_role()) IN ('owner', 'scheduler')
    OR (
      (SELECT public.get_user_role()) IN ('cutter', 'assembler', 'qc')
      AND manufacturing_partner_id = (SELECT public.auth_station_id())
    )
    OR (
      (SELECT public.get_user_role()) = 'subcontractor'
      AND manufacturing_partner_id = (SELECT public.auth_partner_id())
    )
    OR (
      (SELECT public.get_user_role()) = 'installer'
      AND assigned_installer_id = (SELECT public.auth_installer_id())
    )
  );

-- ---------------------------------------------------------------------------
-- 7. window_production_status + window_manufacturing_schedule write policies
-- ---------------------------------------------------------------------------
-- These carried a blanket `role IN ('owner','cutter','assembler','qc')` with no
-- unit scoping at all, which under stations would let a Station A cutter record
-- work on a Station B unit.
--
-- CAREFUL: the fix is NOT `USING (can_access_unit(unit_id))` alone. That
-- predicate is true for installers and schedulers on their own units, so
-- dropping the role list would newly GRANT them production writes they have
-- never had. Role gate AND unit scope, both.
DROP POLICY IF EXISTS wps_insert_mfg ON window_production_status;
CREATE POLICY wps_insert_mfg ON window_production_status FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.get_user_role()) = 'owner'
    OR (
      (SELECT public.get_user_role()) IN ('cutter', 'assembler', 'qc', 'subcontractor')
      AND public.can_access_unit(unit_id)
    )
  );

DROP POLICY IF EXISTS wps_update_mfg ON window_production_status;
CREATE POLICY wps_update_mfg ON window_production_status FOR UPDATE TO authenticated
  USING (
    (SELECT public.get_user_role()) = 'owner'
    OR (
      (SELECT public.get_user_role()) IN ('cutter', 'assembler', 'qc', 'subcontractor')
      AND public.can_access_unit(unit_id)
    )
  )
  WITH CHECK (
    (SELECT public.get_user_role()) = 'owner'
    OR (
      (SELECT public.get_user_role()) IN ('cutter', 'assembler', 'qc', 'subcontractor')
      AND public.can_access_unit(unit_id)
    )
  );

-- window_manufacturing_schedule: the manual shift/lock actions in the portals.
-- installer/scheduler keep their existing blanket SELECT deliberately — narrowing
-- them is unrelated to stations and would be an untested behaviour change. Only
-- the three station roles are scoped.
DROP POLICY IF EXISTS wms_select_staff ON window_manufacturing_schedule;
CREATE POLICY wms_select_staff ON window_manufacturing_schedule FOR SELECT TO authenticated
  USING (
    (SELECT public.get_user_role()) IN ('owner', 'installer', 'scheduler')
    OR (
      (SELECT public.get_user_role()) IN ('cutter', 'assembler', 'qc')
      AND public.can_access_unit(unit_id)
    )
  );

DROP POLICY IF EXISTS wms_insert_mfg ON window_manufacturing_schedule;
CREATE POLICY wms_insert_mfg ON window_manufacturing_schedule FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.get_user_role()) = 'owner'
    OR (
      (SELECT public.get_user_role()) IN ('cutter', 'assembler', 'qc')
      AND public.can_access_unit(unit_id)
    )
  );

DROP POLICY IF EXISTS wms_update_mfg ON window_manufacturing_schedule;
CREATE POLICY wms_update_mfg ON window_manufacturing_schedule FOR UPDATE TO authenticated
  USING (
    (SELECT public.get_user_role()) = 'owner'
    OR (
      (SELECT public.get_user_role()) IN ('cutter', 'assembler', 'qc')
      AND public.can_access_unit(unit_id)
    )
  )
  WITH CHECK (
    (SELECT public.get_user_role()) = 'owner'
    OR (
      (SELECT public.get_user_role()) IN ('cutter', 'assembler', 'qc')
      AND public.can_access_unit(unit_id)
    )
  );

DROP POLICY IF EXISTS wms_delete_mfg ON window_manufacturing_schedule;
CREATE POLICY wms_delete_mfg ON window_manufacturing_schedule FOR DELETE TO authenticated
  USING (
    (SELECT public.get_user_role()) = 'owner'
    OR (
      (SELECT public.get_user_role()) IN ('cutter', 'assembler', 'qc')
      AND public.can_access_unit(unit_id)
    )
  );

-- ---------------------------------------------------------------------------
-- 8. The write guard learns the cross-station case
-- ---------------------------------------------------------------------------
-- Copied verbatim from 20260806120000:771-825 with ONE added rejection. The read
-- filters stop a unit APPEARING in two stations; this stops the write even if it
-- somehow does — a stale browser tab, a cached RSC payload, a bookmarked
-- /cutter/units/<id>, or a replayed server action. Every mark-cut/assembled/
-- QC'd path writes this one table, so one trigger covers every screen.
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
  v_name       text;
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') = 'service_role' THEN
    RETURN NEW;
  END IF;

  v_role := public.get_user_role();
  IF v_role = 'owner' THEN
    RETURN NEW;
  END IF;

  SELECT mp.is_internal, u.manufacturing_partner_id, mp.name
    INTO v_internal, v_partner, v_name
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

  -- NEW: the cross-station case. Names the owning station so a stale tab tells
  -- the operator what actually happened instead of failing opaquely.
  IF v_internal AND v_role IN ('cutter', 'assembler', 'qc')
     AND v_partner IS DISTINCT FROM public.auth_station_id() THEN
    RAISE EXCEPTION 'This unit is now built at % — it is not your station''s work', v_name
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

-- Trigger definition unchanged; re-asserted so a partial rollback cannot leave
-- the table without it.
DROP TRIGGER IF EXISTS wps_guard_manufacturing_ownership ON public.window_production_status;
CREATE TRIGGER wps_guard_manufacturing_ownership
  BEFORE INSERT OR UPDATE ON public.window_production_status
  FOR EACH ROW
  EXECUTE FUNCTION public.wps_guard_manufacturing_ownership();

-- ---------------------------------------------------------------------------
-- 9. The lock becomes pair-aware — this is what makes station moves possible
-- ---------------------------------------------------------------------------
-- `is_manufacturing_locked` needs NO change: it already reads is_internal from
-- the table (20260810140000:70), so it classifies both stations as internal.
--
-- What changes is when the lock BINDS. Moving a unit between two in-house
-- stations is a relocation: the blinds walk down the hall, every
-- window_production_status row travels untouched, nothing is rebuilt. Moving
-- across the in-house↔vendor boundary is a transfer that really does cost ~$100
-- a blind to rebuild, and keeps every MR4a/MR4b rule.
--
-- Copied verbatim from 20260810140000:143-214; the only change is v_relocation
-- gating the lock check.
--
-- Note the two COALESCE directions differ ON PURPOSE. is_manufacturing_locked
-- reads an unknown partner as internal (its column default). Here an
-- undeterminable side must NOT count as a relocation, because that would SKIP
-- the lock — so unknown coalesces to false and the lock check runs. The FK makes
-- both lookups total anyway; this is belt-and-braces.
CREATE OR REPLACE FUNCTION public.units_guard_ownership_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role        text;
  v_changed     boolean;
  v_locked      boolean;
  v_old_internal boolean;
  v_new_internal boolean;
  v_relocation  boolean;
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
    SELECT mp.is_internal INTO v_old_internal
      FROM public.manufacturing_partners mp WHERE mp.id = OLD.manufacturing_partner_id;
    SELECT mp.is_internal INTO v_new_internal
      FROM public.manufacturing_partners mp WHERE mp.id = NEW.manufacturing_partner_id;
    v_relocation := COALESCE(v_old_internal, false) AND COALESCE(v_new_internal, false);

    IF NOT v_relocation THEN
      v_locked := public.is_manufacturing_locked(
        OLD.id, OLD.manufacturing_partner_id, OLD.production_entered_at, OLD.all_measured_at);
      IF v_locked AND NOT (v_role = 'owner'
           AND NEW.manufacturing_transfer_override_at IS NOT NULL
           AND NEW.manufacturing_transfer_override_at IS DISTINCT FROM OLD.manufacturing_transfer_override_at) THEN
        RAISE EXCEPTION 'Manufacturing has already started on this unit — only the owner may transfer it, with confirmation'
          USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  IF v_role = 'owner' THEN
    RETURN NEW;
  END IF;

  -- Schedulers may make the INITIAL manufacturer choice (which is now also the
  -- initial STATION choice), but not change it afterwards — re-routing, between
  -- stations or between companies, stays an owner decision.
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
-- 10. get_role_schedule — one station's queue, and a role gate it never had
-- ---------------------------------------------------------------------------
-- Copied verbatim from 20260810130000:101-252 with two changes:
--
--   1. STATION PREDICATE on both arms of `src`, the CTE every other key derives
--      from. cutter/assembler/qc are pinned to auth_station_id() and p_station_id
--      is IGNORED for them, so a crafted argument cannot widen scope. Owner (and
--      service_role) may pass a station, or NULL for every internal station.
--
--   2. A ROLE GATE. The function had none: it is SECURITY DEFINER and granted to
--      `authenticated`, so ANY signed-in user — an installer, a subcontractor —
--      could call it directly and read the whole factory schedule. That was
--      survivable when the in-house floor was one undifferentiated set; it is
--      exactly the wall this migration builds, so it is closed here. Verified
--      against every call site: cutter/assembler/qc portals and
--      /management/schedule (owner) only.
--
-- The DROP is mandatory. Adding a defaulted third parameter CREATEs a second
-- function rather than replacing the first, and PostgREST would then fail to
-- resolve the overload.
DROP FUNCTION IF EXISTS public.get_role_schedule(text, boolean);

CREATE OR REPLACE FUNCTION public.get_role_schedule(
  p_date_column text,
  p_include_archived boolean DEFAULT false,
  p_station_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result    jsonb;
  v_role    text;
  v_service boolean;
  v_station text;
BEGIN
  IF p_date_column NOT IN (
    'scheduled_cut_date', 'scheduled_assembly_date', 'scheduled_qc_date'
  ) THEN
    RAISE EXCEPTION 'get_role_schedule: invalid date column %', p_date_column;
  END IF;

  v_service := COALESCE(auth.jwt() ->> 'role', '') = 'service_role';
  v_role    := public.get_user_role();

  -- Fail-closed COALESCE(<allow>, false): `IF NOT (x OR NULL)` would skip the
  -- RAISE and leak the whole schedule.
  IF NOT COALESCE(
    v_service OR v_role IN ('owner', 'cutter', 'assembler', 'qc')
  , false) THEN
    RAISE EXCEPTION 'Access denied: manufacturing role required'
      USING ERRCODE = '42501';
  END IF;

  IF v_role IN ('cutter', 'assembler', 'qc') AND NOT v_service THEN
    v_station := public.auth_station_id();
    IF v_station IS NULL THEN
      RAISE EXCEPTION 'Access denied: no station linked to this account'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    v_station := p_station_id;  -- owner / service_role; NULL = all stations
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
      AND u.manufacturing_assigned_at IS NOT NULL
      AND (v_station IS NULL OR u.manufacturing_partner_id = v_station)
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
      AND u2.manufacturing_assigned_at IS NOT NULL
      AND (v_station IS NULL OR u2.manufacturing_partner_id = v_station)
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
        'manufacturing_partner_id', u.manufacturing_partner_id,
        'manufacturing_assigned_at', u.manufacturing_assigned_at
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

REVOKE ALL ON FUNCTION public.get_role_schedule(text, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_role_schedule(text, boolean, text)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 11. Guard: the migration must not have emptied a queue
-- ---------------------------------------------------------------------------
-- Same shape as 20260810130000's backfill guard: abort the transaction rather
-- than discover it in production. Every staff account must land on an internal
-- station, and Station A's queue must still contain exactly what it did before
-- (Station B has no units yet, so the internal set is unchanged by definition).
DO $$
DECLARE
  v_bad_station int;
  v_settings    int;
BEGIN
  SELECT count(*) INTO v_bad_station FROM (
    SELECT station_id FROM public.cutters
    UNION ALL SELECT station_id FROM public.assemblers
    UNION ALL SELECT station_id FROM public.qcs
  ) s
  WHERE NOT EXISTS (
    SELECT 1 FROM public.manufacturing_partners mp
    WHERE mp.id = s.station_id AND mp.is_internal
  );
  IF v_bad_station > 0 THEN
    RAISE EXCEPTION 'ABORT: % staff account(s) are not on an internal station', v_bad_station;
  END IF;

  SELECT count(*) INTO v_settings
  FROM public.manufacturing_settings ms
  JOIN public.manufacturing_partners mp ON mp.id = ms.station_id
  WHERE mp.is_internal;
  IF v_settings <> (SELECT count(*) FROM public.manufacturing_partners WHERE is_internal) THEN
    RAISE EXCEPTION 'ABORT: % settings row(s) for % internal station(s) — the reflow would use default capacities',
      v_settings, (SELECT count(*) FROM public.manufacturing_partners WHERE is_internal);
  END IF;
END $$;

-- ============================================================
-- DOWN (reversible)
-- ============================================================
-- Station B must have no units and no staff before rolling back, or its work
-- becomes invisible: re-apply the single-internal index would fail while two
-- internal rows exist.
--
-- UPDATE public.units SET manufacturing_partner_id = 'mp-internal',
--   manufacturing_assigned_at = NOW() WHERE manufacturing_partner_id = 'mp-station-b';
-- DELETE FROM public.manufacturing_settings WHERE station_id = 'mp-station-b';
-- DELETE FROM public.manufacturing_partners WHERE id = 'mp-station-b';
-- UPDATE public.manufacturing_partners SET name = 'FSR Internal' WHERE id = 'mp-internal';
-- DROP TRIGGER IF EXISTS trg_assert_station_is_internal ON public.cutters;
-- DROP TRIGGER IF EXISTS trg_assert_station_is_internal ON public.assemblers;
-- DROP TRIGGER IF EXISTS trg_assert_station_is_internal ON public.qcs;
-- DROP FUNCTION IF EXISTS public.assert_station_is_internal();
-- ALTER TABLE public.cutters    DROP COLUMN IF EXISTS station_id;
-- ALTER TABLE public.assemblers DROP COLUMN IF EXISTS station_id;
-- ALTER TABLE public.qcs        DROP COLUMN IF EXISTS station_id;
-- DROP INDEX IF EXISTS public.idx_manufacturing_settings_station;
-- ALTER TABLE public.manufacturing_settings DROP COLUMN IF EXISTS station_id;
-- DROP INDEX IF EXISTS public.idx_manufacturing_partners_internal;
-- CREATE UNIQUE INDEX idx_manufacturing_partners_single_internal
--   ON public.manufacturing_partners ((is_internal)) WHERE is_internal;
-- DROP FUNCTION IF EXISTS public.get_role_schedule(text, boolean, text);
-- DROP FUNCTION IF EXISTS public.auth_station_id();
-- Then re-apply 20260806120000 for can_access_unit / units_select_scoped /
-- units_update_scoped / wps_insert_mfg / wps_update_mfg /
-- wps_guard_manufacturing_ownership, 20260713170000 for the wms_* policies,
-- 20260810130000 for get_role_schedule, and 20260810140000 for
-- units_guard_ownership_columns.
