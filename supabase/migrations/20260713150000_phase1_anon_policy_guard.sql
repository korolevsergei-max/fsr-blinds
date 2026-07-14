-- Phase 1-R guard (C1): assert that no anon/public RLS policy exists on any
-- public-schema table, and that storage keeps exactly one intentional public
-- policy (read-only SELECT on the fsr-media bucket, which serves <img> URLs).
-- Also flags any public table with RLS disabled, since the policy checks are
-- meaningless without RLS.
--
-- Two layers:
--   1. public.anon_policy_violations() — callable ONLY by service_role, so
--      scripts/check-anon-policies.mjs (and later CI) can re-assert the
--      invariant at any time.
--   2. A DO-block assert at the end, so applying this migration (or any
--      db reset that replays it) fails loudly if a violation exists.

CREATE OR REPLACE FUNCTION public.anon_policy_violations()
RETURNS TABLE(schemaname text, tablename text, policyname text, cmd text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT p.schemaname::text, p.tablename::text, p.policyname::text, p.cmd::text
  FROM pg_policies p
  WHERE (
    p.schemaname = 'public'
    AND p.roles && ARRAY['anon', 'public']::name[]
  ) OR (
    p.schemaname = 'storage'
    AND p.roles && ARRAY['anon', 'public']::name[]
    AND NOT (p.policyname = 'fsr_media_objects_read' AND p.cmd = 'SELECT')
  )
  UNION ALL
  SELECT 'public', c.relname::text, '<RLS DISABLED>', ''
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity;
$$;

-- The function reads catalogs as its owner; do not let it become another
-- anon-callable SECURITY DEFINER surface (the C2 lesson).
REVOKE ALL ON FUNCTION public.anon_policy_violations() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.anon_policy_violations() FROM anon;
REVOKE ALL ON FUNCTION public.anon_policy_violations() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.anon_policy_violations() TO service_role;

DO $$
DECLARE
  violations text;
BEGIN
  SELECT string_agg(format('%s.%s policy %s (%s)', v.schemaname, v.tablename, v.policyname, v.cmd), '; ')
  INTO violations
  FROM public.anon_policy_violations() v;

  IF violations IS NOT NULL THEN
    RAISE EXCEPTION 'anon-policy guard failed: %', violations;
  END IF;
END $$;
