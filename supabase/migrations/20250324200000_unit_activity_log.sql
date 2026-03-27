-- Add created_at to units so we can filter by "recently added"
ALTER TABLE units ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

-- Activity log: every meaningful change to a unit is recorded here.
-- actor_role: 'owner' | 'installer' | 'manufacturer' | 'system'
CREATE TABLE IF NOT EXISTS unit_activity_log (
  id          TEXT PRIMARY KEY,
  unit_id     TEXT NOT NULL REFERENCES units (id) ON DELETE CASCADE,
  actor_role  TEXT NOT NULL,
  actor_name  TEXT NOT NULL,
  action      TEXT NOT NULL,
  details     JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS unit_activity_log_unit_id_idx  ON unit_activity_log (unit_id);
CREATE INDEX IF NOT EXISTS unit_activity_log_created_at_idx ON unit_activity_log (created_at DESC);

ALTER TABLE unit_activity_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dev_anon_all_unit_activity_log" ON unit_activity_log;
CREATE POLICY "dev_anon_all_unit_activity_log"
  ON unit_activity_log FOR ALL TO anon USING (true) WITH CHECK (true);

-- Seed a few sample log entries so the history panel isn't empty in dev.
INSERT INTO unit_activity_log (id, unit_id, actor_role, actor_name, action, details, created_at) VALUES
  ('log-1', 'unit-1', 'system',    'System',         'unit_created',        NULL,                                                                            now() - INTERVAL '10 days'),
  ('log-2', 'unit-1', 'owner',     'Admin',           'installer_assigned',  '{"installer":"Tom Uramowski"}'::jsonb,                                          now() - INTERVAL '9 days'),
  ('log-3', 'unit-1', 'owner',     'Admin',           'bracketing_date_set', '{"date":"2026-03-23"}'::jsonb,                                                  now() - INTERVAL '9 days'),
  ('log-4', 'unit-3', 'system',    'System',         'unit_created',        NULL,                                                                            now() - INTERVAL '15 days'),
  ('log-5', 'unit-3', 'owner',     'Admin',           'installer_assigned',  '{"installer":"Tom Uramowski"}'::jsonb,                                          now() - INTERVAL '14 days'),
  ('log-6', 'unit-3', 'installer', 'Tom Uramowski',   'status_changed',      '{"from":"scheduled_bracketing","to":"bracketed_measured","note":""}'::jsonb,    now() - INTERVAL '4 days'),
  ('log-7', 'unit-5', 'system',    'System',         'unit_created',        NULL,                                                                            now() - INTERVAL '20 days'),
  ('log-8', 'unit-5', 'installer', 'Lindsay Okafor', 'status_changed',      '{"from":"install_date_scheduled","to":"installed_pending_approval","note":"Installed. Minor scratch on frame noted."}'::jsonb, now() - INTERVAL '6 days')
ON CONFLICT (id) DO NOTHING;
