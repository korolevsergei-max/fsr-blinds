-- ===========================================================================
-- MR3 — block unrouted units from the in-house queue + backfill the fleet
-- ===========================================================================
-- Until now `units.manufacturing_partner_id` defaulting to 'mp-internal' meant
-- a unit nobody ever decided on was silently built in-house. From this
-- migration on, the in-house queue requires an explicit routing decision:
-- `manufacturing_assigned_at IS NOT NULL`. Unrouted units drop out of
-- get_role_schedule and stop being scheduled by the reflow; MR2's dashboard
-- bucket (shipped first, deliberately) is where they surface instead.
--
-- THE ONLY PROD-DATA WRITE IN THE MR PLAN. Sections (a1)/(a2) stamp
-- manufacturing_assigned_at on every unit with manufacturing history so the
-- new filter drops nothing that is actually in flight. Both are guarded by
-- `WHERE manufacturing_assigned_at IS NULL`, so no decision anyone already
-- recorded can be overwritten. No DELETE, no DROP, no destructive write.
--
-- The supabase CLI applies this file in a single transaction, so the guard
-- assertions at the end abort the WHOLE migration — a bad backfill cannot
-- leave the factory queue partially emptied.
--
-- Pre-flight: re-run the §3.6 inventory queries in
-- docs/MANUFACTURING_ROUTING_PLAN_2026-08-10.md against prod immediately
-- before applying, and abort if either zero has moved.
--
-- Mirrors (keep in lockstep):
--   src/lib/manufacturing-partners.ts   isInternalFactoryWork (undefined ⇒ routed)
--   src/lib/manufacturing-scheduler.ts  reflow source query + :708 backstop
--   src/lib/manufacturing-process-server.ts  internalOnly branch
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- (a1) Installed units → explicitly in-house.
-- ---------------------------------------------------------------------------
-- Every installed unit predates the subcontract feature (shipped 2026-08-06)
-- and was built in the FSR factory. They are already 'mp-internal' by DB
-- default; this states it explicitly so the record is a decision rather than
-- a default. Verified against prod 2026-08-10: 377 installed units, all 377
-- already mp-internal — this statement changes no ownership, it pins intent.
--
-- ⚠️ The `manufacturing_assigned_at IS NULL` guard is what makes this safe
-- and MUST NOT be dropped. This is a one-time HISTORICAL correction, not a
-- standing rule: a unit a subcontractor builds that is later installed will
-- already carry a timestamp, so this never touches it. Writing "all installed
-- units are internal" as a permanent rule would erase the record of who
-- actually built them.
UPDATE public.units u
SET manufacturing_partner_id  = 'mp-internal',
    manufacturing_assigned_at = COALESCE(u.installed_at, u.all_measured_at, u.created_at, now())
WHERE u.manufacturing_assigned_at IS NULL          -- one-time correction only
  AND (u.status = 'installed' OR u.installed_at IS NOT NULL);

-- ---------------------------------------------------------------------------
-- (a2) Backfill every other unit that already has manufacturing activity.
-- ---------------------------------------------------------------------------
-- Runs after (a1), so the installed units are already stamped and the
-- installed_at / status clauses here only pick up the remainder.
-- `status <> 'not_started'` and `installed_at` catch units whose windows were
-- later deleted, which the three EXISTS clauses would miss. The partner
-- clause is defensive against SQL-inserted external units (0 today — all 14
-- external units are already stamped).
--
-- COALESCE(...) rather than now() because for an externally-routed-but-
-- unstamped unit, manufacturing_assigned_at feeds the partner worklist's
-- oldest-first ordering (subcontractor-data.ts); now() would reshuffle a live
-- partner's queue.
--
-- Deliberately NOT covered: a unit with rooms and windows but
-- status = 'not_started', unmeasured, no schedule and no production rows.
-- Those genuinely haven't started; staying unrouted is correct, and MR2's
-- dashboard bucket already surfaces them.
UPDATE public.units u
SET manufacturing_assigned_at =
      COALESCE(u.all_measured_at, u.production_entered_at, u.created_at, now())
WHERE u.manufacturing_assigned_at IS NULL
  AND (
       u.all_measured_at       IS NOT NULL
    OR u.production_entered_at IS NOT NULL
    OR u.installed_at          IS NOT NULL
    OR u.status <> 'not_started'
    OR u.manufacturing_partner_id <> 'mp-internal'
    OR EXISTS (SELECT 1 FROM public.window_manufacturing_schedule s         WHERE s.unit_id = u.id)
    OR EXISTS (SELECT 1 FROM public.window_manufacturing_schedule_archive a WHERE a.unit_id = u.id)
    OR EXISTS (SELECT 1 FROM public.window_production_status p              WHERE p.unit_id = u.id)
  );

-- ---------------------------------------------------------------------------
-- (b) get_role_schedule — the in-house queue now requires a routing decision.
-- ---------------------------------------------------------------------------
-- Copied verbatim from 20260806120000; three changes:
--   1. live arm:    AND u.manufacturing_assigned_at IS NOT NULL
--   2. archive arm: AND u2.manufacturing_assigned_at IS NOT NULL
--      (safe because the backfill's archive EXISTS clause makes the
--      unrouted-with-archive-rows set empty by construction; queue
--      correctness only needs the live arm)
--   3. units projection gains 'manufacturing_assigned_at' so the TS backstop
--      (manufacturing-scheduler.ts:708, isInternalFactoryWork) can see it.
--      Dropping that key later would silently disable the TS filter — its
--      absence reads as "routed" on purpose (see isInternalFactoryWork), so
--      the queue stays full rather than emptying, and the dev warning in
--      assembleRoleScheduleItems' caller flags the regression.
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
      AND u.manufacturing_assigned_at IS NOT NULL
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

REVOKE ALL ON FUNCTION public.get_role_schedule(text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_role_schedule(text, boolean) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- (c) Guard: a bad backfill aborts the transaction instead of emptying the
--     factory. Any unit with live schedule rows that is still unrouted after
--     (a1)+(a2) means the backfill predicate has a hole — the new filter in
--     (b) would drop that unit from the cutter/assembler/QC queues.
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_orphans int;
BEGIN
  SELECT count(DISTINCT s.unit_id) INTO v_orphans
  FROM public.window_manufacturing_schedule s
  JOIN public.units u ON u.id = s.unit_id
  WHERE u.manufacturing_assigned_at IS NULL;
  IF v_orphans > 0 THEN
    RAISE EXCEPTION 'Backfill incomplete: % scheduled units still unrouted — the new filter would drop them from the factory queue', v_orphans;
  END IF;
END $$;

-- Second guard (§3.6 step 3): the backfill writes manufacturing_assigned_at
-- (and, in (a1), pins already-internal units) — it must never MOVE ownership.
-- ⚠️ Update the literal below from the §3.6 step (c) inventory query
-- immediately before applying (14 external units as of 2026-08-10).
DO $$
DECLARE v_ext int;
BEGIN
  SELECT count(*) INTO v_ext FROM public.units
   WHERE manufacturing_partner_id <> 'mp-internal';
  IF v_ext <> 14 THEN
    RAISE EXCEPTION 'External unit count changed during migration (now %) — aborting', v_ext;
  END IF;
END $$;

-- ============================================================
-- DOWN (partially reversible)
-- ============================================================
-- The stamps are NOT reversible — after the fact you cannot tell a backfilled
-- timestamp from a deliberate one — and are harmless to leave: they only mean
-- "someone decided", which is true. Real rollback = re-apply the
-- get_role_schedule body from 20260806120000_manufacturing_partners.sql and
-- revert the code deploy. No data is destroyed rolling back or forward.
