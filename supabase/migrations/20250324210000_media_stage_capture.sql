-- Add explicit workflow-stage metadata to media_uploads so unit views can
-- show before, measured, and installed-awaiting-approval photo sets.
--
-- Safe to run even if the `phase` migration (20250322170000) was not applied:
-- we add `phase` here with IF NOT EXISTS before referencing it.

ALTER TABLE media_uploads
ADD COLUMN IF NOT EXISTS phase TEXT;

ALTER TABLE media_uploads
ADD COLUMN IF NOT EXISTS stage TEXT;

-- Backfill stage from phase where phase already exists, otherwise default.
UPDATE media_uploads
SET stage = CASE
  WHEN stage IS NOT NULL THEN stage
  WHEN phase = 'installation' THEN 'installed_pending_approval'
  ELSE 'bracketed_measured'
END
WHERE stage IS NULL;

ALTER TABLE media_uploads
DROP CONSTRAINT IF EXISTS media_uploads_stage_check;

ALTER TABLE media_uploads
ADD CONSTRAINT media_uploads_stage_check CHECK (
  stage IN (
    'scheduled_bracketing',
    'bracketed_measured',
    'installed_pending_approval'
  )
);

CREATE INDEX IF NOT EXISTS media_uploads_stage_idx
ON media_uploads (stage, created_at DESC);

-- Sync the unit-level photo count to include all media_uploads rows,
-- not just windows with a photo_url.
UPDATE units
SET photos_uploaded = media_counts.count
FROM (
  SELECT unit_id, COUNT(*)::INT AS count
  FROM media_uploads
  GROUP BY unit_id
) AS media_counts
WHERE units.id = media_counts.unit_id;
