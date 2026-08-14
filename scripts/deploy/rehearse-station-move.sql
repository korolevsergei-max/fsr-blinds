-- ===========================================================================
-- REHEARSAL for 20260814120000_manufacturing_stations.sql — RUN BY A HUMAN
-- ===========================================================================
-- Applies the ENTIRE stations migration inside one transaction, moves a REAL
-- part-built unit from Station A to Station B, asserts that no work vanished and
-- that the queue membership flipped cleanly, then ROLLS BACK. Nothing is
-- committed — the migration is applied for real afterwards via
-- `supabase db push`, once every probe prints PASS.
--
-- HOW TO RUN (from the repo root):
--
--   supabase db query --linked --file scripts/deploy/rehearse-station-move.sql
--
-- or, with a direct connection string:
--
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
--     -f scripts/deploy/rehearse-station-move.sql
--
-- NOTE: the migration's ALTER TABLEs take brief ACCESS EXCLUSIVE locks on
-- cutters/assemblers/qcs/manufacturing_settings, held until the final ROLLBACK.
-- Run it at a quiet moment, not mid-shift.
--
-- WHAT IT PROVES (the three rules in docs/MANUFACTURING_STATIONS.md):
--   Rule 1 — the station lives in one column: the move is a single UPDATE and
--            every downstream read follows it with no second write.
--   Rule 2 — no schedule row is deleted: the row COUNT is identical before and
--            after, and the same window ids are still present.
--   Rule 3 — attribution is not rewritten: cut_by_cutter_id and the timestamps
--            are byte-identical after the move.
-- ===========================================================================

\set ON_ERROR_STOP on

BEGIN;

-- Probe results are collected here as well as raised, so they are readable both
-- under psql (which prints NOTICE) and under `supabase db query` (which does not).
CREATE TEMP TABLE _probe_log (seq serial, msg text);
-- SECURITY DEFINER because probes 2 and 3 call this while the session role is
-- `authenticated` (they impersonate a real owner/installer to exercise RLS and
-- the triggers), and that role has no rights on a temp table.
CREATE FUNCTION pg_temp.probe(p_msg text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $probe$
BEGIN
  INSERT INTO _probe_log (msg) VALUES (p_msg);
  RAISE NOTICE '%', p_msg;
END $probe$;

\echo '=== applying 20260814120000_manufacturing_stations.sql (transactional) ==='
\ir ../../supabase/migrations/20260814120000_manufacturing_stations.sql
\echo '=== migration applied inside transaction — running probes ==='

-- ---------------------------------------------------------------------------
-- Probe 0 — the migration's own preconditions actually held.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_stations int;
  v_settings int;
BEGIN
  SELECT count(*) INTO v_stations FROM manufacturing_partners WHERE is_internal;
  IF v_stations <> 2 THEN
    RAISE EXCEPTION 'FAIL probe 0: expected 2 internal stations, found %', v_stations;
  END IF;

  SELECT count(*) INTO v_settings
  FROM manufacturing_settings ms
  JOIN manufacturing_partners mp ON mp.id = ms.station_id
  WHERE mp.is_internal;
  IF v_settings <> 2 THEN
    RAISE EXCEPTION 'FAIL probe 0: expected 2 station capacity rows, found %', v_settings;
  END IF;

  PERFORM pg_temp.probe('PASS probe 0 — Station A + Station B exist, each with capacities');
END $$;

-- ---------------------------------------------------------------------------
-- Probe 1 — move a REAL part-built unit A → B and assert nothing was lost.
--
-- Picks the in-zone Station A unit with the most non-pending blinds, so the
-- rehearsal exercises the case that actually matters: work already on the floor.
-- Falls back to any in-zone unit if nothing is part-built yet.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_unit           text;
  v_unit_number    text;
  v_uid            uuid;
  v_wps_before     int;
  v_wps_after      int;
  v_started_before int;
  v_started_after  int;
  v_sched_before   int;
  v_sched_after    int;
  v_windows_before text;
  v_windows_after  text;
  v_attrib_before  text;
  v_attrib_after   text;
  v_in_a_after     int;
  v_in_b_after     int;
BEGIN
  -- Run the move as a REAL owner, through RLS and units_guard_ownership_columns,
  -- exactly as assignUnitsToManufacturingPartner does. Without this the session
  -- has no JWT at all, get_user_role() resolves to neither owner nor
  -- service_role, and the trigger's catch-all correctly refuses the write — a
  -- pass that would prove nothing about the relocation path.
  SELECT id INTO v_uid FROM auth.users
   WHERE raw_app_meta_data ->> 'role' = 'owner' LIMIT 1;
  IF v_uid IS NULL THEN
    PERFORM pg_temp.probe('SKIP probe 1 — no owner user to run the move as');
    RETURN;
  END IF;

  SELECT u.id, u.unit_number INTO v_unit, v_unit_number
  FROM units u
  WHERE u.manufacturing_partner_id = 'mp-internal'
    AND u.status IN ('measured', 'bracketed', 'manufactured')
    AND u.manufacturing_assigned_at IS NOT NULL
    AND EXISTS (SELECT 1 FROM window_manufacturing_schedule s WHERE s.unit_id = u.id)
  ORDER BY (
    SELECT count(*) FROM window_production_status p
    WHERE p.unit_id = u.id AND p.status <> 'pending'
  ) DESC, u.unit_number
  LIMIT 1;

  IF v_unit IS NULL THEN
    PERFORM pg_temp.probe('SKIP probe 1 — no in-zone Station A unit with schedule rows to move');
    RETURN;
  END IF;

  SELECT count(*) INTO v_wps_before FROM window_production_status WHERE unit_id = v_unit;
  SELECT count(*) INTO v_started_before
    FROM window_production_status WHERE unit_id = v_unit AND status <> 'pending';
  SELECT count(*) INTO v_sched_before FROM window_manufacturing_schedule WHERE unit_id = v_unit;
  SELECT string_agg(window_id, ',' ORDER BY window_id) INTO v_windows_before
    FROM window_manufacturing_schedule WHERE unit_id = v_unit;
  SELECT string_agg(
           window_id || ':' || status || ':' || COALESCE(cut_by_cutter_id, '-') ||
           ':' || COALESCE(cut_at::text, '-') || ':' || COALESCE(assembled_at::text, '-'),
           '|' ORDER BY window_id)
    INTO v_attrib_before
    FROM window_production_status WHERE unit_id = v_unit;

  PERFORM pg_temp.probe(format('moving unit %s (%s): %s blinds, %s started, %s schedule rows',
    v_unit_number, v_unit, v_wps_before, v_started_before, v_sched_before));

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated',
                      'app_metadata', json_build_object('role', 'owner'))::text, true);
  PERFORM set_config('role', 'authenticated', true);

  -- THE MOVE. One column. This is the whole operation — exactly what
  -- assignUnitsToManufacturingPartner issues for a relocation.
  UPDATE units
     SET manufacturing_partner_id = 'mp-station-b',
         manufacturing_assigned_at = NOW()
   WHERE id = v_unit;

  -- …and the pin clear the action performs alongside it (UPDATE, never DELETE).
  UPDATE window_manufacturing_schedule
     SET is_schedule_locked = false, lock_reason = '', manual_priority = 0,
         over_capacity_override = false, last_reschedule_reason = 'station_relocated'
   WHERE unit_id = v_unit;

  -- Back to a superuser role for the assertions, so the verification reads are
  -- not themselves filtered by the owner's RLS.
  PERFORM set_config('role', 'postgres', true);

  SELECT count(*) INTO v_wps_after FROM window_production_status WHERE unit_id = v_unit;
  SELECT count(*) INTO v_started_after
    FROM window_production_status WHERE unit_id = v_unit AND status <> 'pending';
  SELECT count(*) INTO v_sched_after FROM window_manufacturing_schedule WHERE unit_id = v_unit;
  SELECT string_agg(window_id, ',' ORDER BY window_id) INTO v_windows_after
    FROM window_manufacturing_schedule WHERE unit_id = v_unit;
  SELECT string_agg(
           window_id || ':' || status || ':' || COALESCE(cut_by_cutter_id, '-') ||
           ':' || COALESCE(cut_at::text, '-') || ':' || COALESCE(assembled_at::text, '-'),
           '|' ORDER BY window_id)
    INTO v_attrib_after
    FROM window_production_status WHERE unit_id = v_unit;

  -- RULE 2 — the rows are still there, and they are the SAME rows.
  IF v_sched_after <> v_sched_before THEN
    RAISE EXCEPTION 'FAIL probe 1 (RULE 2): schedule rows % → % — the unit would vanish from every queue',
      v_sched_before, v_sched_after;
  END IF;
  IF v_windows_after IS DISTINCT FROM v_windows_before THEN
    RAISE EXCEPTION 'FAIL probe 1 (RULE 2): schedule window set changed';
  END IF;

  -- The work itself travelled untouched.
  IF v_wps_after <> v_wps_before OR v_started_after <> v_started_before THEN
    RAISE EXCEPTION 'FAIL probe 1: production rows %→%, started %→%',
      v_wps_before, v_wps_after, v_started_before, v_started_after;
  END IF;

  -- RULE 3 — attribution is not rewritten.
  IF v_attrib_after IS DISTINCT FROM v_attrib_before THEN
    RAISE EXCEPTION 'FAIL probe 1 (RULE 3): production attribution was rewritten by the move';
  END IF;

  -- Queue membership flipped, and flipped completely: the defining property is
  -- that there is no instant in which both stations see it.
  SELECT count(*) INTO v_in_a_after
    FROM window_manufacturing_schedule s JOIN units u ON u.id = s.unit_id
   WHERE s.unit_id = v_unit AND u.manufacturing_partner_id = 'mp-internal';
  SELECT count(*) INTO v_in_b_after
    FROM window_manufacturing_schedule s JOIN units u ON u.id = s.unit_id
   WHERE s.unit_id = v_unit AND u.manufacturing_partner_id = 'mp-station-b';

  IF v_in_a_after <> 0 THEN
    RAISE EXCEPTION 'FAIL probe 1: % rows still resolve to Station A', v_in_a_after;
  END IF;
  IF v_in_b_after <> v_sched_before THEN
    RAISE EXCEPTION 'FAIL probe 1: Station B sees % of % rows', v_in_b_after, v_sched_before;
  END IF;

  PERFORM pg_temp.probe(format('PASS probe 1 — unit %s moved A→B: %s blinds intact (%s started), %s schedule rows kept, attribution unchanged',
    v_unit_number, v_wps_after, v_started_after, v_sched_after));
END $$;

-- ---------------------------------------------------------------------------
-- Probe 2 — the lock is pair-aware: a relocation is allowed where a transfer
-- to a vendor would be refused. Run as a real OWNER through the trigger.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_uid    uuid;
  v_unit   text;
  v_vendor text;
  v_locked boolean;
  v_failed boolean := false;
BEGIN
  SELECT id INTO v_uid FROM auth.users
   WHERE raw_app_meta_data ->> 'role' = 'owner' LIMIT 1;
  SELECT id INTO v_vendor FROM manufacturing_partners WHERE NOT is_internal LIMIT 1;

  SELECT u.id INTO v_unit
  FROM units u
  WHERE u.manufacturing_partner_id IN ('mp-internal', 'mp-station-b')
    AND public.is_manufacturing_locked(
          u.id, u.manufacturing_partner_id, u.production_entered_at, u.all_measured_at)
  LIMIT 1;

  IF v_uid IS NULL OR v_unit IS NULL THEN
    PERFORM pg_temp.probe('SKIP probe 2 — need an owner user and a locked in-house unit');
    RETURN;
  END IF;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated',
                      'app_metadata', json_build_object('role', 'owner'))::text, true);
  PERFORM set_config('role', 'authenticated', true);

  -- A locked unit relocating between two in-house stations: must SUCCEED with
  -- no override stamp, because nothing is rebuilt.
  UPDATE units SET manufacturing_partner_id =
      CASE WHEN manufacturing_partner_id = 'mp-internal' THEN 'mp-station-b' ELSE 'mp-internal' END
   WHERE id = v_unit;
  PERFORM pg_temp.probe('PASS probe 2a — locked unit relocated between stations without an override');

  -- The same locked unit going to a VENDOR without an override: must be REFUSED.
  IF v_vendor IS NOT NULL THEN
    BEGIN
      UPDATE units SET manufacturing_partner_id = v_vendor WHERE id = v_unit;
      v_failed := true;
    EXCEPTION WHEN insufficient_privilege THEN
      PERFORM pg_temp.probe('PASS probe 2b — transfer to a vendor still refused without confirmation');
    END;
    IF v_failed THEN
      RAISE EXCEPTION 'FAIL probe 2b: a locked unit transferred to a vendor with no override';
    END IF;
  ELSE
    PERFORM pg_temp.probe('SKIP probe 2b — no vendor partner exists to transfer to');
  END IF;

  PERFORM set_config('role', 'postgres', true);
END $$;

-- ---------------------------------------------------------------------------
-- Probe 3 — get_role_schedule resolves as ONE function and its role gate holds.
-- The DROP/CREATE in §10 is the riskiest edit in the migration: a lingering
-- 2-arg overload would make PostgREST fail to resolve the call at runtime.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_overloads int;
  v_uid       uuid;
  v_denied    boolean := false;
BEGIN
  SELECT count(*) INTO v_overloads
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'get_role_schedule';
  IF v_overloads <> 1 THEN
    RAISE EXCEPTION 'FAIL probe 3: % get_role_schedule overloads — PostgREST cannot resolve the call', v_overloads;
  END IF;
  PERFORM pg_temp.probe('PASS probe 3a — exactly one get_role_schedule signature');

  -- An installer must now be refused; before this migration the function had no
  -- role gate at all and any signed-in user could read the whole factory queue.
  SELECT id INTO v_uid FROM auth.users
   WHERE raw_app_meta_data ->> 'role' = 'installer' LIMIT 1;
  IF v_uid IS NULL THEN
    PERFORM pg_temp.probe('SKIP probe 3b — no installer user to test the role gate with');
    RETURN;
  END IF;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated',
                      'app_metadata', json_build_object('role', 'installer'))::text, true);
  PERFORM set_config('role', 'authenticated', true);

  BEGIN
    PERFORM public.get_role_schedule('scheduled_cut_date', false, NULL);
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;

  PERFORM set_config('role', 'postgres', true);

  IF NOT v_denied THEN
    RAISE EXCEPTION 'FAIL probe 3b: an installer can still read the whole factory schedule';
  END IF;
  PERFORM pg_temp.probe('PASS probe 3b — installer refused by the new role gate');
END $$;

\echo '=== all probes passed — rolling back, nothing committed ==='
SELECT seq, msg FROM _probe_log ORDER BY seq;

ROLLBACK;
