-- Refactor unit statuses: remove client_approved; parallel measured/bracketed; measured_and_bracketed gate before installed.
--
-- Valid statuses after migration:
--   not_started, measured, bracketed, measured_and_bracketed, installed
--
-- Derivation (same as app deriveStatusFromCoverage):
--   total_windows = 0 → not_started
--   all installed photos → installed
--   all measured AND all bracketed (but not all installed) → measured_and_bracketed
--   all measured only → measured
--   all bracketed only → bracketed
--   else → not_started

UPDATE units SET status = 'installed' WHERE status = 'client_approved';

DO $$
DECLARE
  rec RECORD;
  total_windows INT;
  measured_windows INT;
  bracketed_windows INT;
  installed_windows INT;
  new_status TEXT;
BEGIN
  FOR rec IN
    SELECT id, status FROM units
  LOOP
    SELECT COUNT(*) INTO total_windows
    FROM windows w
    JOIN rooms r ON r.id = w.room_id
    WHERE r.unit_id = rec.id;

    IF total_windows = 0 THEN
      new_status := 'not_started';
    ELSE
      SELECT COUNT(*) INTO measured_windows
      FROM windows w
      JOIN rooms r ON r.id = w.room_id
      WHERE r.unit_id = rec.id AND w.measured = TRUE;

      SELECT COUNT(DISTINCT m.window_id) INTO bracketed_windows
      FROM media_uploads m
      WHERE m.unit_id = rec.id
        AND m.stage = 'bracketed_measured'
        AND m.upload_kind = 'window_measure'
        AND m.window_id IS NOT NULL;

      SELECT COUNT(DISTINCT m.window_id) INTO installed_windows
      FROM media_uploads m
      WHERE m.unit_id = rec.id
        AND m.stage = 'installed_pending_approval'
        AND m.upload_kind = 'window_measure'
        AND m.window_id IS NOT NULL;

      IF installed_windows >= total_windows THEN
        new_status := 'installed';
      ELSIF measured_windows >= total_windows AND bracketed_windows >= total_windows THEN
        new_status := 'measured_and_bracketed';
      ELSIF measured_windows >= total_windows THEN
        new_status := 'measured';
      ELSIF bracketed_windows >= total_windows THEN
        new_status := 'bracketed';
      ELSE
        new_status := 'not_started';
      END IF;
    END IF;

    IF new_status IS DISTINCT FROM rec.status THEN
      UPDATE units SET status = new_status WHERE id = rec.id;
    END IF;
  END LOOP;
END;
$$;
