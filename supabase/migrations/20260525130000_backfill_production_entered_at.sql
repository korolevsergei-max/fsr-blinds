-- Backfill production_entered_at for units where every window has both
-- manufacturing_label_printed_at AND packaging_label_printed_at set.
-- Ignores cut_list_printed_at — list tracking is new and most existing
-- units won't have it set.

UPDATE public.units u
SET production_entered_at = NOW()
WHERE production_entered_at IS NULL
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
      AND (
        wps.manufacturing_label_printed_at IS NULL
        OR wps.packaging_label_printed_at IS NULL
      )
  );
