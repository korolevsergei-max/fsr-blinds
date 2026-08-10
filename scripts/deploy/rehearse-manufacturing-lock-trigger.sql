-- ===========================================================================
-- §4a.6 REHEARSAL for 20260810140000_manufacturing_lock.sql — RUN BY A HUMAN
-- ===========================================================================
-- Applies the ENTIRE MR4a migration inside one transaction, runs the three
-- §4a.6 regression probes as REAL row UPDATEs under the real roles (owner /
-- installer / subcontractor), pins the new lock behaviour both ways, then
-- ROLLS BACK. Nothing is committed — the migration is only applied for real
-- afterwards, via `supabase db push`, once every probe prints PASS.
--
-- HOW TO RUN (from the repo root):
--
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
--     -f scripts/deploy/rehearse-manufacturing-lock-trigger.sql
--
-- SUPABASE_DB_URL = the direct/session-pooler Postgres URI from the Supabase
-- Dashboard → Connect (same database password `supabase db push` uses). The
-- script never COMMITs; with ON_ERROR_STOP any failure exits mid-transaction
-- and the disconnect rolls everything back automatically. Safe to re-run.
--
-- NOTE: the migration's ALTER TABLE takes a brief ACCESS EXCLUSIVE lock on
-- `units` that is held until the final ROLLBACK (a few seconds). Run it at a
-- quiet moment, not while the factory is mid-shift.
--
-- Role simulation: each probe sets transaction-local JWT claims
-- (request.jwt.claims) for a real user of that role and switches to the
-- `authenticated` role, exactly what PostgREST does — so RLS policies, the
-- restructured units_guard_ownership_columns trigger, and get_user_role()
-- all execute the true production path.
--
-- The probes use value-preserving SETs (x = x). A BEFORE UPDATE row trigger,
-- RLS, and every guard run identically whether or not the value changes, and
-- this keeps the rehearsal from even transiently mutating rolled-back data.
-- ===========================================================================

\set ON_ERROR_STOP on

BEGIN;

\echo '=== applying 20260810140000_manufacturing_lock.sql (transactional) ==='
\ir ../../supabase/migrations/20260810140000_manufacturing_lock.sql
\echo '=== migration applied inside transaction — running probes ==='

-- ---------------------------------------------------------------------------
-- Probe 1 — owner edits an installation date.
-- The restructured trigger must let every ordinary owner write through:
-- partner unchanged ⇒ the lock branch is never evaluated.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_uid  uuid;
  v_unit text;
  v_n    int;
BEGIN
  SELECT up.id INTO v_uid FROM public.user_profiles up WHERE up.role = 'owner' LIMIT 1;
  IF v_uid IS NULL THEN RAISE EXCEPTION 'REHEARSAL ABORT: no owner in user_profiles'; END IF;
  SELECT u.id INTO v_unit FROM public.units u WHERE u.installation_date IS NOT NULL LIMIT 1;
  IF v_unit IS NULL THEN RAISE EXCEPTION 'REHEARSAL ABORT: no unit with an installation_date'; END IF;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);

  UPDATE public.units SET installation_date = installation_date WHERE id = v_unit;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  PERFORM set_config('role', session_user, true);
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL probe 1: owner installation-date update touched % rows', v_n; END IF;
  RAISE NOTICE 'PASS probe 1 — owner edited an installation date on unit %', v_unit;
END $$;

-- ---------------------------------------------------------------------------
-- Probe 2 — installer marks a window measured (drives recomputeUnitStatus).
-- Two writes, both as the installer: the windows row itself, then the
-- units.status write recomputeUnitStatus performs on the user-context client.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_uid    uuid;
  v_unit   text;
  v_window text;
  v_n      int;
BEGIN
  SELECT i.auth_user_id, u.id INTO v_uid, v_unit
  FROM public.installers i
  JOIN public.units u ON u.assigned_installer_id = i.id
  WHERE i.auth_user_id IS NOT NULL
  LIMIT 1;
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'REHEARSAL ABORT: no installer with a linked login and an assigned unit';
  END IF;
  SELECT w.id INTO v_window FROM public.windows w WHERE w.unit_id = v_unit LIMIT 1;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);

  IF v_window IS NOT NULL THEN
    UPDATE public.windows SET measured = measured WHERE id = v_window;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n <> 1 THEN
      PERFORM set_config('role', session_user, true);
      RAISE EXCEPTION 'FAIL probe 2: installer windows update touched % rows (RLS?)', v_n;
    END IF;
  ELSE
    RAISE NOTICE 'probe 2: assigned unit % has no windows — skipping the windows write', v_unit;
  END IF;

  -- recomputeUnitStatus' write, same client, same role.
  UPDATE public.units SET status = status WHERE id = v_unit;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  PERFORM set_config('role', session_user, true);
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL probe 2: installer units.status update touched % rows', v_n; END IF;
  RAISE NOTICE 'PASS probe 2 — installer measured-flow writes on unit %', v_unit;
END $$;

-- ---------------------------------------------------------------------------
-- Probe 3 — subcontractor marks a blind complete.
-- The window_production_status write (their real completion path, through
-- wps_guard_manufacturing_ownership), then the units.status write
-- recomputeUnitStatus performs as the subcontractor role — the exact write
-- the restructured trigger's comment promises never reaches the lock.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_uid     uuid;
  v_partner text;
  v_unit    text;
  v_wps     text;
  v_n       int;
BEGIN
  SELECT s.auth_user_id, s.partner_id INTO v_uid, v_partner
  FROM public.subcontractors s
  WHERE s.auth_user_id IS NOT NULL
  LIMIT 1;
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'REHEARSAL ABORT: no subcontractor with a linked login';
  END IF;

  -- Prefer a partner unit that already has a production row to exercise the
  -- real completion write.
  SELECT p.id, p.unit_id INTO v_wps, v_unit
  FROM public.window_production_status p
  JOIN public.units u ON u.id = p.unit_id
  WHERE u.manufacturing_partner_id = v_partner
  LIMIT 1;
  IF v_unit IS NULL THEN
    SELECT u.id INTO v_unit FROM public.units u WHERE u.manufacturing_partner_id = v_partner LIMIT 1;
  END IF;
  IF v_unit IS NULL THEN
    RAISE EXCEPTION 'REHEARSAL ABORT: partner % has no units', v_partner;
  END IF;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);

  IF v_wps IS NOT NULL THEN
    UPDATE public.window_production_status SET status = status WHERE id = v_wps;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n <> 1 THEN
      PERFORM set_config('role', session_user, true);
      RAISE EXCEPTION 'FAIL probe 3: subcontractor wps update touched % rows', v_n;
    END IF;
  ELSE
    RAISE NOTICE 'probe 3: no production row on partner % units — skipping the wps write', v_partner;
  END IF;

  UPDATE public.units SET status = status WHERE id = v_unit;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  PERFORM set_config('role', session_user, true);
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL probe 3: subcontractor units.status update touched % rows', v_n; END IF;
  RAISE NOTICE 'PASS probe 3 — subcontractor completion-flow writes on unit %', v_unit;
END $$;

-- ---------------------------------------------------------------------------
-- Probes 4–6 — the lock itself, both directions.
--   4: owner partner change on a locked unit WITHOUT the override → 42501.
--   5: same change WITH a fresh override stamp in the SAME UPDATE → succeeds.
--   6: moving it again while REUSING the now-stale stamp → 42501 (the
--      freshness test — a once-overridden unit is not permanently movable).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_uid  uuid;
  v_unit text;
  v_ext  text;
  v_n    int;
BEGIN
  SELECT up.id INTO v_uid FROM public.user_profiles up WHERE up.role = 'owner' LIMIT 1;
  SELECT mp.id INTO v_ext FROM public.manufacturing_partners mp WHERE NOT mp.is_internal LIMIT 1;
  -- A locked INTERNAL unit that is also fully measured, so it stays locked on
  -- the external side after probe 5 moves it (deterministic probe 6).
  SELECT u.id INTO v_unit
  FROM public.units u
  WHERE u.manufacturing_partner_id = 'mp-internal'
    AND u.all_measured_at IS NOT NULL
    AND public.is_manufacturing_locked(u.id, u.manufacturing_partner_id,
                                       u.production_entered_at, u.all_measured_at)
  LIMIT 1;
  IF v_ext IS NULL OR v_unit IS NULL THEN
    RAISE NOTICE 'probes 4-6 SKIPPED: no external partner or no locked internal unit found';
    RETURN;
  END IF;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);

  -- Probe 4: no override → must be rejected.
  BEGIN
    UPDATE public.units SET manufacturing_partner_id = v_ext WHERE id = v_unit;
    PERFORM set_config('role', session_user, true);
    RAISE EXCEPTION 'FAIL probe 4: locked unit % accepted a partner change without an override', v_unit;
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'PASS probe 4 — locked unit % rejected an owner transfer without override', v_unit;
  END;

  -- Probe 5: fresh stamp in the same statement → must pass.
  UPDATE public.units
  SET manufacturing_partner_id           = v_ext,
      manufacturing_assigned_at          = now(),
      manufacturing_transfer_override_at = now(),
      manufacturing_transfer_override_by = 'rehearsal §4a.6'
  WHERE id = v_unit;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN
    PERFORM set_config('role', session_user, true);
    RAISE EXCEPTION 'FAIL probe 5: override transfer touched % rows', v_n;
  END IF;
  RAISE NOTICE 'PASS probe 5 — owner override transferred locked unit % in one statement', v_unit;

  -- Probe 6: the stamp is now stale (OLD carries it) → moving again without a
  -- NEW stamp must be rejected.
  BEGIN
    UPDATE public.units SET manufacturing_partner_id = 'mp-internal' WHERE id = v_unit;
    PERFORM set_config('role', session_user, true);
    RAISE EXCEPTION 'FAIL probe 6: stale override stamp let unit % move again', v_unit;
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'PASS probe 6 — stale stamp rejected: an override is single-use';
  END;

  PERFORM set_config('role', session_user, true);
END $$;

\echo '=== ALL PROBES DONE — rolling back (nothing was committed) ==='
ROLLBACK;
\echo '=== rehearsal complete. If every probe printed PASS, apply the migration for real with: supabase db push ==='
