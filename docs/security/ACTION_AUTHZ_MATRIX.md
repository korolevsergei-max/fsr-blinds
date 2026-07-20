# Server-Action Authorization Matrix

**Created:** 2026-07-19 (Phase A4 — residual authz closure, deep assessment §3).
**Purpose:** a durable, traced record of the authorization backstop behind **every**
`"use server"` export in the app, so a future security sweep does not re-flag
actions whose protection is RLS or a shared guard rather than an inline
`requireX()`. **Maintenance rule (constraint, DEEP_ASSESSMENT §4):** every new
server action lands with a row here; every removed action's row is deleted.

## Trust model (unchanged)

Authorization decisions read **only** service-role-written `app_metadata.role`
(surfaced as `AppUser.role` via `getCurrentUser()`); `user_metadata` is never
trusted. See the header comment in [`src/lib/supabase/middleware.ts`](../../src/lib/supabase/middleware.ts).

Three protection mechanisms appear below:

- **Guard** — an explicit `requireOwner()` / `requireCutter()` / … or a shared
  `assert*` / `require*` helper that throws or returns an error for the wrong role.
- **RLS backstop** — the action runs on the **user-context** client
  (`createClient()`, not the admin client), so the Phase 2 row-level-security
  write/read policies ([`20260713170000_phase2_scope_authenticated_access.sql`](../../supabase/migrations/20260713170000_phase2_scope_authenticated_access.sql))
  decide what the caller may touch. These are multi-role by design (a room edit
  is legitimate for owner, scheduler, and field roles); an inline role guard would
  be wrong. Recorded here so S2 stays closed durably.
- **Not an endpoint** — deliberately **not** a `"use server"` export
  (server-to-server helper only); no network surface. See `revalidation.ts`.

## Rate limiting

Per-user token buckets (`src/lib/rate-limit.ts`, commit `6e3b424`) protect the
expensive dataset/detail refresh actions; noted in the relevant rows.

---

## `src/app/actions/revalidation.ts` — internal helpers (NOT endpoints)

Finding **S1** (fixed 2026-07-19, this phase): the module previously carried
`"use server"`, exposing five cache-invalidation helpers as unauthenticated POST
endpoints — `revalidateAllPortalData()` busts every portal layout, a cheap
anonymous cache-bust/DoS lever against the 5 s queue read + 509 KB owner dataset.

**Fix:** removed the `"use server"` directive. All callers are server-side
guarded action modules (`management-actions.ts`, `fsr-data/_shared.ts`,
`fsr-data/assignments.ts`). A role guard was rejected — these run under both
owner (management) and scheduler (assignment) paths; removing the network
boundary entirely is the correct fix. `revalidatePath` is server-only, so a
client import fails the build.

| Export | Mechanism |
|---|---|
| `revalidateAllPortalData`, `revalidateClientRoutes`, `revalidateBuildingRoutes`, `revalidateUnitRoutes`, `revalidateManyUnitRoutes` | **Not an endpoint** — internal only, called from guarded actions |

---

## `src/app/actions/auth/*` — account & session

Account create/delete/mutate go through `assertOwnerForAccountActions()` (owner)
or `assertOwnerOrSchedulerForInstallerActions()` (owner ∨ scheduler) in
[`auth/helpers.ts`](../../src/app/actions/auth/helpers.ts), on the **admin** client.

| Export | File | Guard |
|---|---|---|
| `createAssemblerAccount`, `deleteAssemblerAccount` | `auth/assembler.ts` | `assertOwnerForAccountActions()` (owner) |
| `createCutterAccount`, `deleteCutterAccount` | `auth/cutter.ts` | `assertOwnerForAccountActions()` (owner) |
| `createQcAccount`, `deleteQcAccount` | `auth/qc.ts` | `assertOwnerForAccountActions()` (owner) |
| `createInstallerAccount`, `deleteInstallerAccount` | `auth/installer.ts` | `assertOwnerOrSchedulerForInstallerActions()` (owner ∨ scheduler) |
| `setSchedulerBuildingAccess`, `createSchedulerAccount`, `deleteSchedulerAccount` | `auth/scheduler.ts` | `assertOwnerForAccountActions()` (owner) |
| `createOwnerAccount`, `deleteOwnerAccount`, `changeAccountPassword`, `deleteOrphanAuthAccount` | `auth/owner.ts` | `assertOwnerForAccountActions()` (owner); `changeAccountPassword` re-auths self |
| `inviteUser` | `auth/session.ts` | `assertOwnerForAccountActions()` (owner) |
| `signInWithPasswordAction`, `signOut` | `auth/session.ts` | **Public by design** (login/logout) — Supabase Auth validates credentials |
| `signUpOwnerAction` | `auth/session.ts` | **Public but self-closing** — refuses once `ownerAccountExists()` is true (bootstrap only; commit `2acd458`) |

---

## `src/app/actions/management-actions.ts` — owner CRUD

All mutating exports call `requireOwner()`.

| Export | Guard |
|---|---|
| `createClient_`, `updateClient`, `deleteClient`, `updateBuilding`, `deleteBuilding`, `createBuilding`, `deleteUnit`, `bulkDeleteUnits`, `purgeAllClientData`, `createUnit`, `updateUnit`, `updateUnitCompleteByDate`, `bulkImportUnits`, `assignUnitsToScheduler`, `backfillInstalledWindowProductionStatus` | `requireOwner()` (owner) |
| `loadSchedulerUnitAssignments`, `getUnitSchedulerAssignment` | Read-only; RLS backstop (user-context client) |

---

## `src/app/actions/fsr-data/assignments.ts`

| Export | Guard |
|---|---|
| `bulkAssignUnits`, `updateUnitAssignment` | `requireOwnerOrScheduler()` (owner ∨ scheduler) |

## `src/app/actions/fsr-data/notifications.ts`

| Export | Guard |
|---|---|
| `markNotificationRead`, `markAllNotificationsRead` | `resolveNotificationRecipient()` — recipient derived from session (scheduler ∨ installer); returns Unauthorized otherwise |

## `src/app/actions/fsr-data/rooms.ts`, `windows.ts`, `photos.ts` — field data mutations

**S2 (justified, durable record):** these mutate rooms / windows / photos on the
**user-context** client and are legitimately multi-role (owner, scheduler,
cutter, assembler, qc, installer all edit field data within their scope). The
Phase 2 RLS write policies are the authorization boundary; an inline role guard
would be wrong. A subset additionally resolves the actor via `getCurrentUser()`
for attribution / self-checks (noted). Reads are RLS-scoped identically.

| Export | File | Mechanism |
|---|---|---|
| `createRoomsForUnit`, `updateRoomName`, `deleteRoom` | `rooms.ts` | **RLS backstop** |
| `deleteWindow`, `createWindowWithPhoto`, `updateWindowWithOptionalPhoto`, `undoWindowStage` | `windows.ts` | **RLS backstop** |
| `updateUnitStatus` | `windows.ts` | No-op stub (returns "no longer supported") |
| `bulkMarkUnitWindowsInstalled`, `bulkMarkUnitWindowsBracketed` | `windows.ts` | `getCurrentUser()` actor resolve + **RLS backstop** |
| `uploadUnitStagePhotos`, `uploadWindowPostBracketingPhoto`, `uploadWindowInstalledPhoto`, `uploadRoomFinishedPhotos`, `uploadRoomQuickPhotos` | `photos.ts` | **RLS backstop** (storage + row policies) |
| `deleteWindowStagePhoto`, `deleteWindowMediaItem`, `deleteRoomFinishedPhoto`, `deleteWindowMeasurementPhoto` | `photos.ts` | `getCurrentUser()` + **RLS backstop** |

## `src/app/actions/post-install-issue-actions.ts`

| Export | Guard |
|---|---|
| `openPostInstallIssue`, `addPostInstallIssueNote`, `resolvePostInstallIssue` | `requirePostInstallIssueUser()` (owner ∨ scheduler) |

---

## `src/app/actions/production-actions.ts` — factory marks

| Export | Guard |
|---|---|
| `markWindowCut` | `requireCutter()` (cutter) |
| `markWindowAssembled` | `requireAssembler()` (assembler) |
| `markWindowQCApproved` | `requireQc()` (qc) |
| `computeAndUpdateManufacturingRisk` | **Guarded 2026-07-19 (this phase):** was an unguarded `"use server"` export (anonymous POST could trigger the facility-wide risk-flag write + notification N+1). Now no-ops unless `getCurrentUser().role ∈ {owner, cutter, assembler, qc}`. Its only legitimate callers are the three authenticated dashboard renders (in `after()`). **Phase C2 removes it from the action surface entirely** (mutation-trigger + cron). |

## `src/app/actions/cutter-production-actions.ts`

| Export | Guard |
|---|---|
| `moveUnitToProduction`, `moveUnitBackToQueue` | `requireCutterOrOwner()` (cutter ∨ owner) |

## `src/app/actions/label-print-actions.ts`

| Export | Guard |
|---|---|
| `markLabelsPrinted`, `markCutListPrinted` | `requireCutterOrOwner()` (cutter ∨ owner) |

## `src/app/actions/manufacturing-actions.ts`

| Export | Guard |
|---|---|
| `updateManufacturingSettings`, `toggleManufacturingWorkday` | `requireOwner()` (owner) |
| `shiftWindowManufacturingSchedule`, `markWindowManufacturingIssue`, `resolveWindowManufacturingIssue`, `undoWindowCut`, `undoWindowAssembly`, `undoWindowQC` | `requireManufacturingUser()` (owner ∨ cutter ∨ assembler ∨ qc) |
| `returnWindowToCutter` | `getCurrentUser()` role ∈ {assembler, qc} |
| `returnWindowToAssembler` | `getCurrentUser()` role === qc |

## `src/app/actions/owner-verification-actions.ts`

| Export | Guard |
|---|---|
| `uploadOwnerVerificationPhotos`, `saveOwnerVerificationPhotoNotes`, `deleteOwnerVerificationPhoto` | `requireOwner()` (owner) |

## `src/app/actions/dataset-queries.ts` — client-facing refresh (rate-limited)

| Export | Guard |
|---|---|
| `refreshDataset` | role must equal `DATASET_ROLE_FOR_KIND[kind]`; token-bucket `DATASET_REFRESH_LIMIT` per user |
| `refreshUnitDetail` | role === owner; token-bucket `UNIT_DETAIL_REFRESH_LIMIT` |
| `refreshSchedulerUnitDetail` | role === scheduler; token-bucket `UNIT_DETAIL_REFRESH_LIMIT` |
| `fetchUnitSupplementalData`, `fetchUnitMediaAndMilestones`, `fetchUnitMedia`, `fetchUnitMilestones` | Read-only; delegate to loaders on the user-context client — **RLS backstop** |

---

## Open items tracked elsewhere

- `computeAndUpdateManufacturingRisk` gets a lightweight guard here; its
  structural fix (off the action surface) is **Phase C2** (roadmap Phase 5).
- `/qc` middleware `PORTAL_REQUIRED_ROLE` entry (S4) — **Phase A1 remainder**,
  shipped separately; defense-in-depth, not an action-authz gap.
