-- Optional blind-size measurements on windows.
ALTER TABLE windows ADD COLUMN IF NOT EXISTS blind_width DOUBLE PRECISION;
ALTER TABLE windows ADD COLUMN IF NOT EXISTS blind_height DOUBLE PRECISION;
ALTER TABLE windows ADD COLUMN IF NOT EXISTS blind_depth DOUBLE PRECISION;

-- Notifications: multi-party-safe (recipient_role + recipient_id).
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  recipient_role TEXT NOT NULL,
  recipient_id TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  related_week_start TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_recipient_idx
  ON notifications (recipient_role, recipient_id);
CREATE INDEX IF NOT EXISTS notifications_created_at_idx
  ON notifications (created_at DESC);

CREATE TABLE IF NOT EXISTS notification_reads (
  notification_id TEXT NOT NULL REFERENCES notifications (id) ON DELETE CASCADE,
  user_role TEXT NOT NULL,
  user_id TEXT NOT NULL,
  read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (notification_id, user_role, user_id)
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dev_anon_all_notifications" ON notifications;
CREATE POLICY "dev_anon_all_notifications" ON notifications
  FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "dev_anon_all_notification_reads" ON notification_reads;
CREATE POLICY "dev_anon_all_notification_reads" ON notification_reads
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- Seed: example schedule-published notification for installer inst-1.
INSERT INTO notifications (id, recipient_role, recipient_id, type, title, body, related_week_start)
VALUES (
  'notif-seed-1',
  'installer',
  'inst-1',
  'schedule_published',
  'New schedule published',
  'Schedule for week of Mar 23 has been published. Check your Schedule tab for details.',
  '2026-03-23'
)
ON CONFLICT (id) DO NOTHING;
