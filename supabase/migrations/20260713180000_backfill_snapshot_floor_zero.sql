-- One-time backfill: recompute daily_progress_snapshots.floor for basement units.
--
-- Context: floor is derived from the unit number, not stored on units. The
-- derivation (getFloor in src/lib/app-dataset.ts, parseFloor in
-- src/lib/progress-snapshot.ts) previously collapsed 3-digit basement units
-- (001–099, leading zero) into floor 1. The rule was corrected so that a unit
-- number's leading digit(s) name the floor for 3+ digit numbers:
--   001→0, 011→0, 101→1, 201→2, 1201→12
-- while 1–2 digit (flat) numbering has no floor prefix → floor 1.
--
-- daily_progress_snapshots.floor is the only place a floor value is persisted
-- (analytics for the Progress Report). Existing rows were written with the old
-- logic, so this recomputes them once to match the corrected derivation. The
-- CASE below mirrors parseFloor() exactly, keyed off the leading digit run.
--
-- Safety: idempotent (IS DISTINCT FROM guard) and safe to apply while live.
-- Rows whose unit no longer exists are left untouched.

UPDATE daily_progress_snapshots dps
SET floor = CASE
    WHEN d.digits IS NULL OR d.digits = '' THEN NULL
    WHEN length(d.digits) >= 3 THEN floor(d.digits::numeric / 100)::int
    ELSE 1
  END
FROM units u,
LATERAL (SELECT substring(u.unit_number from '\d+') AS digits) d
WHERE dps.unit_id = u.id
  AND dps.floor IS DISTINCT FROM (
    CASE
      WHEN d.digits IS NULL OR d.digits = '' THEN NULL
      WHEN length(d.digits) >= 3 THEN floor(d.digits::numeric / 100)::int
      ELSE 1
    END
  );
