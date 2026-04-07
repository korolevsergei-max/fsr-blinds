-- Schema best-practices hardening
-- Fixes: date columns (TEXT → DATE), missing FK indexes,
--        CHECK constraints on status/risk_flag, updated_at timestamps.
-- Safe to run on existing data — all changes are additive or constraint-only.

-- ============================================================
-- 1. DATE COLUMNS: convert TEXT → DATE
--    Using zero-downtime pattern: alter type directly.
--    Existing values are already ISO-8601 strings (e.g. '2026-04-14')
--    so implicit cast succeeds; NULLs remain NULL.
-- ============================================================

ALTER TABLE units
  ALTER COLUMN bracketing_date         TYPE DATE USING bracketing_date::DATE,
  ALTER COLUMN installation_date       TYPE DATE USING installation_date::DATE,
  ALTER COLUMN earliest_bracketing_date TYPE DATE USING earliest_bracketing_date::DATE,
  ALTER COLUMN earliest_installation_date TYPE DATE USING earliest_installation_date::DATE;

ALTER TABLE schedule_entries
  ALTER COLUMN task_date TYPE DATE USING task_date::DATE;

-- measurement_date was already added as DATE — no change needed.

-- ============================================================
-- 2. FK INDEXES
--    Every foreign key gets an index for fast JOINs and lookups.
-- ============================================================

-- buildings
CREATE INDEX IF NOT EXISTS idx_buildings_client_id
  ON buildings (client_id);

-- units
CREATE INDEX IF NOT EXISTS idx_units_building_id
  ON units (building_id);
CREATE INDEX IF NOT EXISTS idx_units_client_id
  ON units (client_id);
CREATE INDEX IF NOT EXISTS idx_units_assigned_installer_id
  ON units (assigned_installer_id);

-- rooms
CREATE INDEX IF NOT EXISTS idx_rooms_unit_id
  ON rooms (unit_id);

-- windows
CREATE INDEX IF NOT EXISTS idx_windows_room_id
  ON windows (room_id);

-- schedule_entries
CREATE INDEX IF NOT EXISTS idx_schedule_entries_unit_id
  ON schedule_entries (unit_id);
-- common filter: entries for a given date
CREATE INDEX IF NOT EXISTS idx_schedule_entries_task_date
  ON schedule_entries (task_date);

-- media_uploads (unit_id already exists; add missing ones)
CREATE INDEX IF NOT EXISTS idx_media_uploads_room_id
  ON media_uploads (room_id);
CREATE INDEX IF NOT EXISTS idx_media_uploads_window_id
  ON media_uploads (window_id);

-- scheduler_unit_assignments
CREATE INDEX IF NOT EXISTS idx_sua_scheduler_id
  ON scheduler_unit_assignments (scheduler_id);
-- unit_id already has UNIQUE constraint (which implies an index)

-- window_production_status
CREATE INDEX IF NOT EXISTS idx_wps_unit_id
  ON window_production_status (unit_id);
-- window_id already has UNIQUE constraint (which implies an index)

-- unit_activity_log (already indexed on unit_id and created_at — no change needed)

-- ============================================================
-- 3. CHECK CONSTRAINTS on status / risk_flag TEXT columns
-- ============================================================

-- units.status (values from refactor migration + historical ones still present)
ALTER TABLE units
  DROP CONSTRAINT IF EXISTS units_status_check;
ALTER TABLE units
  ADD CONSTRAINT units_status_check
  CHECK (status IN (
    'not_started',
    'measured',
    'bracketed',
    'measured_and_bracketed',
    'installed',
    -- legacy values (kept for any rows not yet migrated)
    'pending_scheduling',
    'scheduled_bracketing',
    'bracketed_measured',
    'install_date_scheduled',
    'installed_pending_approval',
    'client_approved'
  ));

-- units.risk_flag
ALTER TABLE units
  DROP CONSTRAINT IF EXISTS units_risk_flag_check;
ALTER TABLE units
  ADD CONSTRAINT units_risk_flag_check
  CHECK (risk_flag IN ('green', 'yellow', 'red'));

-- windows.risk_flag
ALTER TABLE windows
  DROP CONSTRAINT IF EXISTS windows_risk_flag_check;
ALTER TABLE windows
  ADD CONSTRAINT windows_risk_flag_check
  CHECK (risk_flag IN ('green', 'yellow', 'red'));

-- schedule_entries.status
ALTER TABLE schedule_entries
  DROP CONSTRAINT IF EXISTS schedule_entries_status_check;
ALTER TABLE schedule_entries
  ADD CONSTRAINT schedule_entries_status_check
  CHECK (status IN (
    'not_started',
    'measured',
    'bracketed',
    'measured_and_bracketed',
    'installed',
    'pending_scheduling',
    'scheduled_bracketing',
    'bracketed_measured',
    'install_date_scheduled',
    'installed_pending_approval',
    'client_approved'
  ));

-- schedule_entries.risk_flag
ALTER TABLE schedule_entries
  DROP CONSTRAINT IF EXISTS schedule_entries_risk_flag_check;
ALTER TABLE schedule_entries
  ADD CONSTRAINT schedule_entries_risk_flag_check
  CHECK (risk_flag IN ('green', 'yellow', 'red'));

-- schedule_entries.task_type
ALTER TABLE schedule_entries
  DROP CONSTRAINT IF EXISTS schedule_entries_task_type_check;
ALTER TABLE schedule_entries
  ADD CONSTRAINT schedule_entries_task_type_check
  CHECK (task_type IN ('bracketing', 'installation', 'measurement'));

-- unit_activity_log.actor_role
ALTER TABLE unit_activity_log
  DROP CONSTRAINT IF EXISTS unit_activity_log_actor_role_check;
ALTER TABLE unit_activity_log
  ADD CONSTRAINT unit_activity_log_actor_role_check
  CHECK (actor_role IN ('owner', 'installer', 'manufacturer', 'scheduler', 'qc', 'system'));

-- ============================================================
-- 4. UNIQUE constraint on email for person/staff tables
--    (prevents duplicate accounts silently)
-- ============================================================

ALTER TABLE installers
  DROP CONSTRAINT IF EXISTS installers_email_key;
ALTER TABLE installers
  ADD CONSTRAINT installers_email_key UNIQUE (email);

ALTER TABLE schedulers
  DROP CONSTRAINT IF EXISTS schedulers_email_key;
ALTER TABLE schedulers
  ADD CONSTRAINT schedulers_email_key UNIQUE (email);

ALTER TABLE qc_persons
  DROP CONSTRAINT IF EXISTS qc_persons_email_key;
ALTER TABLE qc_persons
  ADD CONSTRAINT qc_persons_email_key UNIQUE (email);

ALTER TABLE manufacturers
  DROP CONSTRAINT IF EXISTS manufacturers_contact_email_key;
-- Note: manufacturers.contact_email can be blank ('') so we use a partial unique index instead
CREATE UNIQUE INDEX IF NOT EXISTS idx_manufacturers_contact_email_unique
  ON manufacturers (contact_email)
  WHERE contact_email <> '';

-- ============================================================
-- 5. updated_at TIMESTAMPS
--    Added as nullable (safe zero-downtime); existing rows stay NULL.
--    App code should set updated_at on every UPDATE going forward.
-- ============================================================

ALTER TABLE clients          ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
ALTER TABLE buildings        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
ALTER TABLE installers       ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
ALTER TABLE units            ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
ALTER TABLE rooms            ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
ALTER TABLE windows          ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
ALTER TABLE schedule_entries ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
ALTER TABLE schedulers       ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
ALTER TABLE manufacturers    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
ALTER TABLE qc_persons       ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
ALTER TABLE window_production_status ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- Trigger function: auto-set updated_at on every row update.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Attach trigger to every table that now has updated_at.
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'clients', 'buildings', 'installers', 'units', 'rooms', 'windows',
    'schedule_entries', 'schedulers', 'manufacturers', 'qc_persons',
    'window_production_status'
  ]
  LOOP
    EXECUTE format('
      DROP TRIGGER IF EXISTS trg_set_updated_at ON %I;
      CREATE TRIGGER trg_set_updated_at
        BEFORE UPDATE ON %I
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
    ', tbl, tbl);
  END LOOP;
END;
$$;

-- ============================================================
-- DOWN (reversible)
-- ============================================================
-- To revert:
--
-- ALTER TABLE units ALTER COLUMN bracketing_date TYPE TEXT USING bracketing_date::TEXT;
-- ALTER TABLE units ALTER COLUMN installation_date TYPE TEXT USING installation_date::TEXT;
-- ALTER TABLE units ALTER COLUMN earliest_bracketing_date TYPE TEXT USING earliest_bracketing_date::TEXT;
-- ALTER TABLE units ALTER COLUMN earliest_installation_date TYPE TEXT USING earliest_installation_date::TEXT;
-- ALTER TABLE schedule_entries ALTER COLUMN task_date TYPE TEXT USING task_date::TEXT;
--
-- DROP INDEX IF EXISTS idx_buildings_client_id;
-- DROP INDEX IF EXISTS idx_units_building_id;
-- DROP INDEX IF EXISTS idx_units_client_id;
-- DROP INDEX IF EXISTS idx_units_assigned_installer_id;
-- DROP INDEX IF EXISTS idx_rooms_unit_id;
-- DROP INDEX IF EXISTS idx_windows_room_id;
-- DROP INDEX IF EXISTS idx_schedule_entries_unit_id;
-- DROP INDEX IF EXISTS idx_schedule_entries_task_date;
-- DROP INDEX IF EXISTS idx_media_uploads_room_id;
-- DROP INDEX IF EXISTS idx_media_uploads_window_id;
-- DROP INDEX IF EXISTS idx_sua_scheduler_id;
-- DROP INDEX IF EXISTS idx_wps_unit_id;
--
-- ALTER TABLE units DROP CONSTRAINT IF EXISTS units_status_check;
-- ALTER TABLE units DROP CONSTRAINT IF EXISTS units_risk_flag_check;
-- ALTER TABLE windows DROP CONSTRAINT IF EXISTS windows_risk_flag_check;
-- ALTER TABLE schedule_entries DROP CONSTRAINT IF EXISTS schedule_entries_status_check;
-- ALTER TABLE schedule_entries DROP CONSTRAINT IF EXISTS schedule_entries_risk_flag_check;
-- ALTER TABLE schedule_entries DROP CONSTRAINT IF EXISTS schedule_entries_task_type_check;
-- ALTER TABLE unit_activity_log DROP CONSTRAINT IF EXISTS unit_activity_log_actor_role_check;
-- ALTER TABLE installers DROP CONSTRAINT IF EXISTS installers_email_key;
-- ALTER TABLE schedulers DROP CONSTRAINT IF EXISTS schedulers_email_key;
-- ALTER TABLE qc_persons DROP CONSTRAINT IF EXISTS qc_persons_email_key;
-- DROP INDEX IF EXISTS idx_manufacturers_contact_email_unique;
--
-- ALTER TABLE clients DROP COLUMN IF EXISTS updated_at;
-- ALTER TABLE buildings DROP COLUMN IF EXISTS updated_at;
-- ALTER TABLE installers DROP COLUMN IF EXISTS updated_at;
-- ALTER TABLE units DROP COLUMN IF EXISTS updated_at;
-- ALTER TABLE rooms DROP COLUMN IF EXISTS updated_at;
-- ALTER TABLE windows DROP COLUMN IF EXISTS updated_at;
-- ALTER TABLE schedule_entries DROP COLUMN IF EXISTS updated_at;
-- ALTER TABLE schedulers DROP COLUMN IF EXISTS updated_at;
-- ALTER TABLE manufacturers DROP COLUMN IF EXISTS updated_at;
-- ALTER TABLE qc_persons DROP COLUMN IF EXISTS updated_at;
-- ALTER TABLE window_production_status DROP COLUMN IF EXISTS updated_at;
-- DROP FUNCTION IF EXISTS public.set_updated_at();
