-- Manufacturing scheduler: shared capacities, work calendar, and per-window planned dates.

CREATE TABLE IF NOT EXISTS public.manufacturing_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  cutter_daily_capacity INTEGER NOT NULL DEFAULT 30 CHECK (cutter_daily_capacity >= 0),
  assembler_daily_capacity INTEGER NOT NULL DEFAULT 30 CHECK (assembler_daily_capacity >= 0),
  apply_ontario_holidays BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

ALTER TABLE public.manufacturing_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_all_manufacturing_settings" ON public.manufacturing_settings;
CREATE POLICY "authenticated_all_manufacturing_settings" ON public.manufacturing_settings
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

INSERT INTO public.manufacturing_settings (id)
VALUES ('default')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.manufacturing_calendar_overrides (
  id TEXT PRIMARY KEY,
  work_date DATE NOT NULL UNIQUE,
  is_working BOOLEAN NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

ALTER TABLE public.manufacturing_calendar_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_all_manufacturing_calendar_overrides" ON public.manufacturing_calendar_overrides;
CREATE POLICY "authenticated_all_manufacturing_calendar_overrides" ON public.manufacturing_calendar_overrides
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.window_manufacturing_schedule (
  id TEXT PRIMARY KEY,
  window_id TEXT NOT NULL UNIQUE REFERENCES public.windows(id) ON DELETE CASCADE,
  unit_id TEXT NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  target_ready_date DATE,
  scheduled_cut_date DATE,
  scheduled_assembly_date DATE,
  manual_priority INTEGER NOT NULL DEFAULT 0,
  is_schedule_locked BOOLEAN NOT NULL DEFAULT false,
  lock_reason TEXT NOT NULL DEFAULT '',
  last_reschedule_reason TEXT NOT NULL DEFAULT '',
  over_capacity_override BOOLEAN NOT NULL DEFAULT false,
  moved_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  moved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

ALTER TABLE public.window_manufacturing_schedule ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_all_window_manufacturing_schedule" ON public.window_manufacturing_schedule;
CREATE POLICY "authenticated_all_window_manufacturing_schedule" ON public.window_manufacturing_schedule
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_window_manufacturing_schedule_unit_id
  ON public.window_manufacturing_schedule (unit_id);

CREATE INDEX IF NOT EXISTS idx_window_manufacturing_schedule_cut_date
  ON public.window_manufacturing_schedule (scheduled_cut_date);

CREATE INDEX IF NOT EXISTS idx_window_manufacturing_schedule_assembly_date
  ON public.window_manufacturing_schedule (scheduled_assembly_date);

ALTER TABLE public.window_production_status
  ADD COLUMN IF NOT EXISTS issue_status TEXT NOT NULL DEFAULT 'none'
    CHECK (issue_status IN ('none', 'open', 'resolved')),
  ADD COLUMN IF NOT EXISTS issue_reason TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS issue_notes TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS issue_reported_by_role TEXT,
  ADD COLUMN IF NOT EXISTS issue_reported_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS issue_resolved_at TIMESTAMPTZ;

ALTER TABLE public.unit_activity_log
  DROP CONSTRAINT IF EXISTS unit_activity_log_actor_role_check;

ALTER TABLE public.unit_activity_log
  ADD CONSTRAINT unit_activity_log_actor_role_check
  CHECK (actor_role IN ('owner', 'installer', 'cutter', 'scheduler', 'assembler', 'system'));

ALTER TABLE public.manufacturing_settings
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

ALTER TABLE public.manufacturing_calendar_overrides
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

ALTER TABLE public.window_manufacturing_schedule
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE proname = 'set_updated_at'
      AND pg_function_is_visible(oid)
  ) THEN
    EXECUTE '
      DROP TRIGGER IF EXISTS trg_set_updated_at ON manufacturing_settings;
      CREATE TRIGGER trg_set_updated_at
        BEFORE UPDATE ON manufacturing_settings
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
    ';

    EXECUTE '
      DROP TRIGGER IF EXISTS trg_set_updated_at ON manufacturing_calendar_overrides;
      CREATE TRIGGER trg_set_updated_at
        BEFORE UPDATE ON manufacturing_calendar_overrides
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
    ';

    EXECUTE '
      DROP TRIGGER IF EXISTS trg_set_updated_at ON window_manufacturing_schedule;
      CREATE TRIGGER trg_set_updated_at
        BEFORE UPDATE ON window_manufacturing_schedule
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
    ';
  END IF;
END $$;
