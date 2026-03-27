ALTER TABLE units ADD COLUMN priority text CHECK (priority IN ('low', 'medium', 'high'));
