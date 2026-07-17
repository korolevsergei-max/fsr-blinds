-- Phase 8 (L3): handle_new_user must not trust client-suppliable raw_user_meta_data
-- for role assignment. Every real signup path (signUpOwnerAction, admin-created
-- cutter/assembler/installer/qc/scheduler/owner accounts) immediately calls
-- upsertUserProfile with a server-trusted, hardcoded role right after auth
-- creation, so this trigger's own role read was always redundant. Removing it
-- closes a self-serve owner-escalation path that would otherwise open up the
-- moment public signup is exposed for anything beyond the first owner.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  owner_count INTEGER;
  user_role TEXT;
BEGIN
  SELECT COUNT(*) INTO owner_count FROM user_profiles WHERE role = 'owner';
  IF owner_count = 0 THEN
    user_role := 'owner';
  ELSE
    user_role := 'installer';
  END IF;

  INSERT INTO user_profiles (id, role, display_name, email)
  VALUES (
    NEW.id,
    user_role,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.email, '')
  );
  RETURN NEW;
END;
$$;
