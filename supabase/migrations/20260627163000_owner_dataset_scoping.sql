-- Owner portal scoping helpers.
-- Keeps get_full_dataset() as the rollback path while letting management routes avoid
-- building raw rooms/windows that the owner shell no longer ships to the browser.

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
      COALESCE((SELECT jsonb_agg(row_to_json(sua.*)) FROM scheduler_unit_assignments sua), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_owner_dataset() TO authenticated;

CREATE OR REPLACE FUNCTION get_owner_dashboard_counts(p_today date DEFAULT CURRENT_DATE)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
WITH unit_scope AS (
  SELECT
    u.id,
    u.status,
    u.assigned_installer_id,
    u.bracketing_date,
    u.installation_date,
    CASE u.status
      WHEN 'installed' THEN 'installation'
      WHEN 'manufactured' THEN 'qc'
      WHEN 'bracketed' THEN 'bracketing'
      WHEN 'measured' THEN 'measurement'
      ELSE 'not_started'
    END AS current_stage,
    EXISTS (
      SELECT 1
      FROM window_manufacturing_escalations wme
      WHERE wme.unit_id = u.id
        AND wme.status = 'open'
    ) AS has_open_escalation
  FROM units u
),
flagged AS (
  SELECT
    *,
    status <> 'installed'
      AND (
        (
          NULLIF(bracketing_date, '') IS NOT NULL
          AND NULLIF(bracketing_date, '') < p_today::text
          AND status = 'not_started'
        )
        OR (
          NULLIF(installation_date, '') IS NOT NULL
          AND NULLIF(installation_date, '') < p_today::text
        )
      ) AS has_past_scheduled,
    status <> 'installed'
      AND (
        assigned_installer_id IS NULL
        OR NULLIF(bracketing_date, '') IS NULL
        OR (NULLIF(installation_date, '') IS NULL AND status IN ('measured', 'bracketed', 'manufactured'))
      ) AS has_missing,
    status <> 'installed'
      AND NULLIF(installation_date, '') IS NOT NULL
      AND NULLIF(installation_date, '') >= p_today::text
      AND NULLIF(installation_date, '') <= (p_today + 3)::text AS has_at_risk
  FROM unit_scope
),
stage_counts AS (
  SELECT jsonb_build_object(
    'not_started', COUNT(*) FILTER (WHERE current_stage = 'not_started'),
    'measurement', COUNT(*) FILTER (WHERE current_stage = 'measurement'),
    'bracketing', COUNT(*) FILTER (WHERE current_stage = 'bracketing'),
    'cutting', COUNT(*) FILTER (WHERE current_stage = 'cutting'),
    'assembling', COUNT(*) FILTER (WHERE current_stage = 'assembling'),
    'qc', COUNT(*) FILTER (WHERE current_stage = 'qc'),
    'installation', COUNT(*) FILTER (WHERE current_stage = 'installation'),
    'post_install_issue', COUNT(*) FILTER (WHERE current_stage = 'post_install_issue')
  ) AS counts
  FROM flagged
),
issue_counts AS (
  SELECT jsonb_build_object(
    'past_scheduled', COUNT(*) FILTER (WHERE has_past_scheduled),
    'escalations', COUNT(*) FILTER (WHERE has_open_escalation),
    'missing', COUNT(*) FILTER (WHERE has_missing),
    'at_risk', COUNT(*) FILTER (WHERE has_at_risk)
  ) AS counts
  FROM flagged
)
SELECT jsonb_build_object(
  'total_units', (SELECT COUNT(*) FROM flagged),
  'stage_counts', (SELECT counts FROM stage_counts),
  'issue_counts', (SELECT counts FROM issue_counts)
);
$$;

GRANT EXECUTE ON FUNCTION get_owner_dashboard_counts(date) TO authenticated;
