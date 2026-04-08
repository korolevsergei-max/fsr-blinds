-- Restructure manufacturing: manufacturer→cutter, qc→assembler, add 3-step workflow.
-- Status flow: pending → cut → assembled → qc_approved

-- 1) Rename manufacturers table → cutters
ALTER TABLE public.manufacturers RENAME TO cutters;

-- Rename RLS policies
ALTER POLICY "authenticated_all_manufacturers" ON public.cutters RENAME TO "authenticated_all_cutters";

-- 2) Rename qc_persons table → assemblers
ALTER TABLE public.qc_persons RENAME TO assemblers;

ALTER POLICY "authenticated_all_qc_persons" ON public.assemblers RENAME TO "authenticated_all_assemblers";

-- 3) Update user_profiles role check
ALTER TABLE public.user_profiles DROP CONSTRAINT IF EXISTS user_profiles_role_check;
ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_role_check
  CHECK (role IN ('owner', 'installer', 'cutter', 'client', 'scheduler', 'assembler'));

-- Migrate existing role values
UPDATE public.user_profiles SET role = 'cutter' WHERE role = 'manufacturer';
UPDATE public.user_profiles SET role = 'assembler' WHERE role = 'qc';

-- 4) Alter window_production_status

-- Drop old status check, FK constraints
ALTER TABLE public.window_production_status DROP CONSTRAINT IF EXISTS window_production_status_status_check;
ALTER TABLE public.window_production_status DROP CONSTRAINT IF EXISTS window_production_status_built_by_manufacturer_id_fkey;
ALTER TABLE public.window_production_status DROP CONSTRAINT IF EXISTS window_production_status_qc_approved_by_qc_id_fkey;

-- Rename columns for cutting step
ALTER TABLE public.window_production_status RENAME COLUMN built_by_manufacturer_id TO cut_by_cutter_id;
ALTER TABLE public.window_production_status RENAME COLUMN built_at TO cut_at;
ALTER TABLE public.window_production_status RENAME COLUMN built_notes TO cut_notes;

-- Add assembly columns
ALTER TABLE public.window_production_status
  ADD COLUMN IF NOT EXISTS assembled_by_assembler_id TEXT REFERENCES public.assemblers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assembled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS assembled_notes TEXT NOT NULL DEFAULT '';

-- Rename QC columns
ALTER TABLE public.window_production_status RENAME COLUMN qc_approved_by_qc_id TO qc_approved_by_assembler_id;

-- Add new status check and FK constraints
ALTER TABLE public.window_production_status
  ADD CONSTRAINT window_production_status_status_check
  CHECK (status IN ('pending', 'cut', 'assembled', 'qc_approved'));

ALTER TABLE public.window_production_status
  ADD CONSTRAINT window_production_status_cut_by_cutter_id_fkey
  FOREIGN KEY (cut_by_cutter_id) REFERENCES public.cutters(id) ON DELETE SET NULL;

ALTER TABLE public.window_production_status
  ADD CONSTRAINT window_production_status_qc_approved_by_assembler_id_fkey
  FOREIGN KEY (qc_approved_by_assembler_id) REFERENCES public.assemblers(id) ON DELETE SET NULL;

-- Migrate any existing status values (should be none per user, but safe)
UPDATE public.window_production_status SET status = 'cut' WHERE status = 'built';

-- 5) Refresh user_directory view
CREATE OR REPLACE VIEW public.user_directory AS
SELECT
  u.id AS auth_user_id,
  u.email,
  u.created_at,
  p.role AS user_type,
  p.display_name
FROM auth.users u
LEFT JOIN public.user_profiles p
  ON p.id = u.id;

GRANT SELECT ON public.user_directory TO authenticated;
