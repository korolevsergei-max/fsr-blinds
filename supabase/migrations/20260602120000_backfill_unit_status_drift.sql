-- One-time backfill: heal legacy drift in units.status / schedule_entries.status.
--
-- Context (DATA_SCOPING_PLAN.md §3, Phase 0): the read-path self-heal in
-- withLiveUnitStatuses (the after() write-back) has been removed. units.status is
-- persisted at every mutation by recomputeUnitStatus(), so the write-back was pure
-- self-heal. This migration recomputes status ONCE for any unit whose persisted
-- status drifted from the derived value, so the read path no longer needs to.
--
-- Derivation mirrors deriveUnitStatusFromCounts() (src/lib/unit-status-helpers.ts)
-- exactly, evaluated over the same inputs withLiveUnitStatuses() uses:
--   - windows.measured / .bracketed / .installed booleans
--   - window_production_status rows with status = 'qc_approved' (per unit)
-- Note: installed >= total short-circuits to 'installed' BEFORE the manufactured
-- check, so the legacy manufacturedCount nuance in withLiveUnitStatuses never
-- affects the persisted status and is intentionally omitted here.

WITH window_counts AS (
  SELECT
    r.unit_id,
    COUNT(w.id)                                    AS total,
    COUNT(*) FILTER (WHERE w.measured)             AS measured,
    COUNT(*) FILTER (WHERE w.bracketed)            AS bracketed,
    COUNT(*) FILTER (WHERE w.installed)            AS installed
  FROM public.rooms r
  JOIN public.windows w ON w.room_id = r.id
  GROUP BY r.unit_id
),
qc_counts AS (
  SELECT unit_id, COUNT(*) FILTER (WHERE status = 'qc_approved') AS qc
  FROM public.window_production_status
  GROUP BY unit_id
),
derived AS (
  SELECT
    u.id,
    CASE
      WHEN COALESCE(wc.total, 0) = 0          THEN 'not_started'
      WHEN wc.installed >= wc.total           THEN 'installed'
      WHEN COALESCE(qc.qc, 0) >= wc.total     THEN 'manufactured'
      WHEN wc.bracketed >= wc.total           THEN 'bracketed'
      WHEN wc.measured >= wc.total            THEN 'measured'
      ELSE 'not_started'
    END AS new_status
  FROM public.units u
  LEFT JOIN window_counts wc ON wc.unit_id = u.id
  LEFT JOIN qc_counts qc     ON qc.unit_id = u.id
)
UPDATE public.units u
SET status = d.new_status
FROM derived d
WHERE u.id = d.id
  AND u.status IS DISTINCT FROM d.new_status;

-- Keep persisted schedule entry statuses aligned with the (now healed) unit status,
-- matching 20260413113000_sync_schedule_entry_statuses_with_units.sql.
UPDATE public.schedule_entries AS se
SET status = u.status
FROM public.units AS u
WHERE u.id = se.unit_id
  AND se.status IS DISTINCT FROM u.status;
