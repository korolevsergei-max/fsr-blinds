-- Enable Realtime for notification tables so alert lists and unread badges
-- can update live without a manual refresh.

ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE notification_reads;
