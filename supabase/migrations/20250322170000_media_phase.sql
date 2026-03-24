-- Add phase column to media_uploads to track whether a photo was taken
-- during the bracketing/measurement phase or the installation phase.
-- Run in Supabase SQL Editor.

ALTER TABLE media_uploads ADD COLUMN IF NOT EXISTS phase TEXT;
-- Existing rows default to 'bracketing' since all historical photos were
-- taken during the measurement/bracketing workflow.
UPDATE media_uploads SET phase = 'bracketing' WHERE phase IS NULL;
