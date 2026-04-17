-- Drop old blind size override columns (replaced by fabric adjustment offset on
-- the new manufacturing spec fields; window measurements are the source of truth)
ALTER TABLE windows DROP COLUMN IF EXISTS blind_width;
ALTER TABLE windows DROP COLUMN IF EXISTS blind_height;
ALTER TABLE windows DROP COLUMN IF EXISTS blind_depth;

-- Add new manufacturing specification columns
ALTER TABLE windows
  ADD COLUMN IF NOT EXISTS window_installation TEXT NOT NULL DEFAULT 'inside'
    CONSTRAINT windows_window_installation_check
      CHECK (window_installation IN ('inside', 'outside')),
  ADD COLUMN IF NOT EXISTS wand_chain SMALLINT
    CONSTRAINT windows_wand_chain_check
      CHECK (wand_chain IN (30, 40, 50)),
  ADD COLUMN IF NOT EXISTS fabric_adjustment_side TEXT NOT NULL DEFAULT 'none'
    CONSTRAINT windows_fabric_adjustment_side_check
      CHECK (fabric_adjustment_side IN ('none', 'left', 'right', 'centred')),
  ADD COLUMN IF NOT EXISTS fabric_adjustment_inches DOUBLE PRECISION;
