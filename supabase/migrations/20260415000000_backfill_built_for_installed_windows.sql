-- One-time backfill: mark all installed windows as qc_approved (Built) in window_production_status.
--
-- For windows where installed = true:
--   • If a window_production_status row already exists and is NOT qc_approved → set it to qc_approved.
--   • If no window_production_status row exists → insert one with status = 'qc_approved'.
--
-- This is an admin exception pass; attribution columns are left null (no specific cutter/assembler/qc).

DO $$
DECLARE
  w RECORD;
  existing_id TEXT;
BEGIN
  FOR w IN
    SELECT win.id AS window_id, r.unit_id
    FROM windows win
    JOIN rooms r ON r.id = win.room_id
    WHERE win.installed = TRUE
  LOOP
    -- Check for an existing production status row
    SELECT id INTO existing_id
    FROM window_production_status
    WHERE window_id = w.window_id;

    IF existing_id IS NOT NULL THEN
      -- Only update if not already qc_approved
      UPDATE window_production_status
      SET
        status        = 'qc_approved',
        qc_approved_at = COALESCE(qc_approved_at, NOW())
      WHERE id = existing_id
        AND status != 'qc_approved';
    ELSE
      -- Insert a new row
      INSERT INTO window_production_status (
        id,
        window_id,
        unit_id,
        status,
        qc_approved_at
      ) VALUES (
        gen_random_uuid()::text,
        w.window_id,
        w.unit_id,
        'qc_approved',
        NOW()
      );
    END IF;
  END LOOP;
END;
$$;
