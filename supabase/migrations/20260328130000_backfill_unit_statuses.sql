-- Migration: Backfill unit statuses to the new derived progress model
-- Old statuses: pending_scheduling, scheduled_bracketing, bracketed_measured,
--               install_date_scheduled, installed_pending_approval, client_approved
-- New statuses: not_started, measured, bracketed, installed, client_approved

-- 1. Backfill units table
UPDATE units
SET status = CASE
  WHEN status = 'client_approved'          THEN 'client_approved'
  WHEN status = 'installed_pending_approval' THEN 'installed'
  WHEN status IN ('install_date_scheduled', 'bracketed_measured') THEN 'bracketed'
  WHEN status = 'scheduled_bracketing'     THEN 'measured'
  ELSE 'not_started'
END
WHERE status IN (
  'pending_scheduling',
  'scheduled_bracketing',
  'bracketed_measured',
  'install_date_scheduled',
  'installed_pending_approval'
);

-- 2. Backfill schedule_entries table
UPDATE schedule_entries
SET status = CASE
  WHEN status = 'client_approved'            THEN 'client_approved'
  WHEN status = 'installed_pending_approval' THEN 'installed'
  WHEN status IN ('install_date_scheduled', 'bracketed_measured') THEN 'bracketed'
  WHEN status = 'scheduled_bracketing'       THEN 'not_started'
  ELSE 'not_started'
END
WHERE status IN (
  'pending_scheduling',
  'scheduled_bracketing',
  'bracketed_measured',
  'install_date_scheduled',
  'installed_pending_approval'
);
