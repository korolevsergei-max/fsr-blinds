# Data Scoping Plan

> **Status:** Design only (Prompt 5A). No code changes. Implementation is a separate session (5B).
> This document is the contract for that work and must be approved before any code is written.

## Context — why this change

`loadFullDataset()` ([src/lib/server-data.ts:422](../../src/lib/server-data.ts#L422)) loads the
**entire domain** — clients, buildings, units, rooms, windows, installers, schedule_entries, cutters,
schedulers, scheduler_unit_assignments, escalations, post-install issues — into memory and ships it to
**every owner session**. After the load, `finalizeDataset()` runs three more all-units passes
(`withPostInstallIssues` → `withLiveUnitStatuses` → `withManufacturingEscalations`,
[server-data.ts:416-420](../../src/lib/server-data.ts#L416-L420)), and `withLiveUnitStatuses` performs
**DB writes inside the read path** via `after()`
([server-data.ts:400-411](../../src/lib/server-data.ts#L400-L411)).

The payload — and every client render that reads it — scales **linearly with the business**. Every new
building slows every page for every user. There is no pagination. This is root cause #1 in
[PERFORMANCE_PROMPTS_2026.md](./PERFORMANCE_PROMPTS_2026.md).

**Key leverage — the scoped-loader pattern already exists and is proven.** Three loaders already return
a full-shaped `AppDataset` over a *small* row set:
`loadUnitDetail()` ([server-data.ts:1035](../../src/lib/server-data.ts#L1035)),
`loadSchedulerDataset()` ([server-data.ts:546](../../src/lib/server-data.ts#L546)), and
`loadInstallerDataset()` ([server-data.ts:709](../../src/lib/server-data.ts#L709)). The client store is a
single React context read via `useAppDataset` / `useAppDatasetMaybe`
([src/lib/dataset-context.tsx](../../src/lib/dataset-context.tsx)), and **nested providers shadow
parents** (it is plain `useContext`) — so we can scope data **per route without touching the ~27
consumer components**. And `recomputeUnitStatus()`
([src/lib/unit-progress.ts:15](../../src/lib/unit-progress.ts#L15)) already persists `units.status` at
**every** mutation, which means the read-path write-back is pure self-heal and can be removed.

This refactor is therefore mostly *extending an existing pattern* to the owner portal, not inventing new
infrastructure — which keeps the blast radius small.

## Architectural decisions

1. **Detail / edit pages — RSC scoped fetch → thin nested `AppDatasetProvider` (hybrid).** Edit
   components depend on optimistic `patchData` + realtime + IndexedDB, so they need a *writable client
   store*. We keep that store but scope it per route. The Server Component does the scoped fetch; a thin
   per-route provider hands it to the (unchanged) client components. Aligns with the
   streaming/PPR direction already in flight.
2. **Units list — true server-side pagination + server-side filters.** Filters become `searchParams`
   that drive `.in/.eq/.range` + an exact count; realtime becomes a debounced refetch of the current
   page. Accounts list is deferred (staff scales slowly).
3. **Global "spine" = staff + buildings + clients.** Installers, schedulers, cutters, buildings, and
   clients scale with org size (slowly) and stay globally loaded. Units, rooms, windows, and schedule —
   which scale with business volume — become per-route.
4. **Read-path writes — remove now.** Delete the `after()` write-back, keep a scoped `currentStage`
   computation, add a drift-counter log, and heal any legacy drift once with a one-time backfill.

---

## 1. Who actually needs what (consumer map)

Every `useAppDataset` / `useAppDatasetMaybe` caller, by the data scope it truly reads:

**GLOBAL — list / dashboard (this is the scaling problem):**

| Route / component | Truly reads | Note |
| --- | --- | --- |
| `src/app/management/page.tsx` (dashboard) | **counts** of units by status; buildings/clients/staff for headers | Needs aggregates, not rows |
| `src/app/management/units/units-list.tsx` | units + buildings/clients/installers/schedulers (filter labels) | **No pagination** — renders all `sortedFiltered` via `.map()` |
| `src/app/management/schedule/schedule-screen.tsx` | units + schedule | Calendar across all units |
| `src/app/management/accounts/accounts-manager.tsx` | staff lists only | No units |
| `src/app/scheduler/*` | scheduler-scoped units/schedule | **Already scoped** via `loadSchedulerDataset` |

**SCOPED-TO-UNIT / ROOM / WINDOW — detail + edit (the bulk, ~15+ components):**
`management/units/[id]/*` (detail, assign, dates, rooms, summary), the room/window detail pages, and the
shared edit components — `unit-key-dates-editor`, `unit-status-editor`, `window-form`,
`installed-photo-form`, `post-bracketing-photo-form`, `bulk-install-button`,
`owner-verification-photos-screen`, `use-unit-supplemental`. Each reads only **one unit's**
units/rooms/windows/schedule/postInstallIssues/escalations, plus the **installers/schedulers** pick-lists
for assignment.

**SCOPED-TO-BUILDING:** `management/buildings/[id]` (one building's units); `installer/buildings/[buildingId]`.
**SCOPED-TO-CLIENT:** `management/clients/[id]` (one client's buildings + units).
**Already scoped:** `installer/*` (`loadInstallerDataset`), `scheduler/*` (`loadSchedulerDataset`).

**Conclusion.** The only genuinely global needs are (a) the management **units list**, (b) the
**dashboard counts**, (c) the **schedule calendar**, and (d) the small **reference lists** (staff,
buildings, clients). Everything else is one-unit / one-building / one-client scope.

## 2. Target architecture

**(a) The spine — `management/layout.tsx` stops calling `loadFullDataset`.** It loads a small
`ReferenceDataset` (buildings, clients, installers, schedulers, cutters) and provides it through the
existing context. Add `loadReferenceData()` to `server-data.ts`, extracted from the meta queries already
present in `loadFullDataset`. These lists scale with org size, not unit volume.

**(b) Detail / edit routes — RSC scoped fetch + nested provider.** Add a route-segment layout that
Server-fetches the unit's scope and mounts a *nested* `AppDatasetProvider` seeded with
`{ ...loadUnitDetail(id), installers, schedulers, buildings:[thisBuilding], clients:[thisClient] }`.
Because `useAppDataset` reads the nearest provider, the existing components see ~1 unit instead of the
whole DB — **zero component changes**. Extend `loadUnitDetail` to also attach the unit's
postInstallIssues + escalations (it already runs `finalizeDataset`) and the small staff pick-lists. Same
pattern for `buildings/[id]` (new `loadBuildingUnits(id, page)`) and `clients/[id]` (new
`loadClientDataset(id)`).

**(c) Units list — server-side pagination + filters.** Convert `management/units/page.tsx` to read
`searchParams` (client, building, status, installer, scheduler, floor, date range, issues) and call a new
`loadUnitsPage(filters, page, pageSize = 50)` that builds `.in/.eq/.range` + `count:"exact"`. Render the
page rows server-side (or hydrate a provider holding just that page). Filter dropdown **options** come
from the spine (buildings/clients/staff) — we never load all units to populate a `<select>`. An optional
`get_units_page` RPC can follow later, mirroring the existing `get_full_dataset` fast path.

**(d) Dashboard — server aggregates.** Replace client-side counting with a grouped count query / RPC
(`get_dashboard_counts`) returning `{ status → count }` plus headline totals. No unit rows shipped.

**(e) Minimal shared client state that remains global:** current user (already via `syncMeta`),
notification counts (already separate — `getUnreadNotificationCount`), and the spine reference lists. A
"live status" signal stays global but only **invalidates** the current route (see §5) — it no longer
patches a giant blob.

## 3. Remove writes from the read path

`units.status` and `schedule_entries.status` are **already persisted at every mutation** by
`recomputeUnitStatus()` ([unit-progress.ts:29,41](../../src/lib/unit-progress.ts#L29)). Confirmed
callers: `finalizeUnitMutation` (all window measure/bracket/install + room create/delete),
`production-actions` (cut / assemble / QC via `scheduleManufacturingFollowUp`), and
`manufacturing-actions` (undo / return-to-cutter). So the `after()` write-back in `withLiveUnitStatuses`
([server-data.ts:400-411](../../src/lib/server-data.ts#L400-L411)) is pure self-heal.

**Plan:**

1. **Delete** the `after()` block (lines 400-411). Keep the counts → `currentStage` / `status`
   *computation* — `currentStage` is **not** persisted and is needed by detail/pipeline views — but run
   it only over the **scoped** unit set each route already loads (small N), not all units.
2. Replace the write-back with a **read-only drift log** (counter/metric) so we can confirm in production
   that no mutation ever misses `recomputeUnitStatus`.
3. Ship a **one-time backfill** (admin action or SQL migration) that recomputes `units.status` /
   `schedule_entries.status` once for any legacy drift — instead of healing on every read forever.
4. Once the log shows zero drift, the scoped compute can trust the persisted `status` for lists and only
   derive `currentStage` where it is actually displayed.

## 4. Sequenced, low-risk migration

`loadFullDataset` stays intact until Phase 4 — every phase is independently shippable and revertible.

- **Phase 0 — de-risk reads (smallest blast radius).** Remove the `after()` write-back, add the drift log
  and one-time backfill (§3). No data-contract change. Verify dashboards are unchanged.
- **Phase 1 — scoped unit-detail subtrees.** Add nested providers to `management/units/[id]/*` via
  `loadUnitDetail`. Components untouched. Parity-check each page against the current render. Then repeat
  for the scheduler/installer unit routes (lower risk — already partly scoped).
- **Phase 2 — scoped building/client routes.** `buildings/[id]` and `clients/[id]` →
  `loadBuildingUnits` / `loadClientDataset` (building page paginated).
- **Phase 3 — list + dashboard (highest risk, last).** `management/units` → `loadUnitsPage` (server
  pagination + filters); `management/page` → `get_dashboard_counts`; schedule calendar → scoped window.
- **Phase 4 — shrink the spine.** Switch `management/layout.tsx` from `loadFullDataset` to
  `loadReferenceData`. Units/rooms/windows/schedule are now loaded *only* per route.
- **Phase 5 — realtime rework.** See §5.

**Parity verification at each step:** snapshot the rendered route (counts, list contents, detail fields)
before and after, and diff. Keep `loadFullDataset` available behind a per-route flag so a converted route
can fall back instantly. Type-check plus a targeted manual walkthrough per portal.

## 5. Realtime, rollback, and risks

**Realtime is the main risk.** `use-realtime-sync.ts` subscribes to tables **globally with no filters**,
and `upsert()` **blindly appends out-of-scope rows**
([use-realtime-sync.ts:45-53, 195-205](../../src/lib/use-realtime-sync.ts#L45-L53)). With scoped
datasets, global row-patching would pollute a route's scope. **Mitigation:** for
units/rooms/windows/schedule, switch to the **scoped debounced-refetch** model the scheduler path already
uses (`scheduleScopedRefresh` / `scheduleDatasetRefresh`,
[use-realtime-sync.ts:129-156](../../src/lib/use-realtime-sync.ts#L129-L156)): on a relevant event,
refetch the *current route's* scope (or the current units-list page) instead of patching a global array.
Keep cheap row-patching only for the small spine lists (clients/buildings/installers/schedulers/cutters).
Where possible, add Supabase channel filters (e.g. `filter: unit_id=eq.<id>`) on detail routes to cut
event volume.

**Rollback story.** Phase 0 is a one-line revert (re-add `after()`). Phases 1-3 are gated per route — the
nested provider can be removed so components fall back to the parent (full) provider, because they read
the nearest provider via `useAppDatasetMaybe`. Phase 4 (shrinking the spine) is the only
hard-to-reverse step; it ships **after** all routes are self-sufficient and verified, and reverts by
pointing the layout back at `loadFullDataset`.

**Other risks:**

- The IndexedDB cache in `AppDatasetClientShell` assumes one global dataset. Per-route providers need
  either scoped cache keys or to skip IDB on scoped routes (decide in 5B; default: **skip IDB on scoped
  routes, keep it for the spine**).
- `normalizeScheduleEntries` runs on every realtime patch over the full schedule — scoping shrinks N.
- Filter dropdowns must source their options from the spine, not from a full units load — otherwise we
  re-load everything just to populate a `<select>`.

## Files this design will touch in 5B (reference — not edited now)

- `src/lib/server-data.ts` — new `loadReferenceData`, `loadUnitsPage`, `loadBuildingUnits`,
  `loadClientDataset`; extend `loadUnitDetail`; strip `after()` from `withLiveUnitStatuses`.
- `src/app/management/layout.tsx` — spine loader (Phase 4).
- New route-segment layouts under `management/units/[id]`, `management/buildings/[id]`,
  `management/clients/[id]` — nested providers.
- `src/app/management/units/page.tsx` + `units-list.tsx` — server pagination/filters.
- `src/app/management/page.tsx` — aggregate counts.
- `src/lib/use-realtime-sync.ts` — scoped-refetch + channel filters.
- One-time backfill migration under `supabase/migrations/`.

## Verification

This session runs no code; the doc is reviewed and approved. In 5B each phase verifies via:

1. `npm run build` / type-check.
2. Before/after render parity per route.
3. Drift-log = 0 before trusting persisted status.
4. Manual walkthrough of the owner / scheduler / installer portals **plus realtime** (open two sessions,
   mutate in one, confirm the other refetches its scope).
