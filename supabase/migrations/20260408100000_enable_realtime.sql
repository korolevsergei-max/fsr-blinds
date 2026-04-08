-- Enable Supabase Realtime for core tables so the client-side dataset context
-- receives live updates via Postgres CDC (Change Data Capture).
--
-- This only affects the Realtime publication — it does NOT change RLS or table structure.

ALTER PUBLICATION supabase_realtime ADD TABLE clients;
ALTER PUBLICATION supabase_realtime ADD TABLE buildings;
ALTER PUBLICATION supabase_realtime ADD TABLE units;
ALTER PUBLICATION supabase_realtime ADD TABLE rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE windows;
ALTER PUBLICATION supabase_realtime ADD TABLE schedule_entries;
ALTER PUBLICATION supabase_realtime ADD TABLE installers;
ALTER PUBLICATION supabase_realtime ADD TABLE cutters;
ALTER PUBLICATION supabase_realtime ADD TABLE schedulers;
ALTER PUBLICATION supabase_realtime ADD TABLE scheduler_unit_assignments;
