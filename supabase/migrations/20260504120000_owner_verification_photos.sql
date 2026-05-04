-- Owner-only verification photos for private post-install inspection notes.

CREATE TABLE IF NOT EXISTS public.owner_verification_photos (
  id                  TEXT PRIMARY KEY,
  unit_id             TEXT NOT NULL REFERENCES public.units (id) ON DELETE CASCADE,
  storage_path        TEXT NOT NULL UNIQUE,
  note                TEXT NOT NULL DEFAULT '',
  created_by_user_id  UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  created_by_name     TEXT NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT owner_verification_photos_note_length
    CHECK (char_length(note) <= 1000)
);

CREATE INDEX IF NOT EXISTS owner_verification_photos_unit_created_idx
  ON public.owner_verification_photos (unit_id, created_at DESC);

ALTER TABLE public.owner_verification_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner_manage_owner_verification_photos" ON public.owner_verification_photos;
CREATE POLICY "owner_manage_owner_verification_photos"
  ON public.owner_verification_photos
  FOR ALL TO authenticated
  USING (public.get_user_role() = 'owner')
  WITH CHECK (public.get_user_role() = 'owner');

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace
      AND proname = 'set_updated_at'
  ) THEN
    DROP TRIGGER IF EXISTS trg_set_updated_at ON public.owner_verification_photos;
    CREATE TRIGGER trg_set_updated_at
      BEFORE UPDATE ON public.owner_verification_photos
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

INSERT INTO storage.buckets (id, name, public)
VALUES ('fsr-owner-verification', 'fsr-owner-verification', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS "owner_read_owner_verification_objects" ON storage.objects;
CREATE POLICY "owner_read_owner_verification_objects"
  ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'fsr-owner-verification'
    AND public.get_user_role() = 'owner'
  );

DROP POLICY IF EXISTS "owner_insert_owner_verification_objects" ON storage.objects;
CREATE POLICY "owner_insert_owner_verification_objects"
  ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'fsr-owner-verification'
    AND public.get_user_role() = 'owner'
  );

DROP POLICY IF EXISTS "owner_update_owner_verification_objects" ON storage.objects;
CREATE POLICY "owner_update_owner_verification_objects"
  ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'fsr-owner-verification'
    AND public.get_user_role() = 'owner'
  )
  WITH CHECK (
    bucket_id = 'fsr-owner-verification'
    AND public.get_user_role() = 'owner'
  );

DROP POLICY IF EXISTS "owner_delete_owner_verification_objects" ON storage.objects;
CREATE POLICY "owner_delete_owner_verification_objects"
  ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'fsr-owner-verification'
    AND public.get_user_role() = 'owner'
  );
