-- Non-CONCURRENTLY because Supabase CLI runs each migration in a single pipeline,
-- which rejects CONCURRENTLY. The units table is small enough that the brief
-- AccessExclusiveLock during index build is acceptable.
CREATE INDEX IF NOT EXISTS idx_units_status
  ON public.units (status);

CREATE INDEX IF NOT EXISTS idx_units_production_entered_at
  ON public.units (production_entered_at)
  WHERE production_entered_at IS NOT NULL;
