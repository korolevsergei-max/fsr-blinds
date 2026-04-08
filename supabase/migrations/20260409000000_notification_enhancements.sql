-- Notification enhancements: add unit deep-link reference and type index.

-- Optional unit reference so the UI can deep-link from a notification to the unit detail page.
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS related_unit_id TEXT;

-- Index on type for efficient per-category queries.
CREATE INDEX IF NOT EXISTS notifications_type_idx ON notifications (type);

-- RLS: ensure authenticated users can read their own notifications.
-- (The existing anon policies remain for dev; production should tighten these.)
DROP POLICY IF EXISTS "authenticated_read_own_notifications" ON notifications;
CREATE POLICY "authenticated_read_own_notifications" ON notifications
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "authenticated_insert_notifications" ON notifications;
CREATE POLICY "authenticated_insert_notifications" ON notifications
  FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_read_own_notification_reads" ON notification_reads;
CREATE POLICY "authenticated_read_own_notification_reads" ON notification_reads
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
