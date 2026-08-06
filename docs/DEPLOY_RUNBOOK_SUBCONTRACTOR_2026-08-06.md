# Deploy runbook — subcontract manufacturing (2026-08-06)

Ships the manufacturing-partner model, the `subcontractor` role and its desktop
portal, the Manufacturer dashboard filter, and the room-creation routing gate.

- **Migration:** `supabase/migrations/20260806120000_manufacturing_partners.sql`
- **Code:** commit on `main` (Vercel auto-deploys `main` → prod)
- **Last good commit before this work:** `d7934ec` (dashboard pipeline stage / installed_at)

---

## Order (non-negotiable)

**Migration first, then code.** The app queries `units.manufacturing_partner_id`
inside `reflowManufacturingSchedules()`; if the code shipped first, every reflow
would fail with `column does not exist` and factory scheduling would stop.

The migration is **backward-compatible with the code that is live before it**, so
the gap between the two steps is safe:

| Migration change | Effect on the currently-deployed app |
|---|---|
| New columns on `units`, new tables | Additive. `select("*")` picks them up; old mappers ignore unknown fields. |
| `user_profiles_role_check`, `unit_activity_log_actor_role_check` | Widened only. |
| `can_access_unit`, `units_select_scoped`, `units_update_scoped`, `wps_insert_mfg`, `wps_update_mfg` | New `subcontractor` branch added; every existing role's predicate is byte-identical. |
| `units_guard_ownership_columns` | Restructured, same outcome for owner/installer/cutter/assembler/qc. The new scheduler rule only fires on a `manufacturing_partner_id` change, which no deployed code performs. |
| `get_owner_dataset` | Two added keys; the old client ignores unknown keys. |
| `get_role_schedule` | Now returns internal units only — **every existing unit defaults to `mp-internal`, so this filters nothing on day one.** |
| `wps_guard_manufacturing_ownership` (new trigger) | No-op until a subcontractor exists: with all units internal, cutter/assembler/qc writes pass unchanged. |
| `get_subcontractor_worklist` (new) | Not called by the old code. |

---

## Step 1 — apply the migration

```bash
supabase migration list          # 20260806120000 should be the only local-only row
supabase db push
supabase migration list          # confirm it now shows in both columns
```

## Step 2 — deploy the code

```bash
git push origin main             # Vercel builds and promotes automatically
```

## Step 3 — smoke test (5 minutes, prod)

1. Owner dashboard loads; pipeline counts unchanged from before the deploy.
2. `/management/units` → Manufacturer filter lists **FSR Internal** and nothing else.
3. `/cutter/queue` → same units as before. **This is the critical check** — if the
   queue is empty, the `get_role_schedule` partner filter is misbehaving (see
   Symptom A below).
4. Settings → Accounts → **Subcontractors** tab renders (empty is correct).
5. Open any unit → the Manufacturer row reads "FSR Internal".

Nothing changes for anyone until an owner creates a subcontractor and assigns
units. The deploy is inert by design.

---

## Rollback

### Fastest: revert the code only

Almost every user-visible change is in the app layer. The migration is additive
and inert, so **reverting the code alone restores the previous behaviour
completely** — you do not need to touch the database.

```bash
vercel rollback                  # or: git revert <commit> && git push origin main
```

The DB is left with unused tables/columns. Harmless, and it keeps the door open
to re-deploying without re-migrating.

### If the database must also come back

Run the DOWN block commented at the foot of
`supabase/migrations/20260806120000_manufacturing_partners.sql`. In order:

```sql
DROP TRIGGER IF EXISTS wps_guard_manufacturing_ownership ON public.window_production_status;
DROP FUNCTION IF EXISTS public.wps_guard_manufacturing_ownership();
DROP FUNCTION IF EXISTS public.get_subcontractor_worklist();
ALTER TABLE public.window_production_status DROP COLUMN IF EXISTS completed_by_subcontractor_id;
ALTER TABLE public.units DROP COLUMN IF EXISTS manufacturing_assigned_at;
ALTER TABLE public.units DROP COLUMN IF EXISTS manufacturing_partner_id;
DROP TABLE IF EXISTS public.subcontractors;
DROP TABLE IF EXISTS public.manufacturing_partners;
DROP FUNCTION IF EXISTS public.auth_partner_id();
```

Then **re-apply the previous definitions**, which the DROPs above do not restore:

- `20260713170000_phase2_scope_authenticated_access.sql` → `can_access_unit`,
  `units_guard_ownership_columns`, `units_select_scoped`, `units_update_scoped`,
  `wps_insert_mfg`, `wps_update_mfg`
- `20260721120000_archive_read_dedupe.sql` → `get_role_schedule`
- `20260805130000_unit_current_stage.sql` → `get_owner_dataset`

**Data loss on full rollback:** which units were subcontracted, and who completed
what (`completed_by_subcontractor_id`). The production statuses themselves
(`cut`/`assembled`/`qc_approved`) survive — those live in columns this migration
does not touch — so no manufacturing progress is lost, only its attribution.

---

## Symptoms → cause

**A. The cutter/assembler/QC queue is empty after deploy.**
The `get_role_schedule` filter joins `manufacturing_partners` and keeps rows where
`mp.is_internal`. An empty queue means the seed row is missing or `is_internal` is
false. Check:

```sql
SELECT id, name, is_internal FROM manufacturing_partners;
-- expect exactly one row: mp-internal / FSR Internal / true
SELECT manufacturing_partner_id, count(*) FROM units GROUP BY 1;
-- expect every unit on mp-internal
```

**B. A cutter gets "manufactured by a subcontractor" on a unit that should be ours.**
That unit's `manufacturing_partner_id` is wrong. An owner can move it back from the
unit detail page, or:

```sql
UPDATE units SET manufacturing_partner_id = 'mp-internal' WHERE id = '<unit>';
```
Then trigger a reflow (any manufacturing mutation does it) so its schedule rows
are rebuilt.

**C. A scheduler cannot change a manufacturer.**
Working as intended — only the owner may change it once set. The scheduler makes
the initial choice through the room-creation gate.

**D. Everyone is prompted for a manufacturer when adding rooms.**
Also intended: `manufacturing_assigned_at IS NULL` on every pre-existing unit, so
each gets asked once. To suppress it for historical units:

```sql
UPDATE units SET manufacturing_assigned_at = now() WHERE manufacturing_assigned_at IS NULL;
```

---

## What the exclusivity guarantee rests on

If you change any of these, re-read
`docs/security/ACTION_AUTHZ_MATRIX.md` § "Manufacturing exclusivity" first. The
invariant is that no window is ever actionable by the in-house factory and a
subcontractor at the same time:

- `get_role_schedule` — internal-only `src` CTE
- `assembleRoleScheduleItems` (`src/lib/manufacturing-scheduler.ts`) — TS mirror
- `get_subcontractor_worklist` — partner-scoped
- `wps_guard_manufacturing_ownership` — the write-side trigger that backstops all of it
