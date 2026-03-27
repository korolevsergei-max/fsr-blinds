-- Mirror public.user_profiles.role into auth.users.raw_user_meta_data->role so the role
-- appears under each user in Authentication (User metadata). The canonical source remains
-- public.user_profiles; use Table Editor on user_profiles or SELECT * FROM public.user_directory.

CREATE OR REPLACE FUNCTION public.sync_user_profile_role_to_auth_metadata()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  UPDATE auth.users
  SET raw_user_meta_data =
    COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('role', NEW.role)
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_user_profile_role_sync ON public.user_profiles;
CREATE TRIGGER on_user_profile_role_sync
  AFTER INSERT OR UPDATE OF role ON public.user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_user_profile_role_to_auth_metadata();

-- Backfill existing profiles into Auth metadata
UPDATE auth.users u
SET raw_user_meta_data =
  COALESCE(u.raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('role', p.role)
FROM public.user_profiles p
WHERE p.id = u.id;
