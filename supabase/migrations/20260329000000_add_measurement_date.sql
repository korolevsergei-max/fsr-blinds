-- Add measurement_date to units for scheduling the measurement phase.
-- complete_by_date is retained in DB for historical data but retired from active scheduling.

ALTER TABLE units ADD COLUMN IF NOT EXISTS measurement_date date;

-- Extend schedule_entries task_type to allow 'measurement' tasks.
-- The column is a text field (not an enum) so no enum migration is required;
-- the app-layer union type change in types.ts is the only code change needed.
