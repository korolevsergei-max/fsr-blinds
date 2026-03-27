ALTER TABLE schedule_entries
ADD COLUMN IF NOT EXISTS owner_user_id TEXT,
ADD COLUMN IF NOT EXISTS owner_name TEXT;

CREATE INDEX IF NOT EXISTS idx_schedule_entries_owner_user_id
ON schedule_entries (owner_user_id);
