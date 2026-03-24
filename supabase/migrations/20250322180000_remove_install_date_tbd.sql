-- Remove install_date_tbd status. Promote any units stuck at that status
-- to install_date_scheduled since the date was subsequently assigned.
-- Run in Supabase SQL Editor.

UPDATE units SET status = 'install_date_scheduled' WHERE status = 'install_date_tbd';
UPDATE schedule_entries SET status = 'install_date_scheduled' WHERE status = 'install_date_tbd';
