-- Phase 1: Cutter production-flow timestamps
-- Adds all_measured_at and production_entered_at to units,
-- cut_list_printed_at to window_production_status.

ALTER TABLE public.units
  ADD COLUMN IF NOT EXISTS all_measured_at TIMESTAMPTZ NULL;

ALTER TABLE public.units
  ADD COLUMN IF NOT EXISTS production_entered_at TIMESTAMPTZ NULL;

ALTER TABLE public.window_production_status
  ADD COLUMN IF NOT EXISTS cut_list_printed_at TIMESTAMPTZ NULL;

-- Backfill all_measured_at: set to NOW() for units where every window
-- has both width and height measured. Units with no windows stay NULL.
UPDATE public.units u
SET all_measured_at = NOW()
WHERE EXISTS (
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
