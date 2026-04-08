-- Single RPC that returns the full dataset as one JSON payload.
-- Replaces 10 parallel Supabase REST calls with a single roundtrip.

CREATE OR REPLACE FUNCTION get_full_dataset()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'clients',
      COALESCE((SELECT jsonb_agg(row_to_json(c.*) ORDER BY c.name) FROM clients c), '[]'::jsonb),
    'buildings',
      COALESCE((SELECT jsonb_agg(row_to_json(b.*) ORDER BY b.name) FROM buildings b), '[]'::jsonb),
    'units',
      COALESCE((SELECT jsonb_agg(row_to_json(u.*) ORDER BY u.unit_number) FROM units u), '[]'::jsonb),
    'rooms',
      COALESCE((SELECT jsonb_agg(row_to_json(r.*) ORDER BY r.name) FROM rooms r), '[]'::jsonb),
    'windows',
      COALESCE((SELECT jsonb_agg(row_to_json(w.*) ORDER BY w.label) FROM windows w), '[]'::jsonb),
    'installers',
      COALESCE((SELECT jsonb_agg(row_to_json(i.*) ORDER BY i.name) FROM installers i), '[]'::jsonb),
    'schedule_entries',
      COALESCE((SELECT jsonb_agg(row_to_json(s.*) ORDER BY s.task_date) FROM schedule_entries s), '[]'::jsonb),
    'cutters',
      COALESCE((SELECT jsonb_agg(row_to_json(ct.*) ORDER BY ct.name) FROM cutters ct), '[]'::jsonb),
    'schedulers',
      COALESCE((SELECT jsonb_agg(row_to_json(sc.*) ORDER BY sc.name) FROM schedulers sc), '[]'::jsonb),
    'scheduler_unit_assignments',
      COALESCE((SELECT jsonb_agg(row_to_json(sua.*)) FROM scheduler_unit_assignments sua), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$$;

-- Grant execute to authenticated users (RLS is bypassed via SECURITY DEFINER).
GRANT EXECUTE ON FUNCTION get_full_dataset() TO authenticated;
