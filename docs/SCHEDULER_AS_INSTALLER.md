# Schedulers assignable as installers

Some schedulers (Tom) also do the installs. They must be nameable as the **assigned
installer** on a unit while keeping **one login** — their scheduler account and their
scheduler portal. They never get an installer login.

Shipped 2026-09-08, migration `20260908120000_scheduler_installer_alias.sql`.

---

## The problem

`units.assigned_installer_id` is a foreign key into `installers`
(`20250322120000_initial_schema.sql:35`). A `schedulers.id` can never be written there.

The app had long faked it. `combineInstallersWithSchedulers()`
(`src/lib/server-data/build.ts`) injects a synthetic pick-list row per scheduler, id
`sch-<schedulerId>`, name `SC: <name>` — and its docstring said "so owners can assign a
unit to a scheduler acting as an installer". But selecting one upserts
`scheduler_unit_assignments` and **nulls out** `assigned_installer_id`. That is
*coordinator* assignment: a real and still-wanted feature, just not this one. The
scheduler portal's "Assign installer" screen even offered "SC: … — You (scheduler)", and
picking it wiped the installer field.

## The model — two things, never confuse them

| | **Alias row** | **Coordinator pick** |
|---|---|---|
| What | A real `installers` row, `inst-sa-<schedulerId>` | A synthetic pick-list entry, `sch-<schedulerId>` |
| Exists in the DB | Yes, maintained by a trigger | No, built in TS per request |
| Assigning it | Sets `assigned_installer_id` for real | Sets the coordinating scheduler, **clears** the installer |
| Appears in | Every installer picker, dashboard filter, schedule lane, directory | The "Assign scheduler" screen, bulk-assign sheet |
| Marked by | `installers.scheduler_alias_id` non-null | id prefix `sch-` |

The predicates live in `src/lib/scheduler-installer-alias.ts` — `isSchedulerAlias()`,
`isCoordinatorPick()`, `selectableInstallers()`, `installerPickerCaption()`. Use them
rather than re-testing the `SC: ` name prefix or the id shape by hand.

Every scheduler gets an alias row. There is no opt-in toggle.

## Three rules that must not be weakened

**1. An alias row's `auth_user_id` stays NULL.**
It is what `public.auth_installer_id()` resolves
(`20260713170000_phase2_scope_authenticated_access.sql:34-40`). NULL guarantees a scheduler
can never satisfy an installer-arm RLS predicate, never pass a `getLinkedInstallerId()`
check, and can never be routed to `/installer`. An alias row is an assignment target, never
a login. Two consequences to remember:

- `InstallersList` must split alias rows out **before** its `authUserId` orphan check, or
  every scheduler shows up under "Orphaned installer records (not linked to Supabase Auth)".
- Alias rows are invisible to the auth-drift detector (`src/lib/account-sync.ts` filters
  `auth_user_id is not null`), which is correct — there is no auth user to drift from.

**2. An alias row's `scheduler_id` equals its own scheduler id.**
This is why the change needed **no RLS or scoping function changes at all**.
`can_access_unit()`, `units_select_scoped`, `units_update_scoped`,
`get_scheduler_dataset()` and `getSchedulerScopedUnitIds()` all already grant a scheduler
"units whose assigned installer has `scheduler_id` = me". So the moment Tom is the assigned
installer, the unit is already in Tom's scope — read and write, portal and RPC.

**3. An alias row never enters `syncCoordinatorAssignmentForInstaller()`.**
That helper upserts `scheduler_unit_assignments` keyed `onConflict: "unit_id"` — one
coordinator per unit. Letting an alias through would overwrite whoever coordinates the unit
and **silently drop it out of their portal**: if Jane assigns one of her units to Tom, Jane
loses it. The helper returns early on `scheduler_alias_id`. Rule 2 is what makes this safe —
Tom still gets the unit, Jane keeps it too.

## Supporting pieces

- **Notifications.** Callers address the assignee as an installer, but a scheduler reads
  their inbox as `("scheduler", schedulerId)` (`src/lib/server-data/notifications.ts`).
  `emitNotification()` rewrites `("installer", <alias id>)` to `("scheduler", <alias's
  scheduler>)`. It is the one choke point every call site goes through, so nothing else
  needed changing.
- **Email uniqueness.** `installers_email_key` became a partial unique index
  `WHERE scheduler_alias_id IS NULL`. The constraint existed to stop duplicate *accounts*;
  an alias is not one, and it carries the scheduler's real email.
- **Pick-list reach.** A scheduler's pick-list is their team, falling back to all installers
  when the team is empty. Alias rows are unioned in on top (`loadSchedulerDataset`,
  `loadSchedulerUnitDetail`), so every scheduler can assign any scheduler-installer, not
  just their own team lead's. `installers_select_scoped` already lets any scheduler read
  every installer row, so this widens the pick-list only.
- **No RPC changes.** The dataset RPCs project installers as `row_to_json(i.*)`, so
  `scheduler_alias_id` flows through on its own.
- **Deleting a scheduler** cascades to the alias row, which fires the existing
  `units.assigned_installer_id ON DELETE SET NULL`. As with a deleted installer, the
  denormalized `assigned_installer_name` is left behind.

## Deliberately unchanged

No new role, no new portal, no column on `user_profiles`, no change to any SECURITY
DEFINER function, and the "Assign scheduler" coordinator flow works exactly as before.
Tom does the field work from his own portal — the scheduler routes already mirror the
installer routes (`units/[id]/rooms/[roomId]/windows/[windowId]/bracketing`, `/installed`,
`/status`, `windows/new`), and `resolveFieldActor()` already logs a scheduler as a
first-class field actor.

## Rollback

The DOWN block at the foot of `20260908120000_scheduler_installer_alias.sql`. Delete the
alias rows first so `units.assigned_installer_id` returns to NULL, then drop the trigger,
indexes and column, and restore `installers_email_key`.
