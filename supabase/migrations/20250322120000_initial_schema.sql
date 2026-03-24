-- FSRblinds schema + seed. Run in Supabase: SQL Editor → New query → paste → Run.
-- After auth is added, replace permissive anon policies with role-based rules.

CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  contact_phone TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS buildings (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS installers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  avatar_url TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS units (
  id TEXT PRIMARY KEY,
  building_id TEXT NOT NULL REFERENCES buildings (id) ON DELETE CASCADE,
  client_id TEXT NOT NULL REFERENCES clients (id) ON DELETE CASCADE,
  client_name TEXT NOT NULL,
  building_name TEXT NOT NULL,
  unit_number TEXT NOT NULL,
  status TEXT NOT NULL,
  risk_flag TEXT NOT NULL,
  assigned_installer_id TEXT REFERENCES installers (id) ON DELETE SET NULL,
  assigned_installer_name TEXT,
  bracketing_date TEXT,
  installation_date TEXT,
  room_count INTEGER NOT NULL DEFAULT 0,
  window_count INTEGER NOT NULL DEFAULT 0,
  photos_uploaded INTEGER NOT NULL DEFAULT 0,
  notes_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY,
  unit_id TEXT NOT NULL REFERENCES units (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  window_count INTEGER NOT NULL DEFAULT 0,
  completed_windows INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS windows (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES rooms (id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  blind_type TEXT NOT NULL,
  width DOUBLE PRECISION,
  height DOUBLE PRECISION,
  depth DOUBLE PRECISION,
  notes TEXT NOT NULL DEFAULT '',
  risk_flag TEXT NOT NULL,
  photo_url TEXT,
  measured BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS schedule_entries (
  id TEXT PRIMARY KEY,
  unit_id TEXT NOT NULL REFERENCES units (id) ON DELETE CASCADE,
  unit_number TEXT NOT NULL,
  building_name TEXT NOT NULL,
  client_name TEXT NOT NULL,
  task_type TEXT NOT NULL,
  task_date TEXT NOT NULL,
  status TEXT NOT NULL,
  risk_flag TEXT NOT NULL
);

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE buildings ENABLE ROW LEVEL SECURITY;
ALTER TABLE installers ENABLE ROW LEVEL SECURITY;
ALTER TABLE units ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE windows ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dev_anon_all_clients" ON clients;
DROP POLICY IF EXISTS "dev_anon_all_buildings" ON buildings;
DROP POLICY IF EXISTS "dev_anon_all_installers" ON installers;
DROP POLICY IF EXISTS "dev_anon_all_units" ON units;
DROP POLICY IF EXISTS "dev_anon_all_rooms" ON rooms;
DROP POLICY IF EXISTS "dev_anon_all_windows" ON windows;
DROP POLICY IF EXISTS "dev_anon_all_schedule_entries" ON schedule_entries;

CREATE POLICY "dev_anon_all_clients" ON clients FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "dev_anon_all_buildings" ON buildings FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "dev_anon_all_installers" ON installers FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "dev_anon_all_units" ON units FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "dev_anon_all_rooms" ON rooms FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "dev_anon_all_windows" ON windows FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "dev_anon_all_schedule_entries" ON schedule_entries FOR ALL TO anon USING (true) WITH CHECK (true);

INSERT INTO clients (id, name, contact_name, contact_email, contact_phone) VALUES
  ('client-1', 'Granite Peak Developments', 'Marcus Albrecht', 'marcus@granitepeakdev.ca', '+1 (416) 555-7834'),
  ('client-2', 'Lakeshore Construction Group', 'Priya Nandakumar', 'priya@lakeshorecg.ca', '+1 (905) 441-2290')
ON CONFLICT (id) DO NOTHING;

INSERT INTO buildings (id, client_id, name, address) VALUES
  ('bldg-1', 'client-1', 'The Weston Residences', '240 Weston Rd, Toronto, ON'),
  ('bldg-2', 'client-1', 'Bloor & Dundas Tower', '1801 Bloor St W, Toronto, ON'),
  ('bldg-3', 'client-2', 'Harbourfront Commons', '55 Lake Shore Blvd E, Toronto, ON')
ON CONFLICT (id) DO NOTHING;

INSERT INTO installers (id, name, email, phone, avatar_url) VALUES
  ('inst-1', 'Tom Uramowski', 'tom.u@fsrblinds.ca', '+1 (416) 823-4107', 'https://picsum.photos/seed/tom-uramowski/80/80'),
  ('inst-2', 'Lindsay Okafor', 'lindsay.o@fsrblinds.ca', '+1 (647) 391-8562', 'https://picsum.photos/seed/lindsay-okafor/80/80')
ON CONFLICT (id) DO NOTHING;

INSERT INTO units (
  id, building_id, client_id, client_name, building_name, unit_number, status, risk_flag,
  assigned_installer_id, assigned_installer_name, bracketing_date, installation_date,
  room_count, window_count, photos_uploaded, notes_count
) VALUES
  ('unit-1', 'bldg-1', 'client-1', 'Granite Peak Developments', 'The Weston Residences', 'Unit 1204', 'scheduled_bracketing', 'green', 'inst-1', 'Tom Uramowski', '2026-03-23', NULL, 3, 7, 0, 0),
  ('unit-2', 'bldg-1', 'client-1', 'Granite Peak Developments', 'The Weston Residences', 'Unit 1205', 'pending_scheduling', 'green', 'inst-1', 'Tom Uramowski', NULL, NULL, 0, 0, 0, 0),
  ('unit-3', 'bldg-2', 'client-1', 'Granite Peak Developments', 'Bloor & Dundas Tower', 'Unit 802', 'bracketed_measured', 'yellow', 'inst-1', 'Tom Uramowski', '2026-03-20', NULL, 2, 4, 4, 1),
  ('unit-4', 'bldg-3', 'client-2', 'Lakeshore Construction Group', 'Harbourfront Commons', 'Unit 305', 'install_date_scheduled', 'green', 'inst-2', 'Lindsay Okafor', '2026-03-10', '2026-04-14', 4, 9, 9, 2),
  ('unit-5', 'bldg-3', 'client-2', 'Lakeshore Construction Group', 'Harbourfront Commons', 'Unit 306', 'installed_pending_approval', 'red', 'inst-2', 'Lindsay Okafor', '2026-03-08', '2026-03-18', 3, 6, 12, 3),
  ('unit-6', 'bldg-1', 'client-1', 'Granite Peak Developments', 'The Weston Residences', 'Unit 1206', 'client_approved', 'green', 'inst-2', 'Lindsay Okafor', '2026-02-15', '2026-03-05', 2, 5, 10, 0)
ON CONFLICT (id) DO NOTHING;

INSERT INTO rooms (id, unit_id, name, window_count, completed_windows) VALUES
  ('room-1', 'unit-1', 'Living Room', 3, 0),
  ('room-2', 'unit-1', 'Bedroom 1', 2, 0),
  ('room-3', 'unit-1', 'Bedroom 2', 2, 0),
  ('room-4', 'unit-3', 'Master Suite', 2, 2),
  ('room-5', 'unit-3', 'Kitchen', 2, 2),
  ('room-6', 'unit-4', 'Living Room', 3, 3),
  ('room-7', 'unit-4', 'Bedroom 1', 2, 2),
  ('room-8', 'unit-4', 'Bedroom 2', 2, 2),
  ('room-9', 'unit-4', 'Office', 2, 2)
ON CONFLICT (id) DO NOTHING;

INSERT INTO windows (id, room_id, label, blind_type, width, height, depth, notes, risk_flag, photo_url, measured) VALUES
  ('win-1', 'room-1', 'Window A', 'screen', NULL, NULL, NULL, '', 'green', NULL, false),
  ('win-2', 'room-1', 'Window B', 'blackout', NULL, NULL, NULL, '', 'green', NULL, false),
  ('win-3', 'room-1', 'Window C', 'screen', NULL, NULL, NULL, '', 'green', NULL, false),
  ('win-4', 'room-2', 'Window A', 'blackout', NULL, NULL, NULL, '', 'green', NULL, false),
  ('win-5', 'room-2', 'Window B', 'blackout', NULL, NULL, NULL, '', 'green', NULL, false),
  ('win-6', 'room-4', 'Window A', 'screen', 48.5, 72.25, 3.5, 'Slight crack in frame, needs sealant before install', 'yellow', 'https://picsum.photos/seed/win6/400/300', true),
  ('win-7', 'room-4', 'Window B', 'blackout', 36, 60, 4, '', 'green', 'https://picsum.photos/seed/win7/400/300', true),
  ('win-8', 'room-5', 'Window A', 'screen', 24, 36, 3, '', 'green', 'https://picsum.photos/seed/win8/400/300', true),
  ('win-9', 'room-5', 'Window B', 'screen', 24, 36, 3, '', 'green', 'https://picsum.photos/seed/win9/400/300', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO schedule_entries (id, unit_id, unit_number, building_name, client_name, task_type, task_date, status, risk_flag) VALUES
  ('sch-1', 'unit-1', 'Unit 1204', 'The Weston Residences', 'Granite Peak Developments', 'bracketing', '2026-03-23', 'scheduled_bracketing', 'green'),
  ('sch-2', 'unit-2', 'Unit 1205', 'The Weston Residences', 'Granite Peak Developments', 'bracketing', '2026-03-25', 'pending_scheduling', 'green'),
  ('sch-3', 'unit-4', 'Unit 305', 'Harbourfront Commons', 'Lakeshore Construction Group', 'installation', '2026-04-14', 'install_date_scheduled', 'green'),
  ('sch-4', 'unit-3', 'Unit 802', 'Bloor & Dundas Tower', 'Granite Peak Developments', 'bracketing', '2026-03-24', 'bracketed_measured', 'yellow')
ON CONFLICT (id) DO NOTHING;

-- Storage/media setup so photo uploads work out of the box.
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
