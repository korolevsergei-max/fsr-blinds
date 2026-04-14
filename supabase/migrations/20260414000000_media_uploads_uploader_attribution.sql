-- Add uploader attribution columns to media_uploads so each photo records who
-- uploaded it, when, and in what role. Denormalised intentionally: the display
-- name is snapshotted at upload time so overlays remain accurate even if a
-- user is later renamed or deleted.

ALTER TABLE media_uploads
ADD COLUMN IF NOT EXISTS uploaded_by_user_id TEXT,
ADD COLUMN IF NOT EXISTS uploaded_by_name TEXT,
ADD COLUMN IF NOT EXISTS uploaded_by_role TEXT;

-- Index used by gallery queries that need to show uploader per photo.
CREATE INDEX IF NOT EXISTS media_uploads_window_stage_created_idx
ON media_uploads (window_id, stage, created_at DESC);
