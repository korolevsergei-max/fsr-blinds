-- Phase C4 (roadmap Phase 7), part 1: denormalize unit_id onto windows.
--
-- windows carries only room_id, so server-side realtime scoping is impossible
-- (postgres_changes filters need a single column) and every unit-resolution in
-- an action pays a rooms!inner join. rooms.unit_id is NOT NULL and
-- windows.room_id is NOT NULL → every window has exactly one unit, so the
-- denormalization is total and safe to make NOT NULL.
--
-- This migration is the ENABLER only: it adds the column, backfills it, keeps it
-- consistent via a trigger (rooms.unit_id stays the single source of truth), and
-- indexes it. It changes NO behavior — nothing reads windows.unit_id yet. The
-- server-side realtime scoping + the markWindowCut join simplification land in a
-- follow-up, gated on the two-browser + DELETE-event-delivery verification the
-- roadmap requires (a filtered postgres_changes subscription may not deliver
-- DELETE events, and a missed update on a field/factory client is a correctness
-- bug). Rollback: DROP the trigger + column (harmless — nothing depends on it).

ALTER TABLE public.windows ADD COLUMN IF NOT EXISTS unit_id TEXT;

-- Backfill from the owning room. (Updates unit_id only, so it does not fire the
-- room_id trigger created below.)
UPDATE public.windows w
SET unit_id = r.unit_id
FROM public.rooms r
WHERE r.id = w.room_id
  AND (w.unit_id IS DISTINCT FROM r.unit_id);

-- FK + NOT NULL now that every row is backfilled.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'windows_unit_id_fkey'
  ) THEN
    ALTER TABLE public.windows
      ADD CONSTRAINT windows_unit_id_fkey
      FOREIGN KEY (unit_id) REFERENCES public.units(id) ON DELETE CASCADE;
  END IF;
END $$;

ALTER TABLE public.windows ALTER COLUMN unit_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_windows_unit_id ON public.windows (unit_id);

-- Keep windows.unit_id consistent with its room. rooms.unit_id remains the
-- single source of truth; write paths do not need to supply unit_id (this
-- BEFORE trigger fills it before the NOT NULL check). Fires on INSERT and
-- whenever room_id changes (a window reassigned to another room/unit).
CREATE OR REPLACE FUNCTION public.windows_set_unit_id()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.room_id IS NOT NULL THEN
    SELECT r.unit_id INTO NEW.unit_id FROM rooms r WHERE r.id = NEW.room_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_windows_set_unit_id ON public.windows;
CREATE TRIGGER trg_windows_set_unit_id
  BEFORE INSERT OR UPDATE OF room_id ON public.windows
  FOR EACH ROW EXECUTE FUNCTION public.windows_set_unit_id();
