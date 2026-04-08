-- Fix two CRITICAL security advisories on public.user_directory:
--
-- 1. "Exposed Auth Users" — the view joined auth.users, making email/created_at
--    accessible to any authenticated user via PostgREST.
-- 2. "Security Definer View" — the view ran with the creator's permissions
--    (SECURITY DEFINER), bypassing RLS of the querying user.
--
-- Fix: rebuild the view using only public.user_profiles (which has RLS enabled),
-- with SECURITY INVOKER so the caller's own RLS policies are enforced.

DROP VIEW IF EXISTS public.user_directory;

CREATE VIEW public.user_directory WITH (security_invoker = true) AS
SELECT
  p.id            AS auth_user_id,
  p.display_name,
  p.role          AS user_type,
  p.created_at
FROM public.user_profiles p;

-- Re-grant SELECT; RLS on user_profiles now gates what each caller can see.
GRANT SELECT ON public.user_directory TO authenticated;
