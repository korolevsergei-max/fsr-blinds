-- One-off cleanup: clear production_entered_at for units where every window
-- is already qc_approved. The backfill in 20260525130000 picked these up
-- because their MFG+PKG labels were printed, but they have nothing left for
-- the cutter to do — they're fully manufactured.

UPDATE public.units u
SET production_entered_at = NULL
WHERE production_entered_at IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.windows w
    JOIN public.rooms r ON r.id = w.room_id
    WHERE r.unit_id = u.id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.windows w
    JOIN public.rooms r ON r.id = w.room_id
    LEFT JOIN public.window_production_status wps ON wps.window_id = w.id
    WHERE r.unit_id = u.id
      AND (wps.status IS NULL OR wps.status != 'qc_approved')
  );
