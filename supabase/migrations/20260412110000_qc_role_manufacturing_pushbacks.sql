-- Add dedicated QC role, manufactured milestone support, and manufacturing pushback history.

-- 1) Extend user roles with qc.
ALTER TABLE public.user_profiles
  DROP CONSTRAINT IF EXISTS user_profiles_role_check;

ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_role_check
  CHECK (role IN ('owner', 'installer', 'cutter', 'client', 'scheduler', 'assembler', 'qc'));

-- 2) Dedicated QC users table.
CREATE TABLE IF NOT EXISTS public.qcs (
  id            TEXT        PRIMARY KEY,
  name          TEXT        NOT NULL,
  email         TEXT        NOT NULL,
  phone         TEXT        NOT NULL DEFAULT '',
  auth_user_id  UUID        UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ
);

ALTER TABLE public.qcs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_all_qcs" ON public.qcs;
CREATE POLICY "authenticated_all_qcs" ON public.qcs
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 3) Manufacturing settings/schedule now include QC capacity and planning.
ALTER TABLE public.manufacturing_settings
  ADD COLUMN IF NOT EXISTS qc_daily_capacity INTEGER NOT NULL DEFAULT 30
    CHECK (qc_daily_capacity >= 0);

ALTER TABLE public.window_manufacturing_schedule
  ADD COLUMN IF NOT EXISTS scheduled_qc_date DATE;

CREATE INDEX IF NOT EXISTS idx_window_manufacturing_schedule_qc_date
  ON public.window_manufacturing_schedule (scheduled_qc_date);

-- 4) Window production rows record QC approver separately from assembler legacy data.
ALTER TABLE public.window_production_status
  ADD COLUMN IF NOT EXISTS qc_approved_by_qc_id TEXT REFERENCES public.qcs(id) ON DELETE SET NULL;

-- 5) Explicit manufacturing escalation history for pushbacks/blockers.
CREATE TABLE IF NOT EXISTS public.window_manufacturing_escalations (
  id                  TEXT PRIMARY KEY,
  window_id           TEXT NOT NULL REFERENCES public.windows(id) ON DELETE CASCADE,
  unit_id             TEXT NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  source_role         TEXT NOT NULL CHECK (source_role IN ('cutter', 'assembler', 'qc')),
  target_role         TEXT NOT NULL CHECK (target_role IN ('cutter', 'assembler', 'qc')),
  escalation_type     TEXT NOT NULL CHECK (escalation_type IN ('pushback', 'blocker')),
  status              TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  reason              TEXT NOT NULL DEFAULT '',
  notes               TEXT NOT NULL DEFAULT '',
  opened_by_user_id   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  opened_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ
);

ALTER TABLE public.window_manufacturing_escalations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_all_window_manufacturing_escalations" ON public.window_manufacturing_escalations;
CREATE POLICY "authenticated_all_window_manufacturing_escalations" ON public.window_manufacturing_escalations
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_window_manufacturing_escalations_window_status
  ON public.window_manufacturing_escalations (window_id, status);

CREATE INDEX IF NOT EXISTS idx_window_manufacturing_escalations_unit_status
  ON public.window_manufacturing_escalations (unit_id, status);

-- 6) Unit status constraints now allow manufactured summary state.
ALTER TABLE public.units
  DROP CONSTRAINT IF EXISTS units_status_check;
ALTER TABLE public.units
  ADD CONSTRAINT units_status_check
  CHECK (status IN (
    'not_started',
    'measured',
    'bracketed',
    'manufactured',
    'installed',
    -- legacy values kept for historical rows
    'measured_and_bracketed',
    'pending_scheduling',
    'scheduled_bracketing',
    'bracketed_measured',
    'install_date_scheduled',
    'installed_pending_approval',
    'client_approved'
  ));

ALTER TABLE public.schedule_entries
  DROP CONSTRAINT IF EXISTS schedule_entries_status_check;
ALTER TABLE public.schedule_entries
  ADD CONSTRAINT schedule_entries_status_check
  CHECK (status IN (
    'not_started',
    'measured',
    'bracketed',
    'manufactured',
    'installed',
    'measured_and_bracketed',
    'pending_scheduling',
    'scheduled_bracketing',
    'bracketed_measured',
    'install_date_scheduled',
    'installed_pending_approval',
    'client_approved'
  ));

ALTER TABLE public.unit_activity_log
  DROP CONSTRAINT IF EXISTS unit_activity_log_actor_role_check;

ALTER TABLE public.unit_activity_log
  ADD CONSTRAINT unit_activity_log_actor_role_check
  CHECK (actor_role IN ('owner', 'installer', 'cutter', 'scheduler', 'assembler', 'qc', 'system'));

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE proname = 'set_updated_at'
      AND pg_function_is_visible(oid)
  ) THEN
    EXECUTE '
      DROP TRIGGER IF EXISTS trg_set_updated_at ON qcs;
      CREATE TRIGGER trg_set_updated_at
        BEFORE UPDATE ON qcs
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
    ';

    EXECUTE '
      DROP TRIGGER IF EXISTS trg_set_updated_at ON window_manufacturing_escalations;
      CREATE TRIGGER trg_set_updated_at
        BEFORE UPDATE ON window_manufacturing_escalations
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
    ';
  END IF;
END $$;
