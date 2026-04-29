-- 1. Per-window label print tracking
ALTER TABLE window_production_status
  ADD COLUMN IF NOT EXISTS manufacturing_label_printed_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS packaging_label_printed_at     TIMESTAMPTZ NULL;

-- 2. Per-window post-install issues with full history
CREATE TABLE IF NOT EXISTS window_post_install_issues (
  id          TEXT PRIMARY KEY,
  window_id   TEXT NOT NULL REFERENCES windows(id) ON DELETE CASCADE,
  unit_id     TEXT NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  opened_by_user_id   UUID NOT NULL REFERENCES auth.users(id),
  opened_by_role      TEXT NOT NULL CHECK (opened_by_role IN ('owner','scheduler')),
  opened_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_by_user_id UUID NULL REFERENCES auth.users(id),
  resolved_at         TIMESTAMPTZ NULL,
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wpii_window ON window_post_install_issues(window_id);
CREATE INDEX IF NOT EXISTS idx_wpii_unit_open ON window_post_install_issues(unit_id) WHERE status = 'open';

-- Notes/comments thread per issue (full history)
CREATE TABLE IF NOT EXISTS window_post_install_issue_notes (
  id          TEXT PRIMARY KEY,
  issue_id    TEXT NOT NULL REFERENCES window_post_install_issues(id) ON DELETE CASCADE,
  author_user_id UUID NOT NULL REFERENCES auth.users(id),
  author_role TEXT NOT NULL,
  body        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wpiin_issue ON window_post_install_issue_notes(issue_id);

-- 3. Daily progress snapshots for the Progress Report
-- One row per (snapshot_date, stage, unit). Captured by daily job at 00:05 America/Toronto.
CREATE TABLE IF NOT EXISTS daily_progress_snapshots (
  id              TEXT PRIMARY KEY,
  snapshot_date   DATE NOT NULL,
  stage           TEXT NOT NULL CHECK (stage IN ('measurement','bracketing','cutting','assembling','qc','installation','post_install_issue')),
  unit_id         TEXT NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  building_id     TEXT NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  client_id       TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  floor           INTEGER NULL,
  expected_blinds INTEGER NOT NULL,
  done_blinds     INTEGER NOT NULL,
  assigned_user_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  assigned_display TEXT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (snapshot_date, stage, unit_id)
);
CREATE INDEX IF NOT EXISTS idx_dps_date_stage ON daily_progress_snapshots(snapshot_date, stage);
