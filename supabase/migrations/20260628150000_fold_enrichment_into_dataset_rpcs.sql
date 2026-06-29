-- Phase 11: fold per-unit enrichment into the owner + scheduler dataset RPCs.
--
-- Before this, loadFullDataset() / loadSchedulerDataset() ran the spine in one RPC but then
-- finalizeDataset() still issued ~4 sequential chunked round-trips per navigation
-- (withPostInstallIssues: issues -> notes + profiles -> missing authors; then
-- withManufacturingEscalations) just to produce two things the GLOBAL owner/scheduler screens
-- actually read: open manufacturing escalations, and a per-unit "has an open post-install
-- issue" boolean. No global owner/scheduler screen reads the post-install issues array, its
-- notes, or the joined user_profiles, so that fan-out is pure latency waste on the hot path
-- (it stays on the unit-detail / installer paths, which do consume notes + currentStage).
--
-- This returns both inside the single dataset RPC so the global load is one DB round-trip
-- end-to-end. Same EXISTS / status='open' patterns already proven in get_owner_dashboard_counts
-- (20260627163000): the post-install lookup is index-backed by idx_wpii_unit_open
-- (window_post_install_issues(unit_id) WHERE status='open', 20260428120000).
--
-- Additive CREATE OR REPLACE: same scope/shape as before plus two new top-level keys each.
-- The TS fallback paths ignore the extra keys, so this is rollback-safe.

CREATE OR REPLACE FUNCTION get_owner_dataset()
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
      '[]'::jsonb,
    'windows',
      '[]'::jsonb,
    'installers',
      COALESCE((SELECT jsonb_agg(row_to_json(i.*) ORDER BY i.name) FROM installers i), '[]'::jsonb),
    'schedule_entries',
      COALESCE((SELECT jsonb_agg(row_to_json(s.*) ORDER BY s.task_date) FROM schedule_entries s), '[]'::jsonb),
    'cutters',
      COALESCE((SELECT jsonb_agg(row_to_json(ct.*) ORDER BY ct.name) FROM cutters ct), '[]'::jsonb),
    'schedulers',
      COALESCE((SELECT jsonb_agg(row_to_json(sc.*) ORDER BY sc.name) FROM schedulers sc), '[]'::jsonb),
    'scheduler_unit_assignments',
      COALESCE((SELECT jsonb_agg(row_to_json(sua.*)) FROM scheduler_unit_assignments sua), '[]'::jsonb),
    -- Phase 11: enrichment folded in (replaces withManufacturingEscalations + the open-PI
    -- probe in withPostInstallIssues). Owner scope = all units, so no unit filter is needed.
    'manufacturing_escalations',
      COALESCE((
        SELECT jsonb_agg(row_to_json(wme.*) ORDER BY wme.opened_at DESC)
        FROM window_manufacturing_escalations wme
        WHERE wme.status = 'open'
      ), '[]'::jsonb),
    'units_with_open_post_install_issue',
      COALESCE((
        SELECT jsonb_agg(DISTINCT wpi.unit_id)
        FROM window_post_install_issues wpi
        WHERE wpi.status = 'open'
      ), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_owner_dataset() TO authenticated;


CREATE OR REPLACE FUNCTION get_scheduler_dataset(p_scheduler_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  WITH scoped_units AS (
    SELECT u.*
    FROM units u
    WHERE u.id IN (
      SELECT sua.unit_id
      FROM scheduler_unit_assignments sua
      WHERE sua.scheduler_id = p_scheduler_id
      UNION
      SELECT u2.id
      FROM units u2
      JOIN installers i ON i.id = u2.assigned_installer_id
      WHERE i.scheduler_id = p_scheduler_id
    )
  )
  SELECT jsonb_build_object(
    'units',
      COALESCE((SELECT jsonb_agg(row_to_json(su.*) ORDER BY su.unit_number) FROM scoped_units su), '[]'::jsonb),
    'assignments',
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object('unit_id', sua.unit_id, 'assigned_at', sua.assigned_at))
        FROM scheduler_unit_assignments sua
        WHERE sua.scheduler_id = p_scheduler_id
      ), '[]'::jsonb),
    'scheduler',
      (SELECT row_to_json(s.*) FROM schedulers s WHERE s.id = p_scheduler_id),
    'buildings',
      COALESCE((
        SELECT jsonb_agg(row_to_json(b.*) ORDER BY b.name)
        FROM buildings b
        WHERE b.id IN (SELECT DISTINCT building_id FROM scoped_units)
      ), '[]'::jsonb),
    'clients',
      COALESCE((
        SELECT jsonb_agg(row_to_json(c.*) ORDER BY c.name)
        FROM clients c
        WHERE c.id IN (SELECT DISTINCT client_id FROM scoped_units)
      ), '[]'::jsonb),
    -- Raw rooms/windows are not shipped on the global scheduler path (20260628140000).
    'rooms', '[]'::jsonb,
    'windows', '[]'::jsonb,
    'schedule_entries',
      COALESCE((
        SELECT jsonb_agg(row_to_json(se.*) ORDER BY se.task_date)
        FROM schedule_entries se
        WHERE se.unit_id IN (SELECT id FROM scoped_units)
      ), '[]'::jsonb),
    'team_installers',
      COALESCE((
        SELECT jsonb_agg(row_to_json(ti.*) ORDER BY ti.name)
        FROM installers ti
        WHERE ti.scheduler_id = p_scheduler_id
      ), '[]'::jsonb),
    'all_installers',
      COALESCE((SELECT jsonb_agg(row_to_json(i.*) ORDER BY i.name) FROM installers i), '[]'::jsonb),
    -- Phase 11: enrichment folded in, scoped to this scheduler's units (mirrors the global
    -- scheduler enrichment, which scopes by dataset.units = the scoped set).
    'manufacturing_escalations',
      COALESCE((
        SELECT jsonb_agg(row_to_json(wme.*) ORDER BY wme.opened_at DESC)
        FROM window_manufacturing_escalations wme
        WHERE wme.status = 'open'
          AND wme.unit_id IN (SELECT id FROM scoped_units)
      ), '[]'::jsonb),
    'units_with_open_post_install_issue',
      COALESCE((
        SELECT jsonb_agg(DISTINCT wpi.unit_id)
        FROM window_post_install_issues wpi
        WHERE wpi.status = 'open'
          AND wpi.unit_id IN (SELECT id FROM scoped_units)
      ), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_scheduler_dataset(text) TO authenticated;
