-- Schedulers assignable as installers: one mirrored `installers` row per scheduler.
--
-- CONTEXT. Some schedulers (Tom) also do the installs. They must be nameable as the
-- assigned installer on a unit while keeping ONE login — their scheduler account and
-- their scheduler portal. They never get an installer login.
--
-- The blocker is a foreign key: `units.assigned_installer_id REFERENCES installers(id)`
-- (20250322120000_initial_schema.sql:35). A `schedulers.id` can never be written there.
-- The app has long faked it — combineInstallersWithSchedulers() injects a synthetic
-- `sch-<id>` / `SC: <name>` pick-list row whose docstring says "so owners can assign a
-- unit to a scheduler acting as an installer" — but selecting one upserts
-- scheduler_unit_assignments and NULLS OUT assigned_installer_id. That is *coordinator*
-- assignment, a different (and still wanted) feature.
--
-- MODEL. Every scheduler gets a real `installers` row — an ALIAS row — created and kept
-- in sync by a trigger. `assigned_installer_id` then points at a genuine FK target, so
-- every existing read path, RLS policy, dataset RPC, dashboard, filter and schedule lane
-- keeps working with no change.
--
-- THREE RULES this migration exists to uphold (see docs/SCHEDULER_AS_INSTALLER.md):
--   1. An alias row's auth_user_id stays NULL. It is what auth_installer_id() resolves
--      (20260713170000:34-40); leaving it NULL guarantees a scheduler can never satisfy
--      an installer-arm RLS predicate or a getLinkedInstallerId() check, and can never
--      be routed to /installer. An alias row is an assignment target, never a login.
--   2. An alias row's scheduler_id equals its OWN scheduler id. That is the whole reason
--      no RLS or scoping function changes: can_access_unit(), units_select_scoped,
--      units_update_scoped, get_scheduler_dataset() and getSchedulerScopedUnitIds() all
--      already grant a scheduler "units whose assigned installer has scheduler_id = me".
--      Scope for units he installs therefore already exists.
--   3. An alias row never enters syncCoordinatorAssignmentForInstaller(). That helper
--      upserts one coordinator per unit keyed onConflict:"unit_id"; letting an alias
--      through would overwrite another scheduler's coordinator row and silently drop the
--      unit out of THEIR portal. Enforced in TS (src/app/actions/fsr-data/_shared.ts).
--
-- DELIBERATELY NOT CHANGED: no new role, no new portal, no new column on user_profiles,
-- no change to any SECURITY DEFINER function, no change to the dataset RPCs (they project
-- installers as row_to_json(i.*), so the new column flows through on its own), and the
-- coordinator "Assign scheduler" flow is untouched.
--
-- Rollback: see the DOWN block at the foot of this file.

-- ---------------------------------------------------------------------------
-- 1. The marker column
-- ---------------------------------------------------------------------------
-- ON DELETE CASCADE: deleting a scheduler drops their alias row, which in turn fires
-- the existing units.assigned_installer_id ON DELETE SET NULL — the same cleanup a
-- deleted installer already gets, rather than a dangling FK.
ALTER TABLE public.installers
  ADD COLUMN IF NOT EXISTS scheduler_alias_id TEXT
    REFERENCES public.schedulers(id) ON DELETE CASCADE;

COMMENT ON COLUMN public.installers.scheduler_alias_id IS
  'Non-null when this row is a scheduler''s field-work identity (an alias row), not a login. auth_user_id is always NULL on these.';

-- At most one alias per scheduler.
CREATE UNIQUE INDEX IF NOT EXISTS idx_installers_scheduler_alias_unique
  ON public.installers (scheduler_alias_id) WHERE scheduler_alias_id IS NOT NULL;

-- Read on every scheduler pick-list build and in emitNotification's reroute lookup.
CREATE INDEX IF NOT EXISTS idx_installers_scheduler_alias_present
  ON public.installers (id) WHERE scheduler_alias_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Email uniqueness now applies to real accounts only
-- ---------------------------------------------------------------------------
-- installers_email_key was added in 20260407000000_schema_best_practices.sql:157-160 to
-- "prevent duplicate accounts silently". An alias row is not an account and carries the
-- scheduler's real email, so it must sit outside that guarantee — otherwise a scheduler
-- who shares an email with an installer could not get an alias, and no real installer
-- account could later be created on a scheduler's address.
ALTER TABLE public.installers DROP CONSTRAINT IF EXISTS installers_email_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_installers_email_unique
  ON public.installers (email) WHERE scheduler_alias_id IS NULL;

-- ---------------------------------------------------------------------------
-- 3. The alias row is maintained by the database, not by the app
-- ---------------------------------------------------------------------------
-- A trigger rather than TS in createSchedulerAccount: it covers every path that can
-- create a scheduler (the server action, a CSV load, the Supabase SQL editor) and cannot
-- drift out of sync with a rename. The deterministic id makes it idempotent, so this same
-- statement is also the backfill in step 4.
--
-- avatar_url is '' on purpose: every picker already falls back to rendering initials when
-- avatarUrl is falsy (assign-unit.tsx:136), which avoids an external image fetch per row.
CREATE OR REPLACE FUNCTION public.sync_scheduler_installer_alias()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.installers (
    id, name, email, phone, avatar_url, scheduler_id, scheduler_alias_id, auth_user_id
  ) VALUES (
    'inst-sa-' || NEW.id,
    NEW.name,
    NEW.email,
    COALESCE(NEW.phone, ''),
    '',
    NEW.id,   -- RULE 2: own team, so existing scheduler scope covers units he installs
    NEW.id,
    NULL      -- RULE 1: never a login
  )
  ON CONFLICT (id) DO UPDATE SET
    name  = EXCLUDED.name,
    email = EXCLUDED.email,
    phone = EXCLUDED.phone;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_scheduler_installer_alias() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_sync_scheduler_installer_alias ON public.schedulers;
CREATE TRIGGER trg_sync_scheduler_installer_alias
AFTER INSERT OR UPDATE OF name, email, phone ON public.schedulers
FOR EACH ROW EXECUTE FUNCTION public.sync_scheduler_installer_alias();

-- ---------------------------------------------------------------------------
-- 4. Backfill every existing scheduler
-- ---------------------------------------------------------------------------
INSERT INTO public.installers (
  id, name, email, phone, avatar_url, scheduler_id, scheduler_alias_id, auth_user_id
)
SELECT
  'inst-sa-' || s.id,
  s.name,
  s.email,
  COALESCE(s.phone, ''),
  '',
  s.id,
  s.id,
  NULL
FROM public.schedulers s
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- DOWN (paste into the SQL editor to roll back)
-- ---------------------------------------------------------------------------
-- Deleting the alias rows first sets units.assigned_installer_id back to NULL for units
-- assigned to a scheduler, which is the pre-migration state. assigned_installer_name is
-- left behind by the FK's SET NULL exactly as it is for a deleted installer today; clear
-- it in the same statement if a clean revert matters.
--
-- UPDATE public.units u
--    SET assigned_installer_name = NULL
--  WHERE u.assigned_installer_id IN
--        (SELECT id FROM public.installers WHERE scheduler_alias_id IS NOT NULL);
-- DROP TRIGGER IF EXISTS trg_sync_scheduler_installer_alias ON public.schedulers;
-- DROP FUNCTION IF EXISTS public.sync_scheduler_installer_alias();
-- DELETE FROM public.installers WHERE scheduler_alias_id IS NOT NULL;
-- DROP INDEX IF EXISTS public.idx_installers_email_unique;
-- DROP INDEX IF EXISTS public.idx_installers_scheduler_alias_present;
-- DROP INDEX IF EXISTS public.idx_installers_scheduler_alias_unique;
-- ALTER TABLE public.installers DROP COLUMN IF EXISTS scheduler_alias_id;
-- ALTER TABLE public.installers ADD CONSTRAINT installers_email_key UNIQUE (email);
