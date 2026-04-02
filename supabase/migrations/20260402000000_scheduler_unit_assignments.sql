-- Scheduler unit assignments.
-- Owner explicitly assigns specific units to a scheduler.
-- A unit can belong to at most one scheduler (UNIQUE on unit_id).
-- Reassigning a unit to another scheduler removes the previous assignment.

CREATE TABLE IF NOT EXISTS scheduler_unit_assignments (
  id           TEXT        PRIMARY KEY,
  scheduler_id TEXT        NOT NULL REFERENCES schedulers(id) ON DELETE CASCADE,
  unit_id      TEXT        NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  assigned_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(unit_id)          -- one scheduler per unit; reassign = move
);

ALTER TABLE scheduler_unit_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_manage_scheduler_unit_assignments"
  ON scheduler_unit_assignments
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Link installers to a scheduler (their team).
-- When a scheduler creates an installer the action sets this FK.
ALTER TABLE installers ADD COLUMN IF NOT EXISTS scheduler_id TEXT REFERENCES schedulers(id) ON DELETE SET NULL;
