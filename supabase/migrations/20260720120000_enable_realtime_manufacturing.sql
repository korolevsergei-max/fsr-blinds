-- MF2 — Factory-portal freshness.
-- The cutter/assembler/qc bench screens subscribe to production-status and
-- manufacturing-schedule changes so an idle tablet sees upstream stage handoffs.
-- Add both tables to the Realtime publication (Postgres CDC). This ONLY affects
-- the Realtime publication — no RLS or table-structure change; factory roles'
-- read access is already governed by the Phase 2 RLS policies, and the client
-- only uses events as a trigger to refetch (never reads the CDC payload), so the
-- default REPLICA IDENTITY (primary key) is sufficient, including for DELETEs.
--
-- Guarded so a re-run (or a table already present) is a no-op rather than an error.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'window_production_status'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE window_production_status;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'window_manufacturing_schedule'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE window_manufacturing_schedule;
  END IF;
END $$;
