# Phase 2 — Scope authenticated access & the dataset RPCs (C2)

Executed 2026-07-13 against the live `FSRblinds` project (`fbjjqfmsroryfgfushmb`)
on `claude-fable-5`, per `SECURITY_REMEDIATION_PLAN.md`. Phase 1-R greenlit this
(Phase 1 verified, Phase 0 baseline trustworthy).

## Verdict

**C2 is closed.** The "any logged-in user reads everything" hole and the
zero-credential dataset-RPC leak are both fixed, with per-role visibility
reproduced **byte-identically** to the Phase 0 golden set. One genuine bug and
one integrity gap were found *by the verification probes* and fixed before
finishing (details below).

- **117/117** live per-user session checks pass (real sessions minted via admin
  `generateLink` → `verifyOtp` for every owner/installer×6/scheduler/cutter/
  assembler/qc, plus anon).
- **16/16** RLS write-policy checks pass (simulated JWTs, rolled back — zero
  production writes).
- Post-migration golden set is **identical** to the pre-migration capture.
- App `tsc --noEmit` clean; `npm run build` succeeds; anon-policy guard OK.

## What shipped

**Migration:** `supabase/migrations/20260713170000_phase2_scope_authenticated_access.sql`
**Rollback:** `docs/security/PHASE2_ROLLBACK.sql`
**App change:** `src/lib/manufacturing-scheduler.ts` — the facility-wide schedule
reflow now uses the **service-role** client (see "reflow" below).

Two layers, moved together:

1. **Table RLS.** Every blanket `authenticated_all_* USING (true)` policy on the
   26 core/manufacturing tables was dropped and replaced with per-command,
   role/ownership-scoped policies driven by `auth.uid()` (never client input),
   reusing `public.get_user_role()` plus new `auth_installer_id()` /
   `auth_scheduler_id()` / `can_access_unit/room/issue()` SECURITY DEFINER
   helpers. Visibility contract:
   - **owner** = everything.
   - **installer** = units where `assigned_installer_id` = their linked id + those
     units' buildings/clients/rooms/windows/schedule; own installer row + own
     notifications.
   - **scheduler** = assigned units ∪ team-installer units + that subtree; full
     installer pick-list; own assignments/building-access.
   - **cutter/assembler/qc** = all units/rooms/windows + production/schedule/
     settings tables; **no** clients/buildings (their portals read the
     denormalized `units.building_name`/`client_name`).
   - **client** (unused role) = nothing.

2. **RPC caller gates.** `get_full_dataset`, `get_owner_dataset`,
   `get_installer_dataset`, `get_scheduler_dataset`, `get_owner_dashboard_counts`
   now resolve the caller from `auth.uid()` and reject out-of-scope callers
   (owner-only for the owner RPCs; caller's own linked id for the installer/
   scheduler RPCs; `service_role` always allowed for server tooling). `EXECUTE`
   was **revoked from `anon`/`PUBLIC`** on all five (+ `get_user_role` + helpers).

3. **Defense in depth (Part 4).** Dropped `anon`'s residual default table/
   sequence/function grants on `public`, so unauthenticated probes now fail
   loudly (401) instead of silently returning `[]`. (Phase 1-R noted these.)

4. **Self-test (Part 5).** A DO-block asserts — and fails the migration / any
   `db reset` replay — if any blanket `USING(true)` policy, any anon-executable
   dataset RPC, or any RLS-disabled public table survives.

## Two issues found by verification (and fixed)

1. **NULL-safe gate bug (fail-open).** The first-applied gates used
   `IF NOT (<allow>) THEN RAISE`. For a caller of the wrong role,
   `auth_scheduler_id()`/`auth_installer_id()` is NULL, so `p_id = NULL` → NULL,
   `NOT NULL` → NULL, and `IF NULL` **skips the RAISE** — the RPC returned the
   full dataset. Caught by the installer→`get_scheduler_dataset` probe (leaked all
   465 units). Fixed by wrapping every gate in `COALESCE(<allow>, false)` (fails
   closed). The table RLS already blocked the equivalent *direct* reads; only the
   SECURITY DEFINER RPC path was exposed. Re-probe: all cross-role RPC calls now
   `42501`.

2. **Column-immutability gap.** RLS can't restrict *which* columns an UPDATE
   touches, and cutter/assembler/qc legitimately need `units` UPDATE (status /
   `production_entered_at` / `manufacturing_risk_flag`). A cutter could therefore
   craft a direct UPDATE changing `assigned_installer_id`. Added a `BEFORE UPDATE`
   trigger (`units_guard_ownership_columns`) that blocks any role other than
   owner/scheduler (and the `service_role` admin client) from changing a unit's
   `assigned_installer_id`/`building_id`/`client_id`. Verified it does not touch
   the real manufacturing/installer write paths (they never write those columns).

## The reflow trap

`reflowManufacturingSchedules()` re-plans the **whole** production queue and is
triggered from scoped sessions too (e.g. an installer finishing a measurement).
Under the new per-role RLS a scoped user client would see only its own units and
silently re-plan from a partial view. Switched `getSettingsAndOverrides()` to the
service-role client; callers already pass app-layer role guards. The trigger in
issue #2 exempts `service_role`, so the reflow's writes are never blocked.

## Verification detail

- **Golden set:** `golden_set2.mjs` (service-role RPC fingerprints) — pre vs post
  migration id-sets identical for owner/full/6 installers/scheduler +
  dashboard counts.
- **Session probes:** `session_probes.mjs` — for every live user: own dataset ==
  golden; cross-role RPCs denied (`42501`); arbitrary `p_installer_id`/
  `p_scheduler_id` denied; direct PostgREST reads scoped to the exact golden
  id-set; manufacturing roles see all units but 0 clients/buildings; anon RPC +
  table reads denied (401/403).
- **Write policies:** `write_tests.sql` — simulated JWT (`SET LOCAL role` +
  `request.jwt.claims`), each write in a savepoint rolled back via sentinel. 16
  cases: installer/scheduler in-scope writes allowed, out-of-scope + cross-role +
  ownership-column writes denied, owner writes allowed.

## Notes / consistency

- The migration was first applied via `supabase db push` (buggy gates), then the
  corrected function bodies + trigger were applied to prod via the Management API
  (same path Phase 1/1-R used). The committed migration **file** carries the
  corrected, final SQL, so a fresh `db reset` reproduces the verified prod state.
- `get_full_dataset` is preserved (owner-gated) as the documented rollback path,
  per the plan.
- **Next:** Phase 3 (Next.js bump) can run in parallel; Phase 4 (server-action
  authz gaps H2/M1/L1) now has this DB layer as a backstop.
