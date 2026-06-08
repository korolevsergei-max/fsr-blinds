# Performance Round 2 — Navigation lag + slow uploads (sequenced prompts)

Companion to [PERFORMANCE_PROMPTS_2026.md](./PERFORMANCE_PROMPTS_2026.md) and
[DATA_SCOPING_PLAN.md](./DATA_SCOPING_PLAN.md). Each prompt below is **self-contained** — paste it into
a **fresh** Claude Code session (no prior context needed). Run them top to bottom; ship each as its own
PR off `main`.

**Why this round exists (re-audit 2026-06-08):** Round 1 (compiler, selector store, virtualization,
JWT-claim auth, `get_full_dataset` RPC, image compression) **landed and works**. The slowness the
client still reports traces to the two things never done plus one config choice:

1. **The entire DB is still shipped to every owner session** — `loadFullDataset()`
   (`src/lib/server-data/datasets.ts:30`). Scales linearly with the business. → Track C.
2. **Mobile is the worst case** — `src/app/management/layout.tsx` ships an *empty* dataset to phones,
   then refetches the whole DB after mount, and the IndexedDB cache is disabled for the `"full"`
   loader. → Track A.
3. **Uploads double-hop** — client → Vercel server action → Supabase Storage, blocking, sequential. →
   Track B.

**Global notes (apply to every prompt):**
- Switch model with `/model`; toggle Plan mode with `Shift+Tab`.
- Verification commands: `npm run build`, `npm run typecheck`, `npm run lint`, `npm run test` (84 tests).
- Convention: branch off `main`, one PR per prompt, click through the affected flow on the dev server
  before merging.

**Sequence:** `A → B1 → B2 → B3 → C1 → C2 → C3 → C4 → C5`. A and B1 deliver the biggest felt relief;
Track C is the durable cure that keeps it fast as the data grows.

| Phase | What | Model | Thinking | Mode |
|---|---|---|---|---|
| A | Navigation quick wins | Sonnet 4.6 | `think` | Normal |
| B1 | Direct-to-storage uploads | Opus 4.8 | `think harder` | Plan |
| B2 | Parallelize multi-photo | Sonnet 4.6 | `think` | Normal |
| B3 | Optimistic/background upload | Opus 4.8 | `think hard` | Plan |
| C1 | Scoped unit-detail subtrees | Opus 4.8 | `think harder` | Plan |
| C2 | Scoped building/client routes | Opus 4.8 | `think hard` | Plan |
| C3 | Units list + dashboard pagination | Opus 4.8 | `ultrathink` | Plan |
| C4 | Shrink the spine | Opus 4.8 | `think harder` | Plan |
| C5 | Realtime rework | Opus 4.8 | `ultrathink` | Plan |

---

## Prompt A — Navigation quick wins
**Model: Sonnet 4.6 · `think` · Normal mode**

```
You are working in the FSR Blinds repo: Next.js 16.2.1, React 19.2.4, Supabase (SSR), Tailwind 4, TypeScript 5, deployed on Vercel. It's a PWA with offline IndexedDB caching and 6 role portals (management/owner, installer, scheduler, cutter, assembler, qc).

GOAL: Three small, independent, low-risk navigation wins in ONE PR. The biggest felt issue is that on mobile, the owner/management portal renders a blank screen and then downloads the whole DB before showing anything.

Do these in order:

1. MOBILE STALE-WHILE-REVALIDATE (highest ROI):
   - Read src/components/data/app-dataset-client-shell.tsx and src/lib/offline-cache.ts.
   - Today `canUseOfflineCache = loaderKind !== "full"` (~line 67) EXCLUDES the owner portal from the IndexedDB cache. Change it so the "full" loader ALSO caches + seeds from IDB.
   - The mount-seed effect (`if data.units.length === 0 && data.clients.length === 0 → getCachedData → setData`, ~lines 73-81) and the debounced IDB write (~lines 84-101) should now run for "full" too.
   - Keep the existing `eagerRefreshOnMount` refetch (src/app/management/layout.tsx defers data on mobile and sets eagerRefreshOnMount=true) so fresh data overwrites the cached seed within ~1-2s. This is intentional stale-while-revalidate; the product owner has approved briefly showing last-known data on mobile cold-open.
   - Verify the cache key (`app-dataset:${loaderKind}:${linkedEntityId ?? user.id}`) is correct for the owner (keyed by user.id) so two different owners don't share a cache.

2. PARALLELIZE THE SERVER ENRICHMENT PASSES:
   - Read src/lib/server-data/enrichment.ts. `finalizeDataset()` (~lines 275-279) runs three passes SEQUENTIALLY: withPostInstallIssues → withLiveUnitStatuses → withManufacturingEscalations.
   - These are INDEPENDENT: withPostInstallIssues adds the `postInstallIssues` slice, withLiveUnitStatuses overrides `units` (status), withManufacturingEscalations adds `manufacturingEscalations`. None reads another's output — they only need the base dataset.
   - Run all three on the base `dataset` via Promise.all, then merge the three resulting slices into one dataset: `{ ...dataset, postInstallIssues: <from issues>, units: <from statuses>, manufacturingEscalations: <from escalations> }`. Confirm by reading each function that it only reads the base slices it needs.
   - This MUST be byte-identical output to before — it's pure parallelization. Add a quick assertion in your manual test that the resulting dataset matches the sequential version.

3. SUSPENSE ON THE INSTALLER LAYOUT:
   - src/app/installer/layout.tsx awaits loadInstallerDataset with NO Suspense, so it blocks with no skeleton. src/app/installer/loading.tsx already exists.
   - Wrap the async data shell in <Suspense fallback={<InstallerLoading/>}> exactly like src/app/management/layout.tsx and src/app/scheduler/layout.tsx already do. Don't change the data loading itself.

4. SANITY CHECK (no change expected): grep for `revalidatePath("/management", "layout")` and any `revalidateApp`. Confirm no owner mutation busts the management LAYOUT cache (only page-level revalidation in src/app/actions/revalidation.ts is expected). Report if you find a layout-level bust.

CONSTRAINTS:
- Do not change server-side data CONTENTS or the realtime subscription tables. Behavior must be identical except for the cache-seed-on-mobile and the parallelization.
- npm run build, typecheck, lint, test must all pass.
- Show me the diff before applying. Ship as its own PR off main.

VERIFY: In DevTools, set a mobile user-agent + "Slow 4G", cold-open /management → last data paints immediately (not blank), then refreshes. Clear IndexedDB (Application tab) → falls back to the skeleton with no crash. Confirm /installer shows a skeleton instead of hanging on slow network.
```

---

## Prompt B1 — Direct-to-storage uploads (kill the double-hop)
**Model: Opus 4.8 · `think harder` · Plan mode mandatory**

```
You are working in the FSR Blinds repo: Next.js 16.2.1, React 19.2.4, Supabase (SSR), deployed on Vercel.

PROBLEM: Photo uploads double-hop. The client sends image bytes to a Next.js server action, which reads them (`await file.arrayBuffer()`) and THEN uploads to Supabase Storage — see src/app/actions/fsr-data/photos.ts (e.g. uploadUnitStagePhotos ~lines 51-101, also uploadWindowPostBracketingPhoto, uploadWindowInstalledPhoto). So every photo's bytes traverse client → Vercel function → Supabase (two legs, blocking the response), and the 12MB serverActions.bodySizeLimit gates photo size. Compression already happens client-side (~400KB JPEG via src/lib/image-upload.ts), so this is purely a transport-architecture cost.

GOAL: Move to direct-to-storage uploads with signed upload URLs, so bytes go client → Supabase directly and the server actions only mint a URL and record a DB row.

STEP 1 — INVESTIGATE & PLAN (do not edit yet):
1. Read photos.ts fully, src/app/actions/fsr-data/_shared.ts (BUCKET = "fsr-media", validateIncomingImageFile, assertSchedulerUnitScope, finalizeUnitMutation, the media_uploads insert shape), the owner-verification upload path (private bucket "fsr-owner-verification"), and how the browser Supabase client is created (src/lib/supabase/client.ts / createBrowserClient from @supabase/ssr).
2. Confirm the Supabase JS version supports `storage.from(bucket).createSignedUploadUrl(path)` (server) and `uploadToSignedUrl(path, token, file)` (client). Check package.json (@supabase/supabase-js).
3. Design the three-step flow, keeping the SERVER in control of the storage path and all authorization:
   a) New server action `createPhotoUploadUrl(...)`: authenticate + authorize (reuse getCurrentUser, assertSchedulerUnitScope, ownership checks already in photos.ts), validate the declared file (size/type via validateIncomingImageFile semantics — note the file isn't on the server yet, so validate the declared contentType/size the client sends), build the storage `path` server-side, call createSignedUploadUrl(path). Return { path, token }.
   b) Client uploads the compressed File via uploadToSignedUrl(path, token, file) using the browser client.
   c) New server action `recordWindowPhoto(unitId, path, ...)`: insert the media_uploads row + run finalizeUnitMutation, return { unitStatus, mediaId, publicUrl } for the existing optimistic patch. On record failure, storage.remove([path]) to clean up the orphan.
4. Address SECURITY/CORRECTNESS explicitly:
   - The signed-URL token authorizes the upload, so the client needs NO storage RLS upload grant — but confirm the existing storage RLS policies (supabase/migrations/*storage*) don't block uploadToSignedUrl, and that public read on fsr-media / signed read on fsr-owner-verification still work.
   - Orphan handling: a client can mint a URL + upload bytes but never call recordWindowPhoto. Decide how to avoid orphaned objects (e.g. record-first-then-confirm, or a periodic sweep, or accept orphans as low-cost). Recommend the simplest safe option.
   - Path ownership: the server, not the client, must decide the path so a user can't overwrite another unit's objects.
   - Preserve the existing rollback-on-error behavior and the `after()`-deferred activity log / notifications.
5. Present the plan + the security analysis + which forms change (uploadUnitStagePhotos, uploadWindowPostBracketingPhoto, uploadWindowInstalledPhoto, and the owner-verification + room-finished multi-photo screens). WAIT for approval.

STEP 2 — APPLY (after approval):
- Implement the signed-URL flow. Keep the OLD server-action upload path available as a fallback for one release if you can do it cleanly, otherwise migrate fully and document it.
- npm run build, typecheck, lint, test must pass.

VERIFY: Upload a window photo on a throttled mobile connection. In the Network tab, confirm the image bytes go as a PUT to the Supabase storage host (`/storage/v1/object/...`), NOT to the Vercel server action. Confirm the photo still appears (optimistic), the media_uploads row is written, unit status recomputes, and a forced record failure removes the orphaned object. Test as owner AND as a scheduler (scope enforced) AND that an out-of-scope unit is rejected.

CONSTRAINTS:
- Authorization correctness is non-negotiable — the server owns the path and the scope check. Do NOT let the client choose arbitrary paths.
- Ship as its own PR off main.
```

---

## Prompt B2 — Parallelize multi-photo compress + upload
**Model: Sonnet 4.6 · `think` · Normal mode** — _(do AFTER B1 lands)_

```
You are working in the FSR Blinds repo: Next.js 16.2.1, React 19.2.4, Supabase (SSR). Direct-to-storage signed-URL uploads have just landed (see the previous PR / docs/refactor/PERFORMANCE_PROMPTS_2026_R2.md prompt B1).

PROBLEM: The multi-photo screens compress and upload files ONE AT A TIME in a `for…of await` loop, so 3 photos take ~3x as long as 1. See:
- src/components/units/owner-verification-photos-screen.tsx (~lines 150-156: `for (const file of selected) { const compressed = await compressImageForUpload(file); ... }`)
- src/components/rooms/room-finished-photos.tsx (similar loop)

GOAL: Parallelize compression and upload so multiple photos process concurrently.

TASK:
1. Replace the sequential compression loop with `await Promise.all(selected.map(compressImageForUpload))` (reuse src/lib/image-upload.ts — note it already uses a Web Worker pool, so concurrency is safe and beneficial).
2. Parallelize the per-file signed-URL upload step too (Promise.all over the uploadToSignedUrl calls from B1). Keep a sensible concurrency cap if needed (e.g. 3-4 at a time) so a slow uplink isn't saturated — use a small concurrency helper rather than unbounded Promise.all if you upload many files.
3. Preserve error handling: if one file fails, surface a clear partial-failure message and don't lose the successful ones; keep the existing optimistic-update and rollback behavior.
4. Keep ordering stable in the resulting gallery if order matters (map preserves index order).

CONSTRAINTS:
- No behavior change other than concurrency. UI output identical.
- npm run build, typecheck, lint, test must pass.
- Show me the diff before applying. Ship as its own PR off main.

VERIFY: Upload 3 photos on a throttled connection; total wall-clock should be ~1x a single photo (worker/network bound), not 3x. Force one of the three to fail and confirm the other two still succeed with a clear message.
```

---

## Prompt B3 — Optimistic / background upload
**Model: Opus 4.8 · `think hard` · Plan mode**

```
You are working in the FSR Blinds repo: Next.js 16.2.1, React 19.2.4, Supabase (SSR). It's a PWA; field staff often have flaky mobile connections.

CONTEXT: There is ALREADY an IndexedDB-backed upload queue with retry + exponential backoff at src/lib/upload-queue.ts (registered for uploadWindowInstalledPhoto / uploadWindowPostBracketingPhoto) but the photo forms currently call the upload synchronously and block the UI until storage + DB writes complete. Direct-to-storage signed URLs landed in B1.

GOAL: Make photo uploads optimistic and resilient — the user can move on immediately while the upload finishes in the background and reconciles on success / reconnect.

STEP 1 — PLAN (do not edit yet):
1. Read src/lib/upload-queue.ts fully, and the photo forms (installed-photo-form.tsx, post-bracketing-photo-form.tsx, and the multi-photo screens). Read how patchData/optimistic updates and upsertUnitStageMediaItem work today.
2. Design the flow: on submit → compress → optimistically patch the store (show the photo + new unit status immediately) → enqueue the signed-URL upload + recordWindowPhoto in the queue → let the user navigate away → the queue processes on success / online / visibility events and reconciles the real mediaId/publicUrl, or rolls back the optimistic item on permanent failure (after max retries) with a visible "couldn't upload" indicator.
3. Address: how the optimistic media item is keyed so the real row replaces it (temp id → real id); what happens if the user closes the app mid-upload (queue persists in IDB and resumes); how this interacts with the B1 orphan-handling decision and realtime echoes (avoid duplicate gallery entries).
4. Present the plan + the failure/reconciliation matrix. WAIT for approval.

STEP 2 — APPLY (after approval):
- Wire the photo forms through the queue with optimistic UI + reconciliation. Keep a clear pending/failed visual state per photo.
- npm run build, typecheck, lint, test must pass.

VERIFY: Go offline mid-upload → photo shows as pending, UI is not blocked, navigation works; go online → it uploads and reconciles. Kill and reopen the app while a photo is queued → it resumes. Force permanent failure → optimistic item is rolled back / marked failed, not silently lost.

CONSTRAINTS:
- Correctness over speed: never show a "saved" photo that didn't actually persist. Stale/duplicate gallery entries are the failure modes to avoid.
- Ship as its own PR off main.
```

---

## Prompt C1 — Data scoping: scoped unit-detail subtrees
**Model: Opus 4.8 · `think harder` · Plan mode**

```
You are working in the FSR Blinds repo: Next.js 16.2.1, React 19.2.4, Supabase (SSR).

CONTEXT: We have an approved migration plan at docs/refactor/DATA_SCOPING_PLAN.md for moving the owner/management portal off the monolithic loadFullDataset() (src/lib/server-data/datasets.ts:30) toward per-route scoped Server Component queries. Read that plan first — it is the source of truth. loadFullDataset still ships the ENTIRE domain to every owner session and scales linearly with the business; this is root cause #1.

GOAL: Implement ONLY the FIRST migration step from the plan — scoped unit-detail subtrees — while keeping loadFullDataset intact for every screen not yet migrated.

STEP 1 — RE-READ & PLAN (do not edit yet):
1. Re-read DATA_SCOPING_PLAN.md §2(b) and §4 Phase 1, and restate the exact step. If the codebase has drifted from the plan, STOP and tell me.
2. Confirm the pattern: add a route-segment layout under src/app/management/units/[id]/ that Server-fetches the unit's scope via loadUnitDetail (src/lib/server-data/lookups.ts:50) and mounts a NESTED AppDatasetProvider seeded with { ...loadUnitDetail(id), installers, schedulers, buildings:[thisBuilding], clients:[thisClient] }. Because consumers read the NEAREST provider (useDatasetSelector / useAppDatasetMaybe), the existing detail/edit components see ~1 unit instead of the whole DB with ZERO component changes.
3. Extend loadUnitDetail to also attach the unit's postInstallIssues + escalations (it already runs finalizeDataset) and the small installers/schedulers pick-lists needed by the assign screens.
4. CRITICAL — realtime: src/lib/use-realtime-sync.ts upsert()s out-of-scope rows blindly, which would pollute a scoped provider. For this nested route, either (a) skip the global realtime patching and use the scoped debounced-refetch model the scheduler path already uses, or (b) add Supabase channel filters (filter: unit_id=eq.<id>). Decide and justify. Also decide IDB cache behavior for scoped routes (plan default: skip IDB on scoped routes, keep it for the spine).
5. Present the plan + a parity checklist (every field on the detail/assign/dates/status/rooms/summary subpages). WAIT for approval.

STEP 2 — APPLY (after approval):
- Implement the nested layout + provider for management/units/[id]/* only. Do not touch other routes. Keep loadFullDataset for everything else.
- Parity-verify: the migrated subtree shows identical data and behavior to before. Then repeat the SAME pattern for the lower-risk scheduler/installer unit routes if time permits, or leave for a follow-up.
- npm run build, typecheck, lint, test must pass.

CONSTRAINTS:
- Migrate ONLY the unit-detail subtree this PR. Do not delete loadFullDataset or change unmigrated screens.
- Keep loadFullDataset behind a per-route fallback so the nested provider can be removed to fall back to the parent (full) provider instantly.
- Ship as its own PR off main.
```

---

## Prompt C2 — Data scoping: scoped building/client routes
**Model: Opus 4.8 · `think hard` · Plan mode**

```
You are working in the FSR Blinds repo: Next.js 16.2.1, React 19.2.4, Supabase (SSR). Scoped unit-detail subtrees have landed (prompt C1). Source of truth: docs/refactor/DATA_SCOPING_PLAN.md §2(b), §4 Phase 2.

GOAL: Apply the SAME nested-scoped-provider pattern to the building and client detail routes.

STEP 1 — PLAN (do not edit yet):
1. Add `loadBuildingUnits(buildingId, page)` and `loadClientDataset(clientId)` to src/lib/server-data/ (mirror loadUnitDetail / loadSchedulerDataset shapes — return a full-shaped AppDataset over a small row set). The building page should paginate its units; the client page returns that client's buildings + units.
2. Add route-segment layouts under src/app/management/buildings/[id]/ and src/app/management/clients/[id]/ mounting nested AppDatasetProviders seeded from those loaders. Components untouched.
3. Same realtime decision as C1 (scoped debounced-refetch or channel filters) for these scopes.
4. Present plan + parity checklist. WAIT for approval.

STEP 2 — APPLY (after approval):
- Implement both routes. Keep loadFullDataset intact for unmigrated screens; per-route fallback preserved.
- npm run build, typecheck, lint, test must pass; parity-verify each route.

CONSTRAINTS:
- Two routes this PR (buildings/[id], clients/[id]); do not touch the units LIST or dashboard yet (that's C3).
- Ship as its own PR off main.
```

---

## Prompt C3 — Data scoping: units list + dashboard pagination (highest risk)
**Model: Opus 4.8 · `ultrathink` · Plan mode mandatory**

```
You are working in the FSR Blinds repo: Next.js 16.2.1, React 19.2.4, Supabase (SSR). Detail/building/client routes are already scoped (prompts C1-C2). Source of truth: docs/refactor/DATA_SCOPING_PLAN.md §2(c)(d), §4 Phase 3. THIS IS THE HIGHEST-RISK STEP — the units list and dashboard are the most-used owner screens.

PROBLEM: src/app/management/units/units-list.tsx still derives from the global dataset and renders ALL units (virtualized, but still loaded + filtered + sorted in the client over the whole set). src/app/management/page.tsx counts statuses client-side over all units. Both scale with the business.

GOAL: Server-side pagination + filters for the units list, and server aggregates for the dashboard.

STEP 1 — PLAN (do not edit yet):
1. UNITS LIST: convert src/app/management/units/page.tsx to read searchParams (client, building, status, installer, scheduler, floor, date range, issues) and call a new `loadUnitsPage(filters, page, pageSize=50)` that builds .in/.eq/.range + count:"exact". Filter dropdown OPTIONS must come from the spine (buildings/clients/staff), NEVER from a full units load. Decide: render rows server-side, or hydrate a provider holding just that page. Preserve sorting + the existing virtualization for the page rows.
2. DASHBOARD: replace client-side counting with a grouped count query / new `get_dashboard_counts` RPC returning { status → count } + headline totals. No unit rows shipped.
3. REALTIME: a relevant event becomes a debounced refetch of the CURRENT page / current counts, not a global array patch.
4. Preserve every current filter, sort, badge, and empty-state. Present the plan + a precise parity checklist + the rollback (keep loadFullDataset behind a flag). WAIT for approval.

STEP 2 — APPLY (after approval):
- Implement units list pagination + filters and the dashboard aggregates. Parity-verify exhaustively against the current screens with a large dataset.
- npm run build, typecheck, lint, test must pass.

CONSTRAINTS:
- This is the screen owners use most — stale/missing rows or wrong counts are the failure modes. Be conservative; keep the old path one flag-flip away.
- An optional get_units_page RPC can follow later (mirror get_full_dataset). Ship as its own PR off main.
```

---

## Prompt C4 — Data scoping: shrink the spine
**Model: Opus 4.8 · `think harder` · Plan mode**

```
You are working in the FSR Blinds repo: Next.js 16.2.1, React 19.2.4, Supabase (SSR). All owner routes are now self-sufficient via scoped loaders (prompts C1-C3). Source of truth: docs/refactor/DATA_SCOPING_PLAN.md §2(a), §4 Phase 4. This is the step that finally stops shipping the whole DB.

GOAL: Switch src/app/management/layout.tsx from loadFullDataset to a small `loadReferenceData` (the "spine": buildings, clients, installers, schedulers, cutters only). Units/rooms/windows/schedule are now loaded ONLY per route.

STEP 1 — PLAN (do not edit yet):
1. Add `loadReferenceData()` to src/lib/server-data/ — extract the meta queries already present in loadFullDataset (buildings/clients/installers/schedulers/cutters). These scale with org size, not unit volume.
2. Verify NOTHING in the management subtree still reads units/rooms/windows/schedule from the global provider (everything should now read its nearest scoped provider after C1-C3). grep useDatasetSelector/useAppDataset under src/app/management and confirm. List any stragglers and fix or flag them.
3. This is the only hard-to-reverse step — it reverts by pointing the layout back at loadFullDataset. Confirm the rollback is a one-line swap. Present the plan + the straggler audit. WAIT for approval.

STEP 2 — APPLY (after approval):
- Swap the layout to loadReferenceData. Re-seed the management mobile-cache key appropriately (the spine is small).
- Full regression pass across every owner screen. npm run build, typecheck, lint, test must pass.

CONSTRAINTS:
- Do NOT ship this until C1-C3 are verified in production. Ship as its own PR off main.
```

---

## Prompt C5 — Data scoping: realtime rework
**Model: Opus 4.8 · `ultrathink` · Plan mode mandatory**

```
You are working in the FSR Blinds repo: Next.js 16.2.1, React 19.2.4, Supabase (SSR). The owner portal no longer loads the whole DB (prompts C1-C4). Source of truth: docs/refactor/DATA_SCOPING_PLAN.md §5. Realtime is the main remaining risk of scoping.

PROBLEM: src/lib/use-realtime-sync.ts subscribes to tables globally with no filters and upsert() blindly appends out-of-scope rows. With scoped datasets, global row-patching pollutes a route's scope.

GOAL: Make realtime scope-aware end-to-end, and (secondary) consolidate channels.

STEP 1 — PLAN (do not edit yet):
1. Read use-realtime-sync.ts fully. For units/rooms/windows/schedule on scoped routes, switch to the scoped debounced-refetch model the scheduler path already uses (scheduleScopedRefresh / scheduleDatasetRefresh) — refetch the CURRENT route's scope (or the current units-list page) instead of patching a global array. Keep cheap row-patching ONLY for the small spine lists (clients/buildings/installers/schedulers/cutters).
2. Add Supabase channel filters where possible (e.g. filter: unit_id=eq.<id>) on detail routes to cut event volume.
3. SECONDARY: the file opens a separate channel per table (`realtime-${table}`), ~10+ websocket channels per client. Investigate consolidating into fewer channels (Supabase allows multiple postgres_changes listeners on one channel) WITHOUT dropping any table's INSERT/UPDATE/DELETE handling or the role-based gating. If consolidation risks dropping events, keep separate channels and document why.
4. Present the plan + the per-scope event-handling matrix + the risk that a scoped route misses an out-of-scope-but-relevant event. WAIT for approval.

STEP 2 — APPLY (after approval):
- Implement scoped refetch + channel filters; consolidate channels only if safe.
- npm run build, typecheck, lint, test must pass.

VERIFY: Open two sessions; mutate a unit in one and confirm the other refetches its scope (detail, list page, dashboard counts) and that out-of-scope routes are NOT polluted. Confirm spine-list edits (rename a building) still propagate live everywhere.

CONSTRAINTS:
- Realtime correctness is the priority — a scoped route showing stale data after a remote mutation is the failure mode. Ship as its own PR off main.
```
