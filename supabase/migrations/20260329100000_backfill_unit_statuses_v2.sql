-- Backfill unit statuses based on actual evidence in the database.
--
-- Status ladder:
--   not_started  → no windows measured
--   measured     → all windows measured, but NOT all have bracketed photos
--   bracketed    → all windows have bracketed photos, but NOT all have installed photos
--   installed    → all windows have both bracketed AND installed photos
--   client_approved → already approved; never touched by auto-derive
--
-- "Bracketed photo" = media_uploads row where stage='bracketed_measured' AND upload_kind='window_measure'
-- "Installed photo" = media_uploads row where stage='installed_pending_approval' AND upload_kind='window_measure'

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
    SELECT id, status FROM units WHERE status != 'client_approved'
  LOOP
    -- Count total windows for this unit (across all rooms)
    SELECT COUNT(*) INTO total_windows
    FROM windows w
    JOIN rooms r ON r.id = w.room_id
    WHERE r.unit_id = rec.id;

    IF total_windows = 0 THEN
      new_status := 'not_started';
    ELSE
      -- Count measured windows
      SELECT COUNT(*) INTO measured_windows
      FROM windows w
      JOIN rooms r ON r.id = w.room_id
      WHERE r.unit_id = rec.id AND w.measured = TRUE;

      IF measured_windows < total_windows THEN
        new_status := 'not_started';
      ELSE
        -- Count windows with at least one qualifying bracketing photo
        SELECT COUNT(DISTINCT m.window_id) INTO bracketed_windows
        FROM media_uploads m
        WHERE m.unit_id = rec.id
          AND m.stage = 'bracketed_measured'
          AND m.upload_kind = 'window_measure'
          AND m.window_id IS NOT NULL;

        IF bracketed_windows < total_windows THEN
          new_status := 'measured';
        ELSE
          -- Count windows with at least one qualifying installed photo
          SELECT COUNT(DISTINCT m.window_id) INTO installed_windows
          FROM media_uploads m
          WHERE m.unit_id = rec.id
            AND m.stage = 'installed_pending_approval'
            AND m.upload_kind = 'window_measure'
            AND m.window_id IS NOT NULL;

          IF installed_windows < total_windows THEN
            new_status := 'bracketed';
          ELSE
            new_status := 'installed';
          END IF;
        END IF;
      END IF;
    END IF;

    -- Only update if status actually changed
    IF new_status IS DISTINCT FROM rec.status THEN
      UPDATE units SET status = new_status WHERE id = rec.id;
    END IF;
  END LOOP;
END;
$$;
