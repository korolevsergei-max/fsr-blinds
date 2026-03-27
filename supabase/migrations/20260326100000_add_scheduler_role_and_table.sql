-- Add `scheduler` role support and dedicated schedulers table.

-- 1) Expand user_profiles.role check constraint to include `scheduler`.
ALTER TABLE public.user_profiles
  DROP CONSTRAINT IF EXISTS user_profiles_role_check;

ALTER TABLE public.user_profiles
ADD CONSTRAINT user_profiles_role_check
CHECK (role IN ('owner', 'installer', 'manufacturer', 'client', 'scheduler'));

-- 2) Create schedulers app table (mirrors installers/manufacturers pattern).
CREATE TABLE IF NOT EXISTS public.schedulers (
  id            TEXT        PRIMARY KEY,
  name          TEXT        NOT NULL,
  email         TEXT        NOT NULL,
  phone         TEXT        NOT NULL DEFAULT '',
  auth_user_id  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3) Permissive authenticated RLS — consistent with existing tables.
ALTER TABLE public.schedulers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_all_schedulers" ON public.schedulers;
CREATE POLICY "authenticated_all_schedulers" ON public.schedulers
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 4) Refresh user_directory view to include scheduler role.
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
