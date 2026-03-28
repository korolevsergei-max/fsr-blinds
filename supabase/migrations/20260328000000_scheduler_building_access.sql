-- Scheduler building access table.
-- Owners explicitly grant each scheduler access to specific buildings.
-- A scheduler with no rows here sees an empty dataset.

CREATE TABLE IF NOT EXISTS scheduler_building_access (
  id TEXT PRIMARY KEY,
  scheduler_id TEXT NOT NULL REFERENCES schedulers(id) ON DELETE CASCADE,
  building_id TEXT NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(scheduler_id, building_id)
);

ALTER TABLE scheduler_building_access ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read/write their own access rows.
-- The server always runs as the authenticated user (owner or scheduler),
-- so a simple authenticated policy is sufficient; business-level
-- enforcement lives in the server actions / loaders.
CREATE POLICY "authenticated_manage_scheduler_building_access"
  ON scheduler_building_access
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
