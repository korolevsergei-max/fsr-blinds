-- Backfill window_manufacturing_schedule for units that reached
-- measured/bracketed/manufactured without going through the Node-side
-- reflowManufacturingSchedules path (e.g. SQL seeds, earlier data,
-- backfills that updated status directly).
--
-- Without a row here, the unit's windows never appear in the cutter,
-- assembler, or QC queues even though the unit list shows "Measured".
-- See src/lib/manufacturing-scheduler.ts:loadPersistedRoleSchedule().
--
-- Dates are intentionally left NULL — the next reflow run (triggered by
-- any /cutter, /assembler, or /management/schedule visit) will plan
-- cut/assembly/qc dates according to current capacity.

INSERT INTO public.window_manufacturing_schedule (
  id,
  window_id,
  unit_id,
  target_ready_date,
  scheduled_cut_date,
  scheduled_assembly_date,
  scheduled_qc_date,
  manual_priority,
  is_schedule_locked,
  lock_reason,
  last_reschedule_reason,
  over_capacity_override
)
SELECT
  'mfg-' || gen_random_uuid()::text,
  w.id,
  u.id,
  NULLIF(u.complete_by_date, '')::date,
  NULL,
  NULL,
  NULL,
  0,
  false,
  '',
  'backfill_2026_05_27_missing_schedule',
  false
FROM public.units u
JOIN public.rooms r ON r.unit_id = u.id
JOIN public.windows w ON w.room_id = r.id
LEFT JOIN public.window_manufacturing_schedule s ON s.window_id = w.id
WHERE u.status IN ('measured', 'bracketed', 'manufactured')
  AND u.production_entered_at IS NULL
  AND s.id IS NULL;

-- Also re-run the all_measured_at backfill from 20260525120000 to catch
-- units that became fully measured between that migration and now.
UPDATE public.units u
SET all_measured_at = NOW()
WHERE u.all_measured_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.rooms r
    JOIN public.windows w ON w.room_id = r.id
    WHERE r.unit_id = u.id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.rooms r
    JOIN public.windows w ON w.room_id = r.id
    WHERE r.unit_id = u.id
      AND (w.width IS NULL OR w.height IS NULL)
  );
