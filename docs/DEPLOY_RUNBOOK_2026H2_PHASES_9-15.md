# Deploy Runbook — 2026 H2 Phases 9–15 (B2, C1, C2, C3, C4, D1, D2)

**Branch:** `phases/b2-c1-c2-c3-c4-d1-d2` · **Base:** `main` @ 5bb937c

All code + migrations are committed and pass the local gate (lint · typecheck ·
test · build · perf-budget). **No migration was applied to prod and no
prod-mutating script was run** — every TS change is fallback-protected or
behaviour-neutral until you apply the matching migration and run the
verification below. Apply migrations in filename (timestamp) order.

Everything reads `.env.local` (`NEXT_PUBLIC_SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`) for the verification scripts.

---

## Migrations to apply (in order)

| # | Migration | Phase | What it does | Behaviour on apply |
|---|---|---|---|---|
| 1 | `20260720130000_get_role_schedule_rpc.sql` | B2 | `get_role_schedule(text)` RPC | Loader starts using the RPC fast path; chunked fallback remains |
| 2 | `20260720140000_archive_completed_schedules.sql` | C1 | archive table + move fn + `get_role_schedule(text,boolean)` | **No behaviour change** — archive empty until you run the move |
| 3 | `20260720150000_recompute_manufacturing_risk_flags.sql` | C2 | set-based risk RPC | Enables the cron + qc-approve trigger already in the code |
| 4 | `20260720160000_windows_unit_id.sql` | C4 | `windows.unit_id` + backfill + trigger | Additive; nothing reads it yet |
| 5 | `20260720170000_owner_dataset_units_projection.sql` | D1 | projects `get_owner_dataset` units | Byte-identical mapUnit output, smaller payload |

> Migration 2 replaces `get_role_schedule(text)` (from migration 1) with
> `get_role_schedule(text, boolean default false)` — apply 1 then 2. If you only
> apply 2, the DROP-IF-EXISTS + CREATE still yields the working function.

---

## Per-phase verification

### B2 — `get_role_schedule` RPC
1. Apply migration 1 (and 2).
2. `node scripts/deploy/parity-b2-role-schedule.mjs` → expect `ALL CHECKS PASSED`
   (RPC vs chunked: set + field parity per role).
3. In prod logs, the `[perf][role-schedule] … rpc <ms>` line should read well
   under 500 ms (was ~3–5 s). Rollback: revert commit (fallback path remains).

### C1 — Archive completed schedule rows
1. Apply migration 2. **Nothing changes yet** — archive is empty, so every read
   (queue = active, completed/management = active∪archive) equals today's full
   table.
2. Verify the completed views + management-schedule completed counts render
   identically to before (they should — archive empty).
3. Activate: `SELECT public.move_completed_schedules_to_archive();` (returns the
   row count moved). Then re-verify the completed views + management completed
   counts are byte-identical, and the queue-read `[perf]` time drops further.
4. Wire ongoing archiving (optional, after step 3 verifies): a daily
   `SELECT move_completed_schedules_to_archive();` (SQL cron / extend the risk
   cron) and/or call it coalesced in `after()` on the unit-completion mutation.
   Reads stay correct via the union regardless.
   Rollback: revert commit, then
   `INSERT INTO window_manufacturing_schedule SELECT <cols> FROM
   window_manufacturing_schedule_archive; TRUNCATE window_manufacturing_schedule_archive;`

### C2 — Set-based risk flags + cron
1. Apply migration 3. The second cron (`/api/cron/manufacturing-risk`, in
   `vercel.json`) registers on deploy.
2. Snapshot `units.manufacturing_risk_flag` before/after one
   `recomputeManufacturingRiskFlags()` run (hit the cron route with the
   `Authorization: Bearer $CRON_SECRET` header, or trigger a qc-approve) — flags
   must be identical to what the old per-view loop produced for the same inputs.
3. Confirm no duplicate "behind schedule" notifications on a repeated run with
   unchanged inputs (idempotence), and that cutter/assembler/qc dashboard views
   now issue zero writes (DB logs). Rollback: revert commit.

### C3 — Auth fast-path (A) + static login (B)
- **A:** optional — `node scripts/deploy/backfill-c3-app-metadata-display-name.mjs`
  stamps `app_metadata.display_name` for existing users so the fast path engages
  immediately (otherwise `getCurrentUser` self-heals it organically). Re-run the
  role-gating + role-change session-kill matrix. Confirm navigations stop reading
  `user_profiles` for stamped users.
- **B:** build shows `/login` as `○` (static). Verify: signed-in users still
  redirect to their portal (now via middleware); first-owner signup still works
  on a fresh install (client fetches `/api/owner-exists`).
- **C (revalidation diet): DEFERRED** — see below.
- **D (`/qc` middleware): already shipped** in A1r (commit 571eef4).

### C4 — `windows.unit_id`
1. Apply migration 4. Additive/behaviour-neutral. Verify no window has a NULL
   `unit_id` after backfill (the migration's `SET NOT NULL` would have failed if
   so). Realtime scoping is **DEFERRED** (see below). Rollback: revert +
   `DROP COLUMN windows.unit_id`.

### D1 — Owner payload projection
1. Apply migration 5. Measure the `get_owner_dataset` payload KB before/after
   (expect a drop). mapUnit output is byte-identical (projection = exactly
   mapUnit's columns), so all owner screens render the same. Rollback: revert.

### D2 — Quality floor
- CI (`.github/workflows/ci.yml`) runs lint/typecheck/test/build/perf-budget on
  PR + push. No deploy step. `[contract]` warnings in prod logs signal an
  RPC↔TS drift. Query timeouts are 15 s (bounds hangs only).

---

## Deferred (needs runtime verification the sandbox can't do)

| Item | Phase | Why deferred |
|---|---|---|
| Aggressive `allItems` projection (M3) | B2 | `allItems` is consumed full-fidelity by cutter-production, schedule-view-model, and the completed-view loader — not just the two dashboards. C1's archive bounds the payload safely instead. |
| Process-screen SQL count aggregate (M6) | B2 | Feeds a pure tested TS builder per-window rows; porting to `GROUP BY` needs a prod parity gate + builder rewrite. |
| `revalidatePath` layout→page diet | C3-C | The factory mark paths need layout scope (sibling-page freshness) and owner/scheduler mutations feed the layout dataset-provider seed — narrowing risks the 42ab41a staleness class; needs two-browser verification. |
| Server-side realtime scoping + markWindowCut join simplification | C4 | A filtered `postgres_changes` subscription may not deliver DELETE events; a missed update on a field/factory client is a correctness bug that needs a two-browser + DELETE-delivery test. `windows.unit_id` (shipped) is the enabler. |
| Minimal owner units projection (drop mapped-but-unrendered fields) | D1 | Needs a per-screen render audit that can't be verified here (same class as M3). The safe mapUnit-column projection shipped. |

## Vercel settings (config, not code)
- The manufacturing-risk cron is in `vercel.json` and applies on deploy (2 of 2
  Hobby cron slots now used).
