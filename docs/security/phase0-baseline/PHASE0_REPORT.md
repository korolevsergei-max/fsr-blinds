# Phase 0 — Baseline & Safety Net

Executed 2026-07-13 against the live `FSRblinds` project (`fbjjqfmsroryfgfushmb`).
No fixes applied — prep only, per the remediation plan.

**Raw data files referenced below (`golden-set-2026-07-13.json`,
`pg_policies-2026-07-13.json`, `security-definer-grants-2026-07-13.json`)
are deliberately NOT in this directory / not committed** — the golden set
contains real client and building names. Per the plan's own L2 finding
(don't commit business data, see `tmp/*.json` precedent), these live only
in this session's local scratch dir. Re-run `golden_set.mjs` (this session's
throwaway script, also not committed) to regenerate before Phase 2.

## 1. Rollback path — verified

Ran `scripts/backup-snapshot.mjs` (from the unmerged `chore/offsite-backups`
branch, see finding below) against prod with the service-role key. Full
data + storage snapshot completed successfully:

- 26/26 public tables exported to JSON (`data/`), 15,139 rows total.
- Storage: `fsr-media` (144 objects, 37.8 MB) and `fsr-owner-verification`
  (425 objects, 72.1 MB) mirrored to `storage/`.
- Snapshot is a manual, credential-light path (service-role key only, no DB
  password) — confirmed viable as a restore source independent of the
  nightly pg_dump Action.

**Snapshot location:** local scratch dir from this session (not committed —
it contains full client PII/photos). Re-run
`node scripts/backup-snapshot.mjs` from the `chore/offsite-backups` branch
any time a fresh one is needed.

## 2. ⚠️ Finding: off-site backup workflow was never merged to `main`

`docs/BACKUP_RUNBOOK.md`, `.github/workflows/backup.yml`,
`scripts/backup-db.sh`, `scripts/backup-run.sh`, `scripts/backup-snapshot.mjs`
all exist only on branch `chore/offsite-backups` (commit `112e348`,
2026-06-08). `git merge-base --is-ancestor chore/offsite-backups main`
confirms it is **not** an ancestor of `main`. There is currently **no
scheduled off-site backup running** — the nightly GitHub Action does not
exist on the deployed branch. This should be merged (and the two GH secrets
configured) before or alongside this remediation work, not treated as
already-live infrastructure.

## 3. ⚠️ Finding: Phase 1 migration already applied live, but uncommitted

`supabase/migrations/20260713120000_phase1_remove_anon_access.sql` is an
**untracked** file in the working tree, but its version (`20260713120000`)
is already present in `supabase_migrations.schema_migrations` on the live
DB — confirmed via `pg_policies`: no `anon`/`dev_anon_all_*` policies remain
on any `public` or `storage` table today. Someone (a prior session) applied
this migration directly to prod without committing the file. **Action
needed before Phase 1 "work":** just commit the existing file — do not
regenerate it, and don't re-run it (it's already live; the `DROP POLICY IF
EXISTS` guards make it idempotent if re-applied, but no need).

## 4. ⚠️ Finding: C2 is live-exploitable right now, with zero credentials

Confirmed by direct `curl` against `/rest/v1/rpc/get_owner_dataset` using
only the public `sb_publishable_...` key (no login, no session): returns
the full owner dataset — all clients, buildings, units, schedule entries.

This is **worse** than the plan's phrasing suggests. The audit describes C2
as "granted to every **role**" (read: every authenticated role); the live
grant enumeration below shows `get_full_dataset`, `get_owner_dataset`,
`get_installer_dataset`, `get_scheduler_dataset`, and
`get_owner_dashboard_counts` are all `EXECUTE`-granted to **`anon`** too —
Postgres's default `GRANT EXECUTE ... TO PUBLIC` was never revoked. Because
these are `SECURITY DEFINER`, they bypass table RLS entirely regardless of
what Phase 1 already fixed at the table-policy layer. Anyone with the
publishable key (shipped in the browser bundle) can pull the entire client
roster today via a single unauthenticated POST.

**This raises the urgency of Phase 2** — specifically the RPC caller-check
half of it — above the plan's original sequencing suggestion. Recommend
treating Phase 2 as the very next session, not a "when convenient" follow-up.

## 5. Policy enumeration (`pg_policies`, `public` + `storage`)

37 policies total. Full dump: `pg_policies-2026-07-13.json`. Summary:

- **0** policies remain with `anon` in `roles` (Phase 1 already live — see
  finding above).
- **26 tables** carry a blanket `authenticated_all_<table> ... USING (true)`
  policy (`ALL` command) — this is C2's table-RLS half. Full list: assemblers,
  buildings, clients, cutters, daily_progress_snapshots, installers,
  manufacturing_calendar_overrides, manufacturing_settings, media_uploads,
  notification_reads, qcs, rooms, schedule_entries,
  scheduler_building_access, scheduler_unit_assignments, schedulers,
  unit_activity_log, units, window_manufacturing_escalations,
  window_manufacturing_schedule, window_post_install_issue_notes,
  window_post_install_issues, window_production_status, windows,
  notifications (split INSERT/SELECT, still `USING (true)` on SELECT).
- **Already role-scoped** (do not touch in Phase 2 — these are the pattern to
  copy): `user_profiles` (`owner_manage_all_profiles` /
  `users_read_own_profile` via `id = auth.uid()`),
  `owner_verification_photos` (`get_user_role() = 'owner'`).
- **Storage** (`storage.objects`): `fsr_media_objects_read` is `TO public`
  (intentional — bucket serves `<img>` tags), everything else
  (`insert`/`update`/`delete` on both `fsr-media` and
  `fsr-owner-verification`) is `TO authenticated` only. Consistent with
  Phase 1's intent.

## 6. SECURITY DEFINER function grants

Full dump: `security-definer-grants-2026-07-13.json`. 8 functions, all
`SECURITY DEFINER`:

| function | EXECUTE granted to | caller check today |
|---|---|---|
| `get_full_dataset()` | anon, authenticated, service_role | none |
| `get_owner_dataset()` | anon, authenticated, service_role | none |
| `get_installer_dataset(p_installer_id)` | anon, authenticated, service_role | none — trusts param |
| `get_scheduler_dataset(p_scheduler_id)` | anon, authenticated, service_role | none — trusts param |
| `get_owner_dashboard_counts(p_today)` | anon, authenticated, service_role | none |
| `get_user_role()` | anon, authenticated, service_role | reads own `auth.uid()` — safe |
| `handle_new_user()` | anon, authenticated, service_role | trigger fn, not directly callable meaningfully |
| `sync_user_profile_role_to_auth_metadata()` | anon, authenticated, service_role | trigger fn |

The first five are Phase 2's RPC-layer target. `get_user_role()` is the
helper Phase 2 should reuse for the new table policies.

## 7. Golden set — per-role row baseline

Captured with `scripts/backup-snapshot.mjs`'s sibling parity script
(`golden_set.mjs`, written this session, not committed — throwaway per the
plan) by calling each dataset RPC directly with the service-role key and the
same parameters the app passes today. Since none of the RPCs check
`auth.uid()` yet, this is byte-identical to what each real user's session
returns right now.

Full dump: `golden-set-2026-07-13.json`. Headline counts:

- **Owner** (`get_owner_dataset`): 465 units, 5 buildings, 2 clients, 6
  installers, 1 scheduler, 1 cutter, 387 schedule_entries, 465
  scheduler_unit_assignments, 22 units_with_open_post_install_issue, 0 rooms
  / windows / manufacturing_escalations returned by this particular RPC
  (those come back empty from `get_owner_dataset` — verify in Phase 2
  whether that's expected or whether the app hydrates rooms/windows via a
  separate call before assuming parity).
- **6 installers** captured individually (`inst-6057385c` … `inst-3e8184fb`)
  — each with its own scoped dataset fingerprint (row-id sets, not just
  counts) to diff against post-Phase-2.
- **1 scheduler** captured (`sch-717e35df`).

**Phase 2 must reproduce every row-id set in this file exactly** for each
role — not just matching counts.

## Done-when checklist (from the plan)

- [x] Reproducible per-role row-count/row-set baseline → `golden-set-2026-07-13.json`
- [x] Verified restore path → snapshot ran clean, 26/26 tables + both storage buckets
- [x] Enumerated every `anon`/`USING (true)` policy → none remain (Phase 1 already live); 26 tables still `authenticated ... USING (true)` for Phase 2
- [x] Enumerated every SECURITY DEFINER grant → 5 dataset RPCs open to `anon` + `authenticated` with no caller check
- [ ] RLS work on a Supabase branch/staging project — **not yet set up**, needed before Phase 2 starts
