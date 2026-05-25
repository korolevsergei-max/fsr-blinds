-- Enable RLS on tables missing it (Security Advisor errors).
-- These tables were created in 20260428120000_label_printing_issues_snapshots.sql
-- but the migration omitted ENABLE ROW LEVEL SECURITY + policies.

ALTER TABLE public.window_post_install_issues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_all_window_post_install_issues"
  ON public.window_post_install_issues
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.window_post_install_issue_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_all_window_post_install_issue_notes"
  ON public.window_post_install_issue_notes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.daily_progress_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_all_daily_progress_snapshots"
  ON public.daily_progress_snapshots
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
