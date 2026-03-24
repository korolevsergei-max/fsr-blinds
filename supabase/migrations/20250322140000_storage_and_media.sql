-- Storage bucket + media index + unit status notes.
-- Run in Supabase SQL Editor after the initial schema migration.

ALTER TABLE units ADD COLUMN IF NOT EXISTS status_note TEXT;

CREATE TABLE IF NOT EXISTS media_uploads (
  id TEXT PRIMARY KEY,
  storage_path TEXT NOT NULL,
  public_url TEXT NOT NULL,
  upload_kind TEXT NOT NULL,
  unit_id TEXT NOT NULL REFERENCES units (id) ON DELETE CASCADE,
  room_id TEXT REFERENCES rooms (id) ON DELETE SET NULL,
  window_id TEXT REFERENCES windows (id) ON DELETE CASCADE,
  label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS media_uploads_unit_id_idx ON media_uploads (unit_id);
CREATE INDEX IF NOT EXISTS media_uploads_created_at_idx ON media_uploads (created_at DESC);

ALTER TABLE media_uploads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dev_anon_all_media_uploads" ON media_uploads;
CREATE POLICY "dev_anon_all_media_uploads" ON media_uploads FOR ALL TO anon USING (true) WITH CHECK (true);

INSERT INTO storage.buckets (id, name, public)
VALUES ('fsr-media', 'fsr-media', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

DROP POLICY IF EXISTS "fsr_media_objects_all" ON storage.objects;
CREATE POLICY "fsr_media_objects_all"
ON storage.objects FOR ALL TO public
USING (bucket_id = 'fsr-media')
WITH CHECK (bucket_id = 'fsr-media');
