# Phase 1-R — Re-verification of Phase 1 (C1) on Fable

Executed 2026-07-13 against the live `FSRblinds` project (`fbjjqfmsroryfgfushmb`),
per the correction path in `SECURITY_REMEDIATION_PLAN.md`. All checks were run
against the **live database state** (Management API → `pg_policies`, live
adversarial HTTP probes), not just the migration file.

## Verdict

**Sonnet's Phase 1 was implemented correctly. No correction migration was
needed.** The only checklist item that failed was the guard check — it had
never been created — and that is now shipped and live (see below).

**The Phase 0 baseline is re-validated and safe to trust for Phase 2.**

## Checklist results

| Check | Result |
|---|---|
| No `anon` policy on any `public` table (live `pg_policies`) | ✅ 0 anon/public policies across 29 public-schema policies |
| RLS enabled on every `public` table | ✅ all 27 tables `relrowsecurity = true` |
| `fsr_media_objects_all FOR ALL TO public` gone | ✅ replaced by read/insert/update/delete split |
| fsr-media: public **read-only**, write/delete `authenticated` only | ✅ `fsr_media_objects_read` is the sole `public` policy (SELECT, `bucket_id='fsr-media'`) |
| Not over-tightened (auth upload/read, logged-out `<img>`) | ✅ end-to-end probe (below) |
| Guard check actually exists | ❌ **was missing** → created in this phase, applied live |
| Adversarial: anon REST reads denied | ✅ `notifications` / `unit_activity_log` / `media_uploads` / `clients` → `200 []` (empty) |
| Adversarial: anon writes denied | ✅ REST INSERT → 401; storage upload → 403 RLS violation; storage DELETE → 403 Access denied |

## Evidence highlights

- **Adversarial probes** (logged out, publishable key only): all four C1 tables
  return empty arrays; storage `POST`/`DELETE` on `fsr-media` denied; a known
  public image URL still serves (HTTP 200, 61 KB) *after* the denied delete.
- **End-to-end authenticated probe**: created a throwaway auth user (installer
  role), signed in with the publishable key, uploaded to `fsr-media` (200),
  read it back logged-out via public URL (200), deleted it (200), read
  `notifications`/`unit_activity_log`/`media_uploads` (data returned). Probe
  user, its `user_profiles` row (FK cascade), and the probe object verified
  removed.
- **Extra sweep beyond the checklist**: `user_directory` view has
  `security_invoker=true` (caller RLS applies — not a bypass);
  `fsr-owner-verification` bucket is private with owner-only policies;
  `storage.buckets` flags are `fsr-media public=true` (intended),
  `fsr-owner-verification public=false`.

## Guard check (new, live)

- `supabase/migrations/20260713150000_phase1_anon_policy_guard.sql` — applied
  to prod and recorded in `schema_migrations`:
  - `public.anon_policy_violations()` — SECURITY DEFINER, EXECUTE revoked from
    `PUBLIC`/`anon`/`authenticated`, granted **only** to `service_role`
    (verified live: anon call → 401 `permission denied`). Flags any
    anon/public policy on `public` tables, any storage anon/public policy
    other than the intentional `fsr_media_objects_read` SELECT, and any
    `public` table with RLS disabled.
  - A DO-block assert that fails the migration (and any future `db reset`
    replay) if a violation exists.
- `scripts/check-anon-policies.mjs` + `npm run check:anon-policies` — runnable
  guard using the service-role key (reads `.env.local`; CI-ready once secrets
  exist).
- **Self-tested**: planted a `dev_anon_all_*` policy on a scratch table → the
  guard flagged it; after cleanup → clean. Script exits 0 on the live state.

## Phase 0 baseline re-validation

Diffed the Phase 0 `pg_policies` capture (`pg_policies-2026-07-13.json`, in the
Phase 0 session's local scratch dir) against today's live enumeration:
**29/29 public-schema policies identical** — names, commands, and
USING/WITH CHECK expressions. The storage policy state also matches Phase 0's
report exactly. Since the live state is now confirmed to be a *correct*
Phase 1 state, the golden set captured against it is trustworthy.

Two caveats for Phase 2 (both already noted in the Phase 0 report):

1. The golden-set JSON lives only in a local scratch dir
   (`.../b5abcd7a-*/scratchpad/phase0-baseline-data/`) — it may not survive a
   reboot. Re-run `golden_set.mjs` (same dir) at the start of Phase 2 for a
   fresh capture; it is captured via service-role RPC calls, which are
   unaffected by any policy state.
2. `get_owner_dataset` returns 0 rooms/windows — Phase 2 must confirm whether
   the app hydrates those separately before asserting parity.

## Notes / non-blocking observations

- `anon` still holds default table-level **grants** (SELECT/INSERT/… ) on
  public tables. Harmless today — RLS is enabled everywhere with no anon
  policies, so anon gets empty reads and write errors — but revoking anon
  privileges on the `public` schema in Phase 2 would add defense in depth and
  make anon probes fail loudly (401) instead of silently returning `[]`.
- **C2 remains live and unauthenticated** (dataset RPCs EXECUTE-granted to
  `anon`, no caller checks) — confirmed in Phase 0, unchanged here, out of
  Phase 1-R scope. Phase 2 is the open door; do it next.
- The Phase 1 migration file (`20260713120000_phase1_remove_anon_access.sql`)
  is still uncommitted in the working tree (Phase 0 finding #3) — commit it
  together with the Phase 1-R artifacts.

## Greenlight

Phase 1 ✅ verified · Phase 0 baseline ✅ trustworthy · **Phase 2 is cleared to
start** (fresh golden-set capture recommended at kickoff).
