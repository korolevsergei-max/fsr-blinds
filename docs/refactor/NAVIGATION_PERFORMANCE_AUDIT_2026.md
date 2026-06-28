# Navigation Performance Audit & Phased Playbook — 2026

**Date:** 2026-06-27
**Stack:** Next.js 16.2.1 (App Router, Turbopack) · React 19 · Supabase SSR · Tailwind 4 · Vercel · 6 role portals (owner/management, scheduler, installer, cutter, assembler, QC)
**Status:** Verified against `main` @ d277329. Companion to [PERFORMANCE_PROMPTS_2026.md](PERFORMANCE_PROMPTS_2026.md), [DATA_SCOPING_PLAN.md](DATA_SCOPING_PLAN.md), [PERF_BASELINE.md](PERF_BASELINE.md).

> **How to use this doc.** This is the single handoff document for fixing app sluggishness. §1–§4 are the diagnosis. §5 is the phased plan: **each phase has a self-contained copy-paste prompt** you give to a fresh AI session, with the recommended model + thinking level, exact files, steps, rollback, and verification. Run phases in order; each is independently shippable and revertible. Implementers **must re-verify every file:line against current code before editing** — line numbers drift.

---

## 1. Executive diagnosis

A senior dev confirmed the app is "no way this slow" to navigate. Two distinct symptoms, which are **two different engineering problems** and must not be conflated:

- **Axis A — "slow to navigate, worse on weak connections."** Latency-bound. Driven by client weight × round-trips × render-blocking server awaits × **the absence of any cached app-shell**. This is what the senior dev felt.
- **Axis B — "much slower when lots of users are active."** Concurrency-bound. Driven by database / connection-pool / realtime pressure. The standout is a manufacturing-schedule reflow that recomputes the **entire facility** on every queue page view — under concurrent load this is the same O(N) pool-exhaustion shape that took prod down on 2026-06-23.

**Why the earlier audit was partly wrong.** The prior `.cursor` audit ranked "owner ships the whole DB to the browser" as the #1 cause (9/10). That was true historically but **is already fixed** (commit d277329): the owner global load now drops `windows`+`rooms` entirely, the client store has selector-based bailout, the units list is virtualized, and `withLiveUnitStatuses()` is read-only. **Owner nav is still slow for different reasons** — render-blocking awaits, no app-shell, and a heavy client bundle (drivers #6–#8 below), *not* raw DB payload. Future sessions should not redo the data-trim work.

**Measured facts** (from [PERF_BASELINE.md](PERF_BASELINE.md), 2026-06-01):
- Shared base JS loaded on **every** route: **555 kB raw / 168 kB gzip** (7 chunks).
- Total static JS reachable across the app: **5,163 kB raw / 1,498 kB gzip** across 108 chunks.
- With the service worker actively wiping caches (see #6), **none** of this is cached between visits — every cold visit re-downloads the 168 kB base + route chunks, and navigating across portals walks toward the full ~1.5 MB gzip with zero reuse.

---

## 2. Already fixed — do not redo

| Area | State | Evidence |
|---|---|---|
| Owner global load drops `windows`+`rooms` | Done (d277329); `[full-load]` log shows them →0 | [datasets.ts](../../src/lib/server-data/datasets.ts) `loadFullDataset` |
| `withLiveUnitStatuses()` read-only (no `after()` write-back) | Done; self-heal write removed | [enrichment.ts:172-273](../../src/lib/server-data/enrichment.ts#L172-L273) |
| Client store selector bailout (per-slice) | Done; `useDatasetSelector` + preserved slice identity | [dataset-context.tsx:72-87](../../src/lib/dataset-context.tsx#L72-L87) |
| Units list virtualization | Done (TanStack virtual) | [units-list.tsx:365-370](../../src/app/management/units/units-list.tsx#L365-L370) |
| React Compiler, dynamic PDF/canvas imports, dead-dep cleanup (`lucide-react`, `xlsx`→dev) | Done | [next.config.ts](../../next.config.ts), [PERF_BASELINE.md](PERF_BASELINE.md) |
| Bounded chunk concurrency (`selectInChunks`, cap 4) | Done (post-outage band-aid) | [supabase-chunking.ts:9-14](../../src/lib/supabase-chunking.ts#L9-L14) |

---

## 3. Scored root-cause ranking (/10)

Score = felt impact on the two symptoms × confidence it is responsible. **Re-verify file:line before acting.**

### Axis B — degrades as concurrent users rise

| # | Driver | Score | Evidence |
|---|--------|:---:|----------|
| 1 | **Manufacturing reflow storm + full-table scan on every queue read.** Each cutter/assembler/QC/management-schedule view: (a) a full unscoped paginated scan of `window_manufacturing_schedule` then in-memory role filter; (b) a **synchronous self-heal `reflowManufacturingSchedules()` inside the read path** if any window lacks a schedule row; (c) an `after()` `load_queue` reflow that recomputes + upserts the **entire facility** schedule. N users browsing ⇒ N full scans + N facility-wide reflow/upsert storms ⇒ pool exhaustion (the 2026-06-23 outage shape). | **9** | self-heal [manufacturing-scheduler.ts:640-642](../../src/lib/manufacturing-scheduler.ts#L640-L642); full scan [:651-664](../../src/lib/manufacturing-scheduler.ts#L651-L664); per-load reflow [cutter/page.tsx:21](../../src/app/cutter/page.tsx#L21) (+ assembler/qc/management-schedule) |
| 2 | **Auth paid 2–3× per navigation via `getUser()` network round-trips.** Middleware calls `getUser()` on an aggressive matcher (every non-static route); the layout's `getCurrentUser()` calls it again (`cache()` can't span the middleware→layout boundary). `getUser()` hits the Auth server over the network; `getClaims()` / local JWT verify removes a hop. Multiplies with users. | **7.5** | [supabase/middleware.ts:128](../../src/lib/supabase/middleware.ts#L128), matcher [:10](../../src/lib/supabase/middleware.ts#L10); [auth.ts:87,93](../../src/lib/auth.ts#L87) |
| 3 | **Reference data re-read every navigation; large per-request fan-outs.** All role routes are dynamic/uncached; `loadFullDataset` (8 parallel queries) + scheduler/installer loaders re-read slowly-changing clients/buildings/installers/schedulers on every nav. No `unstable_cache`/`revalidateTag`. | **6.5** | [datasets.ts:71-83](../../src/lib/server-data/datasets.ts#L71-L83), loaders [:177-212](../../src/lib/server-data/datasets.ts#L177-L212) |
| 4 | **Missing indexes on hot filter columns** ⇒ full scans under load: `window_production_status.status`, `schedule_entries.status`, `scheduler_unit_assignments.unit_id`, composite `(status/role, scheduled_*_date)` on `window_manufacturing_schedule`. Trivial migrations; compound the reflow cost. | **6** | [20260526130000](../../supabase/migrations/20260526130000_index_units_status_production.sql), [20260407000000](../../supabase/migrations/20260407000000_schema_best_practices.sql) |
| 5 | **Realtime fan-out scales O(N).** Each browser opens 1 channel × ~12 tables; the `windows` subscription has no unit filter; installers open **2 extra** notification channels. Every write fans out to all subscribers. | **6** | [use-realtime-sync.ts:160-294](../../src/lib/use-realtime-sync.ts#L160-L294), [bottom-nav.tsx:40,54](../../src/components/ui/bottom-nav.tsx#L40) |

### Axis A — latency-bound, worse on weak connections

| # | Driver | Score | Evidence |
|---|--------|:---:|----------|
| 6 | **No app-shell — the service worker deliberately self-destructs.** On activate the SW deletes all `fsr-*` caches and calls `self.registration.unregister()`; a client hook re-does it on every mount. The PWA manifest is fully defeated. Result: **every visit is a cold download** of the 168 kB gz base + route chunks, with zero shell caching. On weak/3G this dominates everything. | **9** | [public/sw.js:1-31](../../public/sw.js#L1-L31), [service-worker-registrar.tsx:6-22](../../src/components/service-worker-registrar.tsx#L6-L22), [manifest.json](../../public/manifest.json) |
| 7 | **Render-blocking server awaits before first useful paint.** Desktop management layout blocks on `loadFullDataset()` before any content; `/management/schedule` awaits 3 heavy role-schedule loads every visit; unit-detail awaits `loadUnitDetail` per unit. A mobile-only UA heuristic defers to an empty shell + client refetch (extra round-trip) — desktop and mobile are *both* bad, differently. | **8** | [management/layout.tsx:84-92](../../src/app/management/layout.tsx#L84-L92), [management/schedule/page.tsx:10-14](../../src/app/management/schedule/page.tsx#L10-L14), [units/[id]/layout.tsx](../../src/app/management/units/%5Bid%5D/layout.tsx) |
| 8 | **Large client payload + heavy client dashboards.** ~460 units + clients/buildings/schedule_entries (~50–70 kB gz, *confirm in Phase 0*) serialized into HTML each management mount; ~72% of components are client; all role dashboards are client components computing filters/counts in `useMemo` over the full array. | **7** | [datasets.ts](../../src/lib/server-data/datasets.ts), [management-dashboard.tsx](../../src/app/management/management-dashboard.tsx) |
| 9 | **Fetch-after-mount waterfalls + unoptimized images.** Unit-detail media/activity/milestones load via `useEffect` after hydration (visible 0.5–2 s spinners); photo modal uses `unoptimized` full-res Supabase images (2–5 MB). | **7** | [use-unit-supplemental.ts:120-186](../../src/lib/use-unit-supplemental.ts#L120-L186), [unit-stage-media-viewer.tsx:211-218](../../src/components/unit-stage-media-viewer.tsx#L211-L218) |
| 10 | **Bundle diet.** framer-motion imported synchronously in **42** hot-route files (~45–50 kB gz/route, not code-split); `date-fns` is **unused** (0 imports in `src/`, ~40 kB); confirm `xlsx` is dev-only. | **5** | [next.config.ts](../../next.config.ts), `grep -rl framer-motion src/` = 42, [package.json](../../package.json) |

---

## 4. Role-by-role findings

- **Owner / management.** Data-trim done (#2 of §2). Residual slowness = render-blocking `loadFullDataset` await (#7), full-units payload + client dashboard (#8), `/management/schedule` awaiting 3 role-schedule loads + reflow on every visit (#1), per-unit `loadUnitDetail` (#7). Mobile UA defer trades blocking paint for a client round-trip.
- **Scheduler.** Scoped loader is healthier, but still re-reads reference data per nav (#3), unfiltered `windows` realtime (#5), unit-detail media waterfalls + unoptimized images (#9).
- **Installer.** Scoped loader; **2 extra notification channels** per session (#5), offline-upload path must be preserved through any SW change (#6). Client `installer-home` dashboard (#8).
- **Cutter / assembler / QC.** The Axis-B hot zone: every queue view triggers full-table scan + self-heal reflow + `after()` facility reflow (#1). Missing status/date composite indexes (#4).
- **Shared (auth/realtime/bundle/SW).** Double `getUser()` per nav (#2); self-destruct SW kills the app-shell (#6); framer-motion + dead `date-fns` weigh every route (#10); all routes dynamic/uncached (#3).

---

## 5. Phased plan

**Sequencing rationale.** Phases 1–3 attack the two confirmed engines (reflow storm + no app-shell + blocking awaits) for the most felt snappiness at the least risk. Phases 4–6 keep it fast as data and users grow. Phases 7–8 are polish + durability. **Safe wins first:** Phase 1 touches only the read path + indexes — the scheduling-algorithm math is untouched until Phase 0 measurement proves more is needed.

**After every implementation phase:** `npm run lint && npm run typecheck && npm run build && npm run test`, then re-measure against the Phase 0 / [PERF_BASELINE.md](PERF_BASELINE.md) baseline and record residual risk. Keep each phase a single revertible commit on its own branch.

**Model legend:**
- **GPT‑5.5 · extra-high thinking** → broad architecture, SQL/RPC, measurement design.
- **Claude Opus 4.8 · high thinking** → subtle auth / scheduler / realtime / service-worker / data-contract correctness.
- **Claude Sonnet 4.6 · medium thinking** → mechanical refactors.

| Phase | Goal | Axis | Model |
|---|---|:---:|---|
| 0 | Measure & diagnose (no behavior change) | both | GPT‑5.5 / extra-high |
| 1 | Kill the many-users engine (reflow off read path + scope + indexes) | B | Opus 4.8 / high |
| 2 | App-shell service worker for weak networks | A | Opus 4.8 / high |
| 3 | Unblock first paint; cache reference data; cheaper auth | both | Opus 4.8 / high |
| 4 | Owner data scoping (pagination + aggregate RPC + RSC shell) | both | GPT‑5.5 / extra-high |
| 5 | Scoped detail loading & media optimization | A | Sonnet 4.6 / medium |
| 6 | Realtime scoping & channel consolidation | B | Opus 4.8 / high |
| 7 | Bundle diet | A | Sonnet 4.6 / medium |
| 8 | DB hardening & load/regression verification | B | GPT‑5.5 / extra-high |

---

### Phase 0 — Measure & diagnose

> **Model:** ChatGPT GPT‑5.5, extra-high thinking. **No code changes.**

```
You are doing a read-only performance measurement pass on the FSR Blinds app
(Next.js 16.2.1 / React 19 / Supabase SSR, deployed on Vercel, 6 role portals).
A prior baseline exists at docs/refactor/PERF_BASELINE.md (bundle sizes, 2026-06-01);
refresh and EXTEND it — do not start from scratch. Make NO behavior changes.

Capture and write results into docs/refactor/PERF_BASELINE.md (append a dated section):

1. Bundle: run `ANALYZE=true npm run build` (script: npm run analyze). Record shared
   base + per-route first-load JS. Compare to the 168 kB gz base / 1,498 kB gz total
   already recorded. Flag the heaviest route chunks.
2. Route timing: read the existing `[full-load]` / `[scoped-load]` / `[unit-status-drift]`
   server logs (src/lib/server-data/*). Capture units/rooms/windows counts + ms for
   owner vs scoped loads on a representative dataset.
3. Real-user: pull Vercel Speed Insights LCP / INP / TTFB per route (owner, scheduler,
   installer, cutter, assembler, qc). Note the worst routes.
4. Weak-network: Chrome DevTools, "Slow 4G" + 4× CPU throttle. For each role, record
   time-to-first-paint and time-to-interactive on cold load (no cache) and warm nav.
5. Supabase (read-only, CLI installed): slow-query log, API logs, pg_stat_statements
   top-20 by total_time, EXPLAIN (ANALYZE, BUFFERS) on: the manufacturing schedule
   read (src/lib/manufacturing-scheduler.ts loadPersistedRoleSchedule), loadFullDataset
   queries, and the notification queries. Capture connection-pool metrics and current
   realtime connection count.
6. Concurrency probe (optional, staging only): simulate 10–20 concurrent cutter/QC
   queue loads and watch pool utilization + p95 latency.

Deliver: an updated PERF_BASELINE.md with a table per axis (weak-connection vs
many-users), the worst offenders ranked, and the exact numbers each later phase must
beat. Do not edit any source file other than the baseline doc.
```

**Verification:** baseline doc updated with reproducible commands + numbers. **Rollback:** n/a (doc only).

---

### Phase 1 — Kill the many-users engine (SAFE)

> **Model:** Claude Opus 4.8, high thinking. Correctness-sensitive (manufacturing) but stays on the safe side: read-path + indexes only, **no scheduling-math changes**.

```
Fix the #1 concurrency bottleneck in FSR Blinds (Next.js 16 / Supabase). Do NOT change
the scheduling algorithm math inside reflowManufacturingSchedules — only its triggering
and the read path. Re-verify all line numbers before editing.

Problem (verify first):
- src/lib/manufacturing-scheduler.ts loadPersistedRoleSchedule() (~line 629):
  (a) lines ~640-642 run reflowManufacturingSchedules("self_heal_missing_schedule")
      SYNCHRONOUSLY inside the read path whenever any window lacks a schedule row;
  (b) lines ~651-664 paginate the ENTIRE window_manufacturing_schedule table, then
      filter by role/status in memory.
- Every queue page (src/app/cutter/page.tsx ~line 21, plus assembler/qc and
  src/app/management/schedule/page.tsx) ALSO fires an after() reflow ("load_queue")
  that recomputes + upserts the whole facility schedule on every view.
Under concurrent users this is N full scans + N facility-wide reflow/upsert storms.

Tasks:
1. Remove the synchronous self-heal reflow from loadPersistedRoleSchedule. Replace with
   a cheap correctness guarantee: have the MUTATIONS that create unscheduled windows
   (the ones that move a unit into the manufacturing zone) trigger the reflow, so reads
   never need to self-heal. If a runtime safety net is still wanted, make it a
   debounced/coalesced background trigger keyed on a "dirty" flag, never an inline await.
2. Make the per-page after() "load_queue" reflow mutation-triggered + coalesced rather
   than per-view: a queue VIEW must not recompute the facility. Reflow should fire only
   on events that change the plan (status change, settings/calendar change, new unit
   reaching the zone), debounced so concurrent mutations collapse into one run.
3. Scope the read query at the DB level: filter window_manufacturing_schedule by the
   role-relevant production status and a bounded date window (e.g. recent + near-future),
   instead of scanning all rows and filtering in memory. Preserve identical queue output
   for the rows a user actually sees.
4. Add a migration with the missing indexes:
   - window_production_status(status), and (unit_id, status)
   - schedule_entries(status)
   - scheduler_unit_assignments(unit_id)
   - composite (scheduled_cut_date), (scheduled_assembly_date), (scheduled_qc_date)
     paired with the filter columns the scoped read uses.
   Verify each with EXPLAIN (ANALYZE) before/after.

Constraints: queue contents and ordering must be byte-for-byte unchanged for the
visible window; preserve role authorization and RLS; one revertible commit. After:
lint, typecheck, build, test, and re-run the Phase 0 concurrency probe to show the
reflow storm is gone.
```

**Verification:** Phase 0 concurrency probe shows queue page loads no longer trigger facility reflows; p95 under concurrent load drops; `EXPLAIN` shows index usage; queue output unchanged. **Rollback:** revert the commit (read path returns to full scan; no schema loss — indexes are additive).

> **Implementation status — DONE (2026-06-27).** Tasks 1, 2, 4 shipped; Task 3 partially (see below). `npm run lint` (0 errors), `typecheck`, `build`, `test` (83/83) all green.
> - **Task 1 (self-heal off read path):** removed the inline `reflowManufacturingSchedules("self_heal_missing_schedule")` and the `hasUnscheduledManufacturingWindows()` probe from `loadPersistedRoleSchedule`. The correctness gap it covered (a window added to a unit *already* in the zone doesn't change unit status, so `recomputeUnitStatus` doesn't reflow) is now closed at the **mutation**: `addWindowWithOptionalPhoto` ([fsr-data/windows.ts](../../src/app/actions/fsr-data/windows.ts)) fires a coalesced `after()` reflow (`reason="window_added"`) only when the unit is already in the zone and its status didn't transition. Out-of-band writes (SQL seeds/backfills/direct DB edits) must now call `reflowManufacturingSchedules()` themselves.
> - **Task 2 (no view-triggered reflow):** removed `reflowManufacturingSchedules("load_queue")` from all 8 view pages (cutter/assembler/qc dashboard + queue, cutter/production, management/schedule) and from `loadManufacturingRoleSchedule` (completed-page loader). The 3 role *dashboards* keep their `after()` **only** for `computeAndUpdateManufacturingRisk()` (time-based risk flags — nothing else recomputes them; see residual risk). Reads are now pure; the persisted schedule stays correct because every plan-changing mutation (status/cut/assemble/qc/settings/calendar/manual-shift/issue/pushback/undo/window-add) already reflows, and `buildRoleScheduleOutput` clamps past dates to `currentWorkDate` at read time so the displayed queue self-corrects between reflows.
> - **Task 4 (indexes):** [20260627120000_index_manufacturing_hot_filters.sql](../../supabase/migrations/20260627120000_index_manufacturing_hot_filters.sql) adds `window_production_status(unit_id, status)` + `(status)` and `schedule_entries(status)`. The other requested indexes were **already present** and were deliberately not duplicated: `window_manufacturing_schedule` date columns + `(unit_id)` (20260410110000), `window_production_status(window_id)` and `scheduler_unit_assignments(unit_id)` (both via `UNIQUE`).
> - **Task 3 (DB-level read scoping) — only the output-preserving part done; lossy row-filter DEFERRED.** The role-date ordering indexes that make the existing ordered read index-assisted already exist (above). The requested *lossy* filter (drop rows by production status + bounded date window) was **not** applied because it would change visible output: `loadPersistedRoleSchedule` returns `allItems` (every schedule row, all statuses), which feeds the all-time **completed views** (`/cutter|assembler|qc/completed` via `loadManufacturingCompletedRoleData`) and the management-schedule **completed counts** ([schedule-view-model.ts](../../src/lib/schedule-view-model.ts) `qcApprovedAt`-in-interval). Because `window_manufacturing_schedule` rows are **never deleted** when a unit leaves the zone, a status/date filter would silently drop historical completed work — violating the "byte-for-byte unchanged" constraint. Doing this safely needs a data-model change first (delete/archive schedule rows when a unit fully installs, *or* give completed views their own bounded query) — fold into **Phase 4** (scoping) or **Phase 8** (DB hardening), not Phase 1.
>
> **Residual risk after Phase 1:**
> - `computeAndUpdateManufacturingRisk()` still runs per-view on the 3 role dashboards (a facility-wide per-unit scan+update). It is *only* triggered by those views — no mutation triggers it — and it is time-dependent (`daysUntil`), so it can't simply be dropped. Move it to mutation-triggered + a daily cron in a later phase (Phase 8 candidate).
> - The completed-view loader (`loadManufacturingCompletedRoleData`) and the `window_manufacturing_schedule` read are still unbounded (grow with all-time history). Addressed by the deferred Task 3 data-model change above.

---

### Phase 2 — App-shell service worker for weak networks

> **Model:** Claude Opus 4.8, high thinking. SW caching is a footgun — must never serve stale data in a realtime app.

```
FSR Blinds (Next.js 16, realtime Supabase app) currently has NO app-shell: the service
worker deliberately self-destructs. Replace it with a correct caching strategy so weak
connections stop cold-downloading the full JS on every visit. Re-verify lines first.

Current behavior (verify):
- public/sw.js (lines ~1-31): on activate, deletes all "fsr-*" caches and calls
  self.registration.unregister(), then navigates clients.
- src/components/service-worker-registrar.tsx (lines ~6-22): on every mount, unregisters
  all SWs and clears fsr-* caches.
- public/manifest.json exists but is defeated.
Measured: 168 kB gz shared base + route chunks re-downloaded every cold visit
(see docs/refactor/PERF_BASELINE.md).

Tasks:
1. Rewrite public/sw.js as a real shell cache:
   - Precache/runtime-cache the immutable hashed static assets (/_next/static/**) with a
     cache-first strategy (they are content-hashed, so safe forever).
   - NETWORK-FIRST and effectively never-cache for: RSC payloads, route documents,
     Server Actions, any Supabase/API/auth request. This app is realtime — stale data is
     a correctness bug. When in doubt, do not cache it.
   - Version the cache name; on activate, delete only OLD-version caches (not all).
   - Keep a kill-switch: a versioned constant that, when bumped, cleanly evicts and
     re-registers, so a bad SW can be remotely disabled by shipping a new build.
2. Update service-worker-registrar.tsx to REGISTER the new SW (with update-on-reload),
   instead of unregistering. Ensure the OLD self-destruct SW is cleanly replaced for
   existing users (the version bump must evict the previous caches).
3. Do NOT break installer offline-upload behavior — verify the upload queue still works
   with the SW active. If the upload path relies on no-SW assumptions, scope the SW to
   leave those requests untouched (network-only).

Constraints: never cache authenticated data or RSC; must self-heal if a deploy ships a
new asset manifest; one revertible commit. After: lint/typecheck/build/test, then
DevTools Application > Service Workers — confirm second visit serves static assets from
cache (check Network "from ServiceWorker") while data requests still hit the network.
Re-measure cold vs warm load on Slow 4G against Phase 0.
```

**Verification:** second visit serves `/_next/static/**` from SW cache (warm load far faster on Slow 4G); data/auth always network; installer uploads still work. **Rollback:** revert; ship a version bump that re-enables the old unregister behavior if a bad SW escapes.

> **Implementation status — DONE (2026-06-27).** `npm run lint` (0 errors), `typecheck`, `build`, `test` (83/83) all green.
> - **Task 1 (real shell cache):** rewrote [public/sw.js](../../public/sw.js). It now caches **only** same-origin `GET` requests under `/_next/static/**` (content-hashed, immutable) with a **cache-first** strategy in a versioned `fsr-shell-v1` cache. Everything else falls through to the network by *not* calling `respondWith`: non-GET requests (Server Actions/mutations are POST), cross-origin requests (Supabase/auth/API/images), and same-origin route documents + RSC payloads. This is the conservative correct default — anything that could carry authenticated or mutable data is network-only with zero caching. `activate` deletes every `fsr-*` cache except the current shell (evicts the old self-destruct SW's caches *and* any prior shell version) and claims clients. **Self-heal:** a new deploy ships new hashed filenames → cache miss → fresh fetch, so a stale manifest can't pin old assets. **Kill-switch:** `SW_VERSION` (bump → evict all older caches) plus a `KILL_SWITCH` constant that, when set true and deployed, clears all `fsr-*` caches + `unregister()`s (reverts to the old no-shell behavior for every client on the new build).
> - **Task 2 (register instead of unregister):** rewrote [service-worker-registrar.tsx](../../src/components/service-worker-registrar.tsx) to `register("/sw.js", { updateViaCache: "none" })` and call `registration.update()` on mount (update-on-reload), so a version bump / kill-switch activates on the next load. `skipWaiting()` + `clients.claim()` cleanly replace the previous self-destruct SW for existing users. Registration failure is swallowed (non-fatal — app works without the shell, just no warm-load speedup).
> - **Task 3 (don't break installer offline upload):** verified the offline-upload path ([upload-queue.ts](../../src/lib/upload-queue.ts), [offline-cache.ts](../../src/lib/offline-cache.ts)) is **independent of the SW** — it uses IndexedDB + the in-memory action registry, and the actual Server Action requests are `POST`, which the SW never intercepts (GET-only). No scoping changes were needed; uploads are untouched.
>
> **Manual verification still required (not runnable in CI):** DevTools › Application › Service Workers — confirm a second visit serves `/_next/static/**` with "(from ServiceWorker)" in the Network panel while RSC/document/Supabase requests still hit the network; re-measure cold vs warm load on Slow 4G against Phase 0; confirm an installer photo queued offline still uploads on reconnect with the SW active.
>
> **Residual risk after Phase 2:**
> - Only `/_next/static/**` is cached, so the **first** cold visit (and the route document/RSC on every navigation) still hits the network — Phase 2 speeds up *repeat* loads, not the very first paint (that's Phases 3–4). No offline app-shell for navigations is provided by design (realtime correctness > offline reads).
> - If a future SW change ever broke clients, recovery depends on the `KILL_SWITCH`/`SW_VERSION` build reaching the user; `updateViaCache: "none"` keeps `sw.js` itself uncached so that path stays fast, but a client that never reloads won't update until it does.

---

### Phase 3 — Unblock first paint; cache reference data; cheaper auth

> **Model:** Claude Opus 4.8, high thinking. Touches auth + data contracts — preserve the `app_metadata.role` trust model and RLS.

```
Reduce per-navigation latency in FSR Blinds (Next.js 16 / Supabase SSR) on three fronts.
Re-verify lines; keep role authorization, RLS, and the app_metadata.role trust model
intact (see prior security review: authorize ONLY from service-role app_metadata, never
user-writable user_metadata).

A. Unblock first paint.
- src/app/management/layout.tsx (~lines 84-92) blocks on loadFullDataset() before any
  content paints on desktop, while deferring to an empty shell + client refetch on mobile
  (UA heuristic). Unify this: stream the heavy dataset behind Suspense so the chrome/nav
  paints immediately on ALL devices, then hydrate data. Apply the same pattern to the
  other role layouts. Keep the scoped loaders correct.
- src/app/management/schedule/page.tsx (~lines 10-14) awaits 3 role-schedule loads on
  every visit — wrap the heavy sections in Suspense and stream them so the page frame
  paints first.

B. Cache reference data across requests.
- Clients/buildings/installers/schedulers change rarely but are re-read on every nav
  (loadFullDataset 8-query fan-out, src/lib/server-data/datasets.ts ~71-83). Wrap these
  slowly-changing lists in unstable_cache with a tag, and call revalidateTag on the
  mutations that change them. Leave per-user/volatile data (units status, schedules)
  uncached.

C. Cheaper auth.
- Middleware (src/lib/supabase/middleware.ts ~line 128) and getCurrentUser
  (src/lib/auth.ts ~line 87,93) each call getUser() — a network round-trip to the Auth
  server — on every navigation. Switch to local JWT verification (getClaims / verify the
  signed JWT locally) where the role/identity is all that's needed, keeping a getUser()
  fallback only when claims are absent. Dedupe so a single nav pays one verification, not
  2-3. Confirm the middleware matcher isn't running on static assets.

Constraints: no auth regressions (test login, role gating, role-change session kill);
reference-data cache must invalidate on mutation; one commit per sub-part (A, B, C are
independently revertible). After each: lint/typecheck/build/test + re-measure TTFB/LCP
on Slow 4G against Phase 0.
```

**Verification:** chrome paints before data on desktop (Slow 4G); reference-data queries no longer appear on repeat navs (DB logs); auth round-trips per nav drop from 2–3 to 1; all role-gating tests pass. **Rollback:** revert per sub-part (A/B/C are separate commits).

> **Implementation status — A + C DONE, B DEFERRED (2026-06-27).** `npm run lint` (0 errors), `typecheck`, `build`, `test` (83/83) all green.
>
> - **Part A (unblock first paint) — DONE.** The role layouts already streamed their dataset behind `<Suspense>` (installer/scheduler done earlier); this finished the pattern:
>   - [management/layout.tsx](../../src/app/management/layout.tsx): removed the `shouldDeferInitialDatasetForUserAgent` UA heuristic that rendered an **empty shell + client refetch** on mobile (an extra round-trip). `loadFullDataset()` now always runs inside the Suspense-wrapped `ManagementDataShell` on **all** devices — the nav/chrome paints immediately from the `ManagementLoading` fallback, then data streams in. `eagerRefreshOnMount` is now set only on a load *failure* (client-side fallback), matching the scheduler layout.
>   - [management/schedule/page.tsx](../../src/app/management/schedule/page.tsx): no longer `await`s the three role-schedule reads before rendering. It kicks them off as one **unawaited promise** passed to the (client) `ScheduleScreen`; the page frame and the default **installer** tab (which reads the already-loaded dataset from context) paint instantly. The **manufacturing** tab unwraps the promise via `use()` inside [manufacturing-schedule-panel.tsx](../../src/app/management/schedule/manufacturing-schedule-panel.tsx), wrapped in a `<Suspense>` boundary in [schedule-screen.tsx](../../src/app/management/schedule/schedule-screen.tsx) — so the manufacturing reads only block when the user actually opens that tab, never first paint. cutter/assembler/qc layouts were untouched (they have no dataset shell; their pages load their own schedule data).
> - **Part C (cheaper auth) — DONE.** Both per-navigation `getUser()` calls switched to `getClaims()`, which verifies the signed JWT **locally** for asymmetric signing keys (no Auth-server round-trip) and only falls back to a network `getUser()` for legacy symmetric (HS256) tokens — so auth cost drops from a guaranteed round-trip to (usually) a local verify, while `getClaims()`→`getSession()` still performs token refresh so the middleware cookie-refresh path is preserved.
>   - [supabase/middleware.ts](../../src/lib/supabase/middleware.ts): `getUser()`→`getClaims()`; role resolved from `claims.app_metadata.role` (trusted, service-role-only), id from `claims.sub`. The invalid-refresh-token purge path and the legacy `user_profiles` fallback are unchanged. Matcher already excludes `/_next/static`, `/_next/image`, favicon, and image extensions — confirmed not running on hashed static assets.
>   - [auth.ts](../../src/lib/auth.ts) `getCurrentUser` (still `cache()`-deduped per request): `getUser()`→`getClaims()`, deriving id/email/role/display-name from the claims; the `app_metadata.role` self-heal backfill and all profile-missing branches preserved. The `app_metadata.role` trust model and RLS are intact (still **never** reads user-writable `user_metadata` for authz).
> - **Part B (cache reference data) — DEFERRED to Phase 4.** Implemented, then reverted after analysis showed poor ROI vs. risk:
>   1. **Premise is stale.** The doc targeted `loadFullDataset`'s 8-query reference fan-out — but that is already a **single `get_full_dataset` RPC** (the d277329-era work), so there is no per-nav reference fan-out to cache on the hot owner path. The only genuine per-nav reference re-read left is `loadUnitDetail`'s installers+schedulers lists (small tables) — a modest win.
>   2. **No existing caching seam + Next 16.2 API churn.** The codebase uses **no** tag-based caching anywhere (only `React.cache()` + `revalidatePath`), and `cacheComponents` is not enabled. Next **16.2.1** changed `revalidateTag` to a required two-arg `(tag, profile)` signature and pushes a new `"use cache"`/`updateTag` model — so the invalidation contract is unsettled. Caching `loadUnitDetail`'s reads also requires an admin/RLS-bypass client *inside* `unstable_cache` (it runs outside request scope) plus `revalidateTag` wiring across the account create/delete mutations; a single missed/incorrect invalidation yields a **stale assign pick-list** (a newly created installer/scheduler invisible) — a correctness bug.
>   3. **Recommendation:** fold reference-data caching into **Phase 4**, which already introduces a `get_owner_dataset` RPC + reference scoping and reworks these data contracts holistically (and is scoped to the heavier model) — choosing the Next 16.2 caching model deliberately there rather than bolting a one-off `unstable_cache` onto the unit-detail path now.
>
> **Manual verification still required (not runnable in CI):** on Slow 4G, confirm the management nav/chrome paints before the dataset on **mobile** (previously an empty-shell + refetch) and that the schedule page's installer tab is interactive before the manufacturing reads finish; confirm login, role gating, and role-change session-kill still work end-to-end (auth path changed); check DB/Auth logs show one local verify per nav instead of 2–3 `getUser()` round-trips.
>
> **Residual risk after Phase 3:**
> - `getClaims()` only beats `getUser()` on the network when the Supabase project uses **asymmetric** JWT signing keys; on a legacy HS256 secret it falls back to a `getUser()` call (no regression, but no win either) — verify the project's signing-key type in Phase 0/8 to confirm the round-trip actually dropped.
> - Reference data (clients/buildings/installers/schedulers) is still re-read per navigation (Part B deferred) — addressed in Phase 4.

---

### Phase 4 — Owner data scoping (pagination + aggregate RPC + RSC shell)

> **Model:** ChatGPT GPT‑5.5 extra-high for the RPC/SQL + scoping design; Claude Opus 4.8 high for the React wiring.

```
Stop the FSR Blinds owner portal from shipping all units and computing dashboard
aggregates on the client. Re-verify lines first.

Problem:
- loadFullDataset still ships the full units array (~460+) into HTML each management
  mount; the dashboard (src/app/management/management-dashboard.tsx) computes stage/issue
  counts via useMemo over that full array on the client.
- The get_full_dataset RPC still BUILDS rooms+windows server-side even though JS discards
  them for the owner path (see DATA_SCOPING_PLAN.md).

Tasks:
1. Add a get_owner_dataset RPC (SQL migration) that omits rooms+windows entirely
   server-side (don't build what JS throws away). Route the owner path to it; keep
   get_full_dataset for the scoped loaders that need windows/rooms.
2. Server-side pagination for the units list: page/filter on the server (keep the
   existing virtualization for the rendered page), so the initial payload is a page, not
   the whole table.
3. Aggregate RPC for dashboard counts: compute stage/issue/risk buckets in SQL and return
   the totals, replacing the client useMemo over all units. Render the dashboard shell as
   an RSC where possible so counts arrive in HTML.

Constraints: identical numbers/labels in the dashboard; preserve filters/sorting; RLS
intact; revertible commits (RPC, pagination, dashboard are separable). After:
lint/typecheck/build/test; re-measure owner payload size + LCP vs Phase 0; confirm the
[full-load] log shows a smaller units payload.
```

**Verification:** owner initial payload shrinks (smaller `[full-load]`); dashboard counts come from SQL and match the old client numbers; LCP improves. **Rollback:** revert; the old `get_full_dataset` path still exists.

> **Implementation status — PARTIAL (2026-06-27).** `npm run lint` (0 errors, pre-existing warnings), `typecheck`, `build`, and `test` (83/83) all green.
> - **Task 1 (owner RPC omits rooms/windows) — DONE.** Added [20260627163000_owner_dataset_scoping.sql](../../supabase/migrations/20260627163000_owner_dataset_scoping.sql) with `get_owner_dataset()`, which returns the existing owner-shaped dataset but never builds raw `rooms` or `windows` server-side. [datasets.ts](../../src/lib/server-data/datasets.ts) now prefers `get_owner_dataset()` and falls back to `get_full_dataset()` if the migration is not present, preserving rollback. The owner log changes to `[owner-load] ... rooms=0 windows=0`.
> - **Task 3 (aggregate dashboard counts) — DONE for the initial unfiltered dashboard.** Added `get_owner_dashboard_counts(date)` and [owner.ts](../../src/lib/server-data/owner.ts) so the first dashboard render receives SQL-computed stage/issue buckets. [management/page.tsx](../../src/app/management/page.tsx) is now an RSC entry that passes those counts into the client dashboard; once the user applies filters or drill-down selections, the existing client-side cross-filter behavior is preserved.
> - **Task 2 (true units-list pagination) — DEFERRED.** The parent management layout still provides full `units` because several owner pages (`/management/schedule`, reports, installers, building/client detail pages) still read units from the parent provider. Removing full units before those routes get scoped loaders would break visible behavior. The next safe step is to convert those remaining unit-consuming routes to route-local loaders, then switch the layout spine to reference data only and paginate `/management/units` from `searchParams`.
>
> **Residual risk after this partial Phase 4:** the owner initial payload is smaller on the SQL-build side (no rooms/windows built in the owner RPC) and dashboard initial counts avoid the browser aggregate pass, but the owner shell still serializes the full units array until Task 2 and the remaining route scoping work land.

---

### Phase 5 — Scoped detail loading & media optimization

> **Model:** Claude Sonnet 4.6, medium thinking. Mechanical.

```
Remove fetch-after-mount waterfalls and unoptimized images on FSR Blinds unit-detail
pages (Next.js 16). Re-verify lines first.

Tasks:
1. src/lib/use-unit-supplemental.ts (~lines 120-186) loads media/activity/milestones via
   useEffect after hydration (visible spinners). Move this data into the server-loaded
   scoped provider (loadUnitDetail) so it arrives with the page, eliminating the
   secondary round-trip. Keep the client cache as a refresh layer only.
2. src/components/unit-stage-media-viewer.tsx (~lines 211-218): the photo modal uses
   `unoptimized` full-res Supabase images. Remove `unoptimized` (Supabase URLs are
   already remote-pattern-allowed in next.config), add responsive `sizes`, and lazy-load
   gallery thumbnails.
3. Wrap raw avatar <img> tags (assign-unit / assign-unit-scheduler) in next/image.

Constraints: no visual regressions; images must still render for blob: preview URLs
(keep unoptimized only for blob:); one commit. After: lint/typecheck/build/test; on
Slow 4G confirm the unit-detail spinner is gone and modal images load progressively.
```

**Verification:** no post-mount spinner on unit detail; modal images optimized; Slow 4G unit-detail TTI improves. **Rollback:** revert single commit.

---

### Phase 6 — Realtime scoping & channel consolidation

> **Model:** Claude Opus 4.8, high thinking. Missed events = stale UI; correctness-sensitive.

```
Reduce realtime fan-out in FSR Blinds (Supabase realtime). Re-verify lines first.

Tasks:
1. src/lib/use-realtime-sync.ts (~160-294): the `windows` subscription has no unit/scope
   filter, so every window change patches every user's store. Scope it to the loader's
   relevant set where the role doesn't need global windows (installer/scheduler/cutter).
   Keep owner global if it genuinely needs all.
2. src/components/ui/bottom-nav.tsx (~40,54): installers open 2 EXTRA notification
   channels on top of the sync channel. Fold notifications into the main sync channel (or
   a single notification channel) to cut per-user connection count.
3. Prefer route-scoped invalidation/refetch over broad store patches where a patch
   currently re-renders many consumers.

Constraints: no missed updates — every change a user must see still arrives; verify with
two browsers (mutate in A, observe in B) per role; one commit. After:
lint/typecheck/build/test + the two-browser realtime check; confirm realtime connection
count per user drops.
```

**Verification:** two-browser test shows updates still propagate per role; per-user channel count drops; fewer broad re-renders (React Profiler). **Rollback:** revert single commit.

> **Implementation status — DONE (2026-06-28).** `npm run lint` (0 errors, pre-existing warnings only), `typecheck`, `build`, `test` (85/85) all green.
> - **Task 1 (scope `windows`) + Task 3 (scoped patches over broad ones) — DONE.** [use-realtime-sync.ts](../../src/lib/use-realtime-sync.ts): the main sync was already a **single** channel (`realtime-${loaderKind}`) with per-table `postgres_changes` listeners — no per-table WebSocket to consolidate there. The fix was the unfiltered fan-out:
>   - **Owner (`full`) no longer subscribes to `rooms` or `windows` at all** (new `shouldTrackUnitChildren = loaderKind !== "full"` gate). The owner global load drops rooms+windows (d277329) and renders them only in the separately-wired `ScopedUnitDatasetShell`, so the global owner channel never needed them — previously *every* facility room/window change fanned out to *every* owner browser and got `upsert()`ed into an array nothing reads. Dropping the listeners cuts that server→client fan-out (postgres_changes are server-filtered per listener) **and** the wasted store growth/re-renders. Pure win.
>   - **Scheduler/installer still subscribe** (they render their scoped rooms+windows) **but apply patches only for in-scope rows.** `windows` carries only `room_id` (no `unit_id`), so a dynamic-set server filter isn't possible; instead the handler ignores any window not already loaded and not belonging to a loaded room (`prev.windows.some(id) || prev.rooms.some(room_id)`), and `rooms` ignores any room whose `unit_id` isn't a loaded unit. Out-of-scope events now return the **same store reference** → the selector store bails out (no re-render, no scope pollution). In-scope updates — incl. a new window on a unit the user already has — still arrive; DELETEs are always applied (idempotent).
> - **Task 2 (consolidate installer nav channels) — DONE.** [bottom-nav.tsx](../../src/components/ui/bottom-nav.tsx): the installer BottomNav opened **two** extra channels (`installer-nav-notifications-*`, `installer-nav-reads-*`) on top of the main `realtime-installer` sync channel. Folded into **one** `installer-nav-${recipientId}` channel with two `postgres_changes` listeners (notifications INSERT + notification_reads INSERT) → one WebSocket subscription instead of two. Same unread-badge behavior (role/recipient guards unchanged).
>
> **Manual verification still required (not runnable in CI):** two-browser check per role (mutate a window/room in A, confirm B's in-scope view still updates and an out-of-scope change does *not* re-render B); confirm an installer's unread badge still increments on a new notification and decrements on a read with the single consolidated channel; confirm per-user realtime connection count dropped (Supabase realtime inspector — owner sheds the rooms/windows listeners, installer sheds one nav channel).
>
> **Residual risk after Phase 6:**
> - Scheduler/installer `windows`/`rooms` events are still **delivered** to the client (only the client-side *apply* is scoped) because the tables lack a single filterable scope column — the win is store/render correctness + fewer re-renders, not reduced WebSocket traffic for those two roles. True server-side scoping would need a `unit_id` denormalized onto `windows` (or per-unit channels), deferred as a Phase 8 data-model candidate.
> - A genuinely new room+window arriving via realtime relies on the room event landing before/with the window event; if the window arrives first it's dropped until the next route refetch/visibility refresh reconciles (mutations already revalidate their own route, so the common single-window-add path is covered).

---

### Phase 7 — Bundle diet

> **Model:** Claude Sonnet 4.6, medium thinking. Mechanical.

```
Trim the FSR Blinds client bundle (Next.js 16). Re-verify first.

Tasks:
1. framer-motion is imported synchronously in ~42 hot-route files (~45-50 kB gz/route).
   For simple fade/slide on dashboards/lists, replace with CSS transitions or the View
   Transitions API; for genuinely complex animations, dynamic-import the motion component
   so it's not in the route's first-load JS.
2. Remove `date-fns` (confirmed 0 imports in src/). Confirm `xlsx` is dev-only and not in
   the client bundle.
3. Re-run `ANALYZE=true npm run build`; record the new shared base + per-route first-load
   JS in docs/refactor/PERF_BASELINE.md.

Constraints: no animation/visual regressions on the routes you change; one commit per
concern. After: lint/typecheck/build/test; show the first-load JS reduction vs Phase 0.
```

**Verification:** first-load JS per hot route drops in the analyzer; no visual regressions. **Rollback:** revert per concern.

---

### Phase 8 — DB hardening & load/regression verification

> **Model:** ChatGPT GPT‑5.5 extra-high for DB/plan analysis; manual QA for the walkthrough.

```
Finalize and prove the FSR Blinds performance work under load.

Tasks:
1. From the Phase 0 + Phase 1 EXPLAIN output, verify/extend composite indexes for the
   hot filters; drop any redundant ones. Re-check pg_stat_statements top-20 — confirm the
   previously-hot queries fell off.
2. Consider materialized summaries for owner dashboard aggregates if the Phase 4 RPC is
   still heavy at scale.
3. Confirm the serverless DB connection path uses the transaction/Supavisor pooler (not
   a direct 5432 connection) given Vercel's per-invocation model; document it.
4. Regression: role-by-role manual walkthrough on Slow 4G (owner, scheduler, installer,
   cutter, assembler, qc) + a concurrent-user simulation (10-20 users hitting queues).
   Compare every metric to the Phase 0 baseline.

Deliver: an updated PERF_BASELINE.md "after" section proving the wins, and a short
residual-risk note. No further feature changes.
```

**Verification:** all Phase 0 metrics improved and documented; concurrent-user simulation shows no pool exhaustion. **Rollback:** indexes are additive; revert any materialized-view migration independently.

---

## 6. Constraints & non-goals

- Keep each phase **independently shippable and revertible** (own branch, own commit).
- **Do not** combine scheduler/manufacturing correctness changes with unrelated UI cleanup.
- Preserve role authorization, RLS, the `app_metadata.role` trust model, and installer **offline-upload** behavior through every phase.
- **No scheduling-algorithm (`reflowManufacturingSchedules` math) changes** before Phase 1 ships and is measured. Safe wins first.
- All estimates in this doc (payload KB, latency) are flagged as estimates and **must be confirmed in Phase 0** before any phase claims a win.
- After every implementation phase: lint, typecheck, build, test, re-measure, document residual risk.
```
