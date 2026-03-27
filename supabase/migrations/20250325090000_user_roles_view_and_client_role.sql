-- Add `client` role support + a dashboard-friendly view.

-- 1) Expand user_profiles.role enum/check constraint to include `client`.
DO $$
DECLARE
  conname text;
BEGIN
  -- Drop the existing role check constraint if it exists.
  SELECT c.conname
    INTO conname
  FROM pg_constraint c
  WHERE c.conrelid = 'public.user_profiles'::regclass
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) ILIKE '%role IN%';

  IF conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.user_profiles DROP CONSTRAINT %I', conname);
  END IF;
EXCEPTION
  WHEN undefined_table THEN
    -- Migration applied before user_profiles exists; no-op.
    NULL;
END $$;

ALTER TABLE public.user_profiles
ADD CONSTRAINT user_profiles_role_check
CHECK (role IN ('owner', 'installer', 'manufacturer', 'client'));

-- 2) Create a view you can query from Supabase UI.
--    Shows auth.users joined to app profile role + display name.
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

