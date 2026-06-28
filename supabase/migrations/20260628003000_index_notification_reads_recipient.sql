-- Phase 8 (Navigation Performance Audit 2026): harden notification
-- unread/read-list lookups identified in Phase 0 as a growth risk.
--
-- The primary key is ordered as (notification_id, user_role, user_id), which
-- is ideal for upserts by notification id but not for the app's hot reads:
--   * unread count: WHERE user_role = ? AND user_id = ?
--   * notification list: same filters plus notification_id IN (...)
CREATE INDEX IF NOT EXISTS idx_notification_reads_user_notification
  ON public.notification_reads (user_role, user_id, notification_id);
