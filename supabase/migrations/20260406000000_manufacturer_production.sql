-- Manufacturer production tracking: QC persons, per-window build status, manufacturing risk flag.

-- 1) Expand user_profiles.role check to include 'qc'.
ALTER TABLE public.user_profiles
  DROP CONSTRAINT IF EXISTS user_profiles_role_check;

ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_role_check
  CHECK (role IN ('owner', 'installer', 'manufacturer', 'client', 'scheduler', 'qc'));

-- 2) Create qc_persons table (mirrors schedulers/manufacturers pattern).
CREATE TABLE IF NOT EXISTS public.qc_persons (
  id            TEXT        PRIMARY KEY,
  name          TEXT        NOT NULL,
  email         TEXT        NOT NULL,
  phone         TEXT        NOT NULL DEFAULT '',
  auth_user_id  UUID        UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.qc_persons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_all_qc_persons" ON public.qc_persons;
CREATE POLICY "authenticated_all_qc_persons" ON public.qc_persons
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 3) Create window_production_status table (one row per window, tracks build → QC flow).
CREATE TABLE IF NOT EXISTS public.window_production_status (
  id                        TEXT        PRIMARY KEY,
  window_id                 TEXT        NOT NULL REFERENCES public.windows(id) ON DELETE CASCADE,
  unit_id                   TEXT        NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  status                    TEXT        NOT NULL DEFAULT 'pending'
                                        CHECK (status IN ('pending', 'built', 'qc_approved')),
  built_by_manufacturer_id  TEXT        REFERENCES public.manufacturers(id) ON DELETE SET NULL,
  built_at                  TIMESTAMPTZ,
  built_notes               TEXT        NOT NULL DEFAULT '',
  qc_approved_by_qc_id      TEXT        REFERENCES public.qc_persons(id) ON DELETE SET NULL,
  qc_approved_at            TIMESTAMPTZ,
  qc_notes                  TEXT        NOT NULL DEFAULT '',
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(window_id)
);

ALTER TABLE public.window_production_status ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_all_window_production_status" ON public.window_production_status;
CREATE POLICY "authenticated_all_window_production_status" ON public.window_production_status
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 4) Add manufacturing_risk_flag to units (separate from installer risk_flag).
ALTER TABLE public.units
  ADD COLUMN IF NOT EXISTS manufacturing_risk_flag TEXT NOT NULL DEFAULT 'green'
  CHECK (manufacturing_risk_flag IN ('green', 'yellow', 'red'));

-- 5) Refresh user_directory view to include qc role.
CREATE OR REPLACE VIEW public.user_directory AS
SELECT
  u.id AS auth_user_id,
  u.email,
  u.created_at,
  p.role AS user_type,
  p.display_name
FROM auth.users u
LEFT JOIN public.user_profiles p
  ON p.id = u.id;

GRANT SELECT ON public.user_directory TO authenticated;
