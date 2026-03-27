-- Add occupancy_date to units table
ALTER TABLE public.units ADD COLUMN IF NOT EXISTS occupancy_date TEXT;
