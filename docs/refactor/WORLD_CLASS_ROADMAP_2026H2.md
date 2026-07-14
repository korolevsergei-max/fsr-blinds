# World-Class Performance Roadmap — 2026 H2

**Date:** 2026-07-13
**Stack:** Next.js 16.2.1 (App Router, Turbopack, React Compiler) · React 19 · Supabase (Postgres + SSR auth + realtime) · Tailwind 4 · Vercel Hobby (`iad1`, main auto-deploys) · Supabase `us-west-2`
**Status:** Verified against `main` @ 42ab41a. Successor to [NAVIGATION_PERFORMANCE_AUDIT_2026.md](NAVIGATION_PERFORMANCE_AUDIT_2026.md) (all 12 phases p0–p11 shipped). All file:line references re-verified against current code on this date; all measurements taken fresh this session.

> **How to use this doc.** §1 is the diagnosis and the definition of "world-class" for this app. §2 is the scored findings table — every row has a file:line citation or a fresh measurement. §3 is the options analysis: for the three themes that matter most, the full option space (do nothing / targeted / restructure) written for the app owner to make decisions with. §4 is the phased plan — each phase has a self-contained copy-paste prompt for a fresh session, independently shippable and revertible, safe/high-ROI first. §5 is the rejected list so future sessions don't re-litigate. Implementers **must re-verify every file:line before editing** — line numbers drift.

---

## 1. Executive diagnosis

### Where the app is today

The June 2026 cycle fixed the two axes it targeted: the owner/scheduler/installer portals now load their entire dataset in **one DB round-trip** (RPCs, −73% owner fetch), the reflow storm is off the read path, an app-shell service worker caches the 168 kB gz base, and realtime is consolidated and store-bailout-safe. The app moved from "confirmed too slow" to **"solid mid-tier"**: bundle flat vs. the Phase 8 baseline (168.2 kB gz base, 1,452 kB gz total, measured today), 85/85 tests green, no query regression in the DB stats.

What separates it from world-class is no longer any single bug. It is **four structural gaps** the June cycle didn't reach:

1. **The manufacturing portals never got the single-round-trip treatment.** `loadPersistedRoleSchedule` still pages the entire all-time `window_manufacturing_schedule` table and then fans out ~90 chunked queries. A faithful replica of that exact sequence measured **5.17 s** against prod today (1,800 rows; scan 1.2 s + fan-out 3.7 s + rooms 0.2 s). This runs on **every** cutter/assembler/QC dashboard view, every queue view, and — via `router.refresh()` — **after every mark-cut/assembled/QC click and every search keystroke**. The factory roles are the highest-frequency users of the app, and they get its slowest path.
2. **Compute is 4,000 km from the data.** Vercel functions run in `iad1` (US East — confirmed via `x-vercel-id`); Supabase is in `us-west-2` (Oregon). Every DB round-trip costs ~60–75 ms before Postgres does any work. The RPC work reduced round-trips exactly because of this — but every remaining multi-round-trip path (the 5 s queue read, the per-request `user_profiles` read, unit-detail's two waves) pays the tax repeatedly. Moving the function region is a **config-only** change.
3. **There is no "instant" layer.** Zero `useOptimistic` in the codebase; mutations show "Saving…"/"Moving…" spinners that wait for a full server round-trip (and in `moveUnitToProduction`'s case, a synchronous re-render of the whole 5 s queue route *inside the action response*). Filter/search changes trigger full RSC refetches. `viewTransition: true` is enabled in next.config but used nowhere. The gap between this app and instant-feeling software is mostly *perceived* latency that optimistic UI + coalesced refresh would remove without touching data correctness.
4. **The app is flying blind in production.** `removeConsole` strips every `[owner-load]`/`[scoped-load]` timing log from prod builds (this is why Phase 0 found zero log entries in 168 h — the instrumentation literally doesn't exist in prod). Speed Insights collects RUM but nothing reads it. `pg_stat_statements` was recently reset. There are no perf budgets in CI. Every past phase measured with throwaway scripts; nothing watches for regression.

### What "world-class" concretely means for THIS app

A field-ops PWA used on phones in buildings and a factory floor. Targets (p75 unless noted):

| Metric | Today (measured/estimated) | World-class target |
|---|---|---|
| Queue action tap → visible feedback (cutter mark-cut, move-to-production) | 300 ms – 5 s (spinner until server truth) | **< 100 ms** (optimistic), truth reconciled < 1.5 s |
| Manufacturing dashboard/queue server render | ~2–5 s (O(all-time history), ~90 queries) | **< 400 ms**, O(active work), 1 round-trip |
| Warm in-portal navigation (tap → content) | ~0.5–2 s | **< 300 ms** scoped portals, < 500 ms owner |
| Cold LCP on 4G (post-deploy revisit, SW shell cold) | not yet measured (QA gap) | **< 2.5 s** warm shell, < 4 s cold shell |
| Realtime propagation (mutate in A → visible in B) | ~1–2 s (works) | keep; never regress for perf wins |
| Concurrency headroom | unknown (never probed) | **3× users with < 20% p95 degradation** |

### The five themes that matter (ranked)

1. **Fix the manufacturing read path** — single-RPC + archive/bound the data model (§3 Theme A).
2. **Move compute next to the data** — function region + kill the remaining per-request round-trips (§3 Theme B).
3. **Build the instant layer** — optimistic mutations, coalesced refresh, no refetch-on-filter (§3 Theme C).
4. **Give realtime a scalable shape** — denormalized scope column, server-side filters (§2 axis 4, phased).
5. **Stop flying blind** — prod timing that survives the build, a RUM ritual, CI budgets (§2 axis 7, Phase 0).

---

## 2. Findings table

Score = felt impact × confidence (/10). Every finding re-verified today; measurements from this session unless cited to PERF_BASELINE.

### Axis 1 — Perceived performance (the "instant feel" layer)

| # | Finding | Score | Evidence |
|---|---|:---:|---|
| 1.1 | **Every queue action pays the full 5 s read path before the user sees server truth.** `moveUnitToProduction` calls `revalidatePath("/cutter/queue","layout")` *synchronously in the action* — the action response re-renders the queue route, i.e. re-runs the 5 s `loadPersistedRoleSchedule` while the button shows "Moving…". Mark-cut is optimistic locally but `handleStatusChange` fires `router.refresh()` **per click** — marking 20 windows = 20 full route refetches, uncoalesced. | **9** | [cutter-production-actions.ts:34-35](../../src/app/actions/cutter-production-actions.ts#L34-L35); [cutter-production.tsx:422-429](../../src/components/manufacturing/cutter-production.tsx#L422-L429); queue replica measurement: **5,170 ms** (below, 3.1) |
| 1.2 | **No standardized optimistic pattern.** Zero `useOptimistic` in `src/`. `manufacturing-role-queue`'s `runWindowAction` supports an *optional* `optimisticUpdate` (used for some actions, not others; pushbacks use `refreshOnSuccess: true` = full refetch). Owner/scheduler/installer mutations mostly await the action then rely on realtime/refresh. | **7** | `grep -rln useOptimistic src/` = 0; [manufacturing-role-queue.tsx:197-226](../../src/components/manufacturing/manufacturing-role-queue.tsx#L197-L226) |
| 1.3 | **Search/filter keystrokes trigger full RSC refetches.** Both queue screens schedule `router.refresh()` 400 ms after any search/filter change — a full server re-render (the 5 s path) for a purely client-side filter over already-loaded items. | **6.5** | [cutter-queue.tsx:126-140](../../src/components/manufacturing/cutter-queue.tsx#L126-L140); [manufacturing-role-queue.tsx:165-172](../../src/components/manufacturing/manufacturing-role-queue.tsx#L165-L172) |
| 1.4 | **Foreground/reconnect refetches re-ship the whole dataset.** Tab focus, realtime re-subscribe, and any `window_post_install_issues` change all trigger `refreshDataset()` → the full **509 KB** owner payload re-fetched and re-seeded. Correct (missed-events backfill) but unscoped and un-throttled across N owner tabs. | **6** | [use-realtime-sync.ts:268-274](../../src/lib/use-realtime-sync.ts#L268-L274), [:317-325](../../src/lib/use-realtime-sync.ts#L317-L325); owner RPC payload measured **509 KB** |
| 1.5 | `viewTransition: true` is enabled but the View Transitions API is used nowhere — dead config; no route-level transition polish anywhere. | **3** | [next.config.ts:18](../../next.config.ts#L18); `grep -rn ViewTransition src/` = 0 |
| 1.6 | Link prefetching is at App Router defaults (viewport prefetch of the loading boundary) — adequate; nav skeletons exist for all six portals (`loading.tsx` per portal). Not a gap; recorded so nobody "fixes" it. | — | [management-nav.tsx:51](../../src/app/management/management-nav.tsx#L51); `find src/app -name loading.tsx` = 11 files |

### Axis 2 — Next.js 16 caching architecture

| # | Finding | Score | Evidence |
|---|---|:---:|---|
| 2.1 | **Every route is fully dynamic** (build output: only `/offline` is static). No `"use cache"`, no `unstable_cache`, no `revalidateTag`, no `cacheComponents` anywhere. This was consciously deferred in June ("decide the Next 16 caching model holistically") — still undecided. The honest assessment: since the dataset RPCs already collapsed the hot-path reads to one round-trip, tag-caching buys much less than it would have in June. The remaining genuinely cacheable reads are `loadUnitDetail`'s full `installers`+`schedulers` pick-lists and `getCurrentUser`'s `user_profiles` row. | **6** | `npm run build` route table (ƒ everywhere); `grep -rn "unstable_cache\|use cache\|revalidateTag\|cacheComponents" src/ next.config.ts` = 0 hits |
| 2.2 | **102 `revalidatePath` calls, many `"layout"`-scoped**, as the only invalidation mechanism. Layout-scope revalidation forces full-tree refetches (including the 509 KB owner dataset / 5 s queue read) when a page-scope or client-store patch would do. The 3 manufacturing dashboards even `revalidatePath` **on every view** from `after()`. | **6** | `grep -rn revalidatePath src/app/actions/` = 102; [cutter/page.tsx:19-22](../../src/app/cutter/page.tsx#L19-L22) |
| 2.3 | `/login` is dynamic and ships 254.9 kB gz first-load. The one page every user hits cold could have a static shell. | **4** | build route table; curl `/login` → `x-vercel-cache: MISS` |

### Axis 3 — Data model & DB

| # | Finding | Score | Evidence |
|---|---|:---:|---|
| 3.1 | **The manufacturing queue read is O(all-time history) with ~90 chunked queries.** `loadPersistedRoleSchedule`: (a) pages the entire `window_manufacturing_schedule` (1,800 rows today, **+230 in the last 2 weeks**, never deleted/archived); (b) fans out units/windows/production/escalations-open/escalations-history over 1,800 window ids in chunks of 100 at concurrency 4 (= ~23 sequential waves); (c) a rooms wave last. Replica measured **5,170 ms total** (scan 1,211 + fan-out 3,729 + rooms 230). The escalation *open* and *history* selects scan the same table twice (36 chunk queries) for a 10-row table. | **9.5** | [manufacturing-scheduler.ts:599-612](../../src/lib/manufacturing-scheduler.ts#L599-L612), [:632-666](../../src/lib/manufacturing-scheduler.ts#L632-L666); [supabase-chunking.ts:7-14](../../src/lib/supabase-chunking.ts#L7-L14); table stats: `window_manufacturing_schedule` = largest table (3,376 kB) |
| 3.2 | **Schedule rows are never archived** — confirmed: no migration deletes/archives on unit completion; completed views (`/cutter\|assembler\|qc/completed`) legitimately read all-time rows, which is *why* Phase 1 couldn't bound the read. This is the enabler blocking 3.1's date-bounding. | **8** | `grep -rl "DELETE FROM window_manufacturing_schedule\|archive" supabase/migrations/` = 0; June audit Phase 1 Task 3 note |
| 3.3 | **`computeAndUpdateManufacturingRisk()` is a serial N+1 facility scan on every dashboard view.** For each in-zone unit with an install date: a per-unit `window_production_status` select + per-unit prev-flag select + per-unit update (+ assignment select + notification insert on escalation) — ~300–400 queries per view at current scale, in `after()` (post-response, but full pool/function cost), fired by **all three** role dashboards, each followed by `revalidatePath`. No mutation triggers it; no cron runs it. | **8** | [production-actions.ts:322-416](../../src/app/actions/production-actions.ts#L322-L416); [cutter/page.tsx:19-22](../../src/app/cutter/page.tsx#L19-L22) (+assembler/qc identical) |
| 3.4 | **`windows` has no `unit_id`** — the root blocker for server-side realtime scoping (6.1) and a recurring join-through-rooms cost in actions (`markWindowCut` resolves unit via `rooms!inner`). | **6.5** | [use-realtime-sync.ts:226-241](../../src/lib/use-realtime-sync.ts#L226-L241) comment; [production-actions.ts:158-169](../../src/app/actions/production-actions.ts#L158-L169) |
| 3.5 | Owner dashboard aggregates are healthy (SQL counts RPC, not in outliers) — **no materialized view warranted** at current scale. Re-affirm Phase 8's call. | — | PERF_BASELINE Phase 8 §Materialized summaries |

### Axis 4 — Concurrency & scale headroom (what breaks at 3×?)

| # | Finding | Score | Evidence |
|---|---|:---:|---|
| 4.1 | **N users × the 5 s / ~90-query queue read is the current pool-pressure shape.** The June fixes removed the reflow *writes* from the read path, but the read itself is the residual storm: 10 concurrent cutter/QC views ≈ 900 in-flight-queued queries at concurrency 4 each. The 2026-06-23 outage shape (pool exhaustion) is contained by the concurrency cap but the per-view cost is unchanged. | **8** | 3.1 measurement; [supabase-chunking.ts:9-14](../../src/lib/supabase-chunking.ts#L9-L14) |
| 4.2 | **Risk-flag `after()` storms multiply with dashboard views** — N concurrent dashboard opens = N full facility N+1 scans + N `revalidatePath` invalidations (which force the *next* view to re-render everything again). Serial-per-unit means slow, not bursty — but it holds a function + connections for the whole loop. | **7** | 3.3 |
| 4.3 | **Realtime fan-out is O(users × listeners), delivered regardless of scope.** Scheduler/installer clients still *receive* every facility `rooms`/`windows` event (client-side apply-scoping only — confirmed open). Historical stats: `realtime.list_changes` was the single largest DB consumer (36 m / 324,780 calls / 23.3% — pre-reset window). Owner no longer subscribes to rooms/windows (p6 win). | **7** | [use-realtime-sync.ts:131](../../src/lib/use-realtime-sync.ts#L131), [:213-241](../../src/lib/use-realtime-sync.ts#L213-L241); PERF_BASELINE Phase 0 realtime stats |
| 4.4 | Any `window_post_install_issues` write triggers a **full dataset refetch on every connected client** (509 KB × N owners + scheduler loads) — a broadcast-amplified read storm at 3× users. | **6.5** | [use-realtime-sync.ts:268-274](../../src/lib/use-realtime-sync.ts#L268-L274) |
| 4.5 | `getCurrentUser` does a `user_profiles` read **every request** even when the JWT claims already carry the role (the read only supplies display_name/email + staleness check), plus an admin-client backfill check. One extra cross-region round-trip per navigation × every user. | **6** | [auth.ts:115-136](../../src/lib/auth.ts#L115-L136) |

### Axis 5 — Network & infra

| # | Finding | Score | Evidence |
|---|---|:---:|---|
| 5.1 | **Function region ≠ DB region.** Prod functions run in `iad1` (verified: `x-vercel-id: yul1::iad1::…`); Supabase is `us-west-2` (pooler host `aws-0-us-west-2.pooler.supabase.com`). ~60–75 ms per DB round-trip before any query work. Users are Ontario-based (`yul1` edge). Every finding above that says "round-trip" is multiplied by this. Vercel allows changing the function region **on Hobby** (Project Settings → Functions); moving to `pdx1`/`sfo1` puts function↔DB at ~1–5 ms at the cost of ~+50 ms user↔function once per request — a huge net win for any request making ≥ 2 DB round-trips (which is all of them: auth profile read + dataset/queue reads). | **8.5** | curl headers this session; PERF_BASELINE Phase 8 §Connection path |
| 5.2 | **Owner shell still serializes the full dataset into the RSC stream** — confirmed open (Phase 4 Task 2 never landed). Measured today: `get_owner_dataset` returns **509 KB** JSON (460 units + 387 schedule entries + 460 assignments), streamed into HTML on every portal entry, re-shipped on every foreground refresh. Units rows are `select *` — the list UI renders a fraction of those columns. | **6.5** | [management/layout.tsx:83-96](../../src/app/management/layout.tsx#L83-L96); RPC measurement this session |
| 5.3 | Bundle is flat vs Phase 8 (base 168.2 kB gz — framework floor, do not re-chase; total 1,452 kB gz / 113 chunks; `/management/units` 301.3 kB gz first-load). No regression; per-route diet remains low-ROI. | — | manifest+gzip measurement this session |
| 5.4 | SW shell works as designed (cache-first `/_next/static/**` only, `fsr-shell-v1`); every deploy invalidates it — deploy cadence is still the lever for field users' cold loads. | — | [public/sw.js](../../public/sw.js) |
| 5.5 | Vercel Hobby: 2 cron jobs max (1 used by `daily-snapshot` — one slot free for the risk cron); functions spin down when idle (cold starts); **Hobby terms prohibit commercial use** — flag for the owner, since this is a commercial ops app. | **3** | [vercel.json](../../vercel.json); Vercel Hobby ToS |

### Axis 6 — Code strength (perf-adjacent)

| # | Finding | Score | Evidence |
|---|---|:---:|---|
| 6.1 | **The freshness architecture is three hand-wired mechanisms** (RSC revalidation, realtime patches, manual/foreground refetch) that must agree per surface — and keep not agreeing: commit 42ab41a (2026-07-04) fixed a field user seeing "Not Yet Started" after bracketing a unit because the store, the RSC tree, and realtime each missed the update differently. Every new surface re-derives this wiring; it is the app's main source of correctness-vs-perf tension. | **6.5** | `git show 42ab41a`; [dataset-context.tsx:142-153](../../src/lib/dataset-context.tsx#L142-L153) |
| 6.2 | **RPC payloads are `as`-cast with zero runtime validation** — a SQL/TS contract drift (column rename, shape change in a migration) fails silently or at render, not at the boundary. All four dataset RPCs + queue rows. | **5.5** | [datasets.ts:40-54](../../src/lib/server-data/datasets.ts#L40-L54), [:285](../../src/lib/server-data/datasets.ts#L285) |
| 6.3 | **No timeouts/AbortSignal on any Supabase call** — a hung fetch stalls the RSC render (skeleton forever) or a Server Action indefinitely; nothing bounds tail latency. | **5** | `grep -rn abortSignal src/lib` = 0 |
| 6.4 | Tests: 85/85 green but **all pure-logic** (`src/lib/*.test.mts`); zero coverage of loaders, server actions, or RPC↔TS parity (the June parity checks were throwaway scripts, deleted). Any Phase-3/4-style data-model change re-pays the full manual-parity cost. | **5** | `npm test` this session; `find src -name "*.test.*"` |
| 6.5 | Middleware `PORTAL_REQUIRED_ROLE` omits `/qc` — unauthenticated hits on `/qc` pass middleware and bounce at the layout instead (works, but pays a layout render and breaks the pattern; role-mismatch redirect also skipped for QC). | **3** | [supabase/middleware.ts:36-42](../../src/lib/supabase/middleware.ts#L36-L42); [qc/layout.tsx](../../src/app/qc/layout.tsx) guards compensate |

### Axis 7 — Measurement infrastructure (the meta-gap)

| # | Finding | Score | Evidence |
|---|---|:---:|---|
| 7.1 | **Production has zero timing instrumentation** — `compiler.removeConsole` (exclude: `error` only) strips every `[owner-load]`/`[scoped-load]`/`[unit-status-drift]` log from prod builds. This is why Phase 0's Vercel log query found nothing in 168 h. All past in-prod claims rest on dev-machine scripts. | **7.5** | [next.config.ts:21-25](../../next.config.ts#L21-L25); PERF_BASELINE Phase 0 §Route loader timing |
| 7.2 | **RUM is collected but never read.** `<SpeedInsights />` is mounted; no dashboard ritual, no alerts, no recorded numbers anywhere in the repo. The Slow-4G role walkthrough and the 10–20-user concurrency probe from Phase 8 remain **not run** (confirmed: nothing in repo since). | **6.5** | [layout.tsx:53](../../src/app/layout.tsx#L53); Phase 8 regression table |
| 7.3 | No perf budgets in CI; `pg_stat_statements` was recently reset (top entries today are dashboard introspection, ~24 s totals) so DB regression comparisons have no window. | **5.5** | outliers snapshot this session |

---

## 3. Options analysis — the three biggest themes

### Theme A — The manufacturing read path (findings 3.1, 3.2, 3.3, 4.1, 4.2)

The factory roles' every page view and every action costs seconds of server work that grows with all-time history. Three levels:

**A0 — Do nothing.**
Cost: 0. What happens: the schedule table grew 14% in two weeks; the 5.17 s read becomes 6–7 s by fall. Every mark-click and search keystroke re-pays it. At 3× users this is the pool-exhaustion candidate. Not tenable.

**A1 — Targeted: single-RPC fold, output-identical (no data-model change).**
Mirror the proven p9/p11 pattern: a `get_role_schedule(p_role)` SECURITY DEFINER RPC that returns exactly the rows the TS assembles today (schedule rows + joined unit/window/production/room fields + escalations), keeping ALL mapping/business logic in TS via a shared builder fed by both the RPC and the retained chunked fallback. Fold the duplicate escalation open/history reads into one. Also: mutation-triggered + daily-cron risk flags with a set-based SQL update (replaces the N+1 view-triggered scan — the free cron slot exists).
- **Effort:** 1 migration + 1 loader refactor + parity check (the team has done this three times; ~1 session) + 1 session for the risk cron.
- **Risk:** low — same rows, parity-diffable, rollback = fallback path. The June playbook's exact groove.
- **What it buys:** queue read ~5.2 s → **~300–500 ms** (1 round-trip + SQL join time); dashboard `after()` storm gone; the single biggest felt win available anywhere in the app. Does **not** fix growth-with-history (the RPC still scans all-time rows — but in SQL, where 1,800 rows is trivial; buys years of headroom).

**A2 — Restructure: archive completed schedule rows (the data-model change).**
When a unit fully installs (or QC-approves all windows), move its `window_manufacturing_schedule` rows to `window_manufacturing_schedule_archive` (same shape + `archived_at`); completed views read the archive with a date bound; active reads become O(active work) forever. Requires: archive migration + trigger-or-mutation hook + rewriting `loadManufacturingCompletedRoleData` + the management-schedule completed counts to query the archive + backfill.
- **Effort:** ~2 sessions (migration + two view rewrites + parity on completed outputs).
- **Risk:** medium — touches what "completed" views show; needs byte-parity checks on completed counts; rollback = re-insert from archive (non-destructive if archive, destructive if delete — **choose archive**).
- **What it buys:** bounded reads forever; makes A1's RPC O(active); unblocks the date-bounded index plans Phase 1 wanted. **Recommended sequencing: A1 first (felt win now, zero model risk), A2 within the quarter (before the table doubles again).**

### Theme B — Compute placement & the remaining round-trips (findings 5.1, 4.5, 5.2)

**B0 — Do nothing.** Every request keeps paying ~65 ms × (auth profile read + dataset read + any action's reads). The RPC wins stay half-realized.

**B1 — Config: move the Vercel function region to `pdx1` (or `sfo1`).**
Project Settings → Functions → Function Region (available on Hobby; redeploy to apply).
- **Effort:** minutes + a before/after TTFB measurement.
- **Risk:** near-zero and instantly reversible. Users pay ~+40–50 ms to reach the function once per request; the function stops paying ~65 ms per DB round-trip. Net win for every request with ≥ 2 DB round-trips — which is every authenticated request in the app (auth + data). The 5 s queue read replica would drop ~40% from this alone (its ~30 sequential waves each shed ~60 ms).
- **What it buys:** the cheapest large win in this document. Do it first and re-measure everything else after.

**B2 — Targeted code: kill the per-request auth read + unit-detail waves.**
(a) `getCurrentUser`: when claims carry `role` (they do for all backfilled users), skip the `user_profiles` read — stamp `display_name` into `app_metadata` at account create/update (same service-role write path that stamps role) so claims are self-sufficient; keep the DB read only as the claims-missing fallback. (b) `loadUnitDetail`: fold its two waves + full installers/schedulers pick-lists into a `get_unit_detail(p_unit_id)` RPC (p9 pattern).
- **Effort:** 1 session each. **Risk:** low-medium (auth path — needs the role-change/session-kill test matrix re-run).
- **What it buys:** −1 DB round-trip on literally every navigation; unit-detail (installer/scheduler hot path) → 1 round-trip.

**B3 — Restructure: move the database next to the users instead (Supabase region migration to `ca-central-1`/`us-east-1`).**
- **Effort/risk:** high — full project migration (pause, dump/restore or replication, new URLs/keys, realtime re-verify), for ~the same latency outcome as B1 at ~100× the risk. **Rejected in favor of B1** (§5).

### Theme C — The instant layer & the freshness architecture (findings 1.1–1.4, 2.2, 6.1)

**C0 — Do nothing.** The app stays "fast for a form app, slow for a tool people use 500× a day." The 42ab41a class of staleness bug keeps recurring because every surface hand-wires its own freshness.

**C1 — Targeted: standardize the optimistic + coalesced-refresh pattern on the three hot journeys.**
(a) Queue actions: make *every* mark/undo/move optimistic via the existing `optimisticUpdate` mechanism (it already exists — it's just optional and inconsistently used); replace per-click `router.refresh()` with one trailing-edge coalesced refresh (e.g. 1.5 s after the last action in a burst); move `moveUnitToProduction`'s `revalidatePath` into `after()` so the action returns in ~100 ms (client already updates optimistically; next nav gets truth). (b) Delete the filter-change `router.refresh()` effects (filters are client-side; realtime + the coalesced refresh already cover freshness). (c) Scheduler assign + installer complete: same treatment on their primary buttons.
- **Effort:** ~1–2 sessions, all client-side + action-timing changes; no data shapes touched.
- **Risk:** low — the rollback-on-error pattern already exists in `runWindowAction`; the invariant to protect is "server truth reconciles within ~2 s" (realtime already delivers it).
- **What it buys:** tap-to-feedback < 100 ms on the highest-frequency interactions in the app. Combined with A1+B1, the factory workflow goes from "click… wait… wait" to instant.

**C2 — Medium: adopt the deliberate Next 16 caching model (the deferred June decision).**
Decide it once, narrowly: (i) tag-cache **only** the two genuinely re-read reference reads left — `loadUnitDetail`'s installers/schedulers pick-lists and (if B2a not done) the auth profile — with `revalidateTag` wired into the **complete** set of account mutations (`actions/auth/*`, `account-sync.ts`); (ii) make `/login` static; (iii) replace layout-scope `revalidatePath` with page-scope or tag invalidation on the top-10 mutation sites; (iv) explicitly **decline** `cacheComponents`/PPR for the portals (every route is per-user dynamic; the RPCs already made dynamic fast — write the rejection down).
- **Effort:** 1–2 sessions. **Risk:** medium — stale pick-list bugs if an invalidation site is missed (the exact reason p9 deferred it); mitigated by B2's RPC fold making (i) mostly moot. **Recommendation: do B2 first; C2 shrinks to (ii)+(iii)+(iv), which are cheap and safe.**

**C3 — Restructure: client-store-first data layer.**
Make the in-memory dataset store the single source of truth per portal session: server actions return row-level deltas that patch the store directly (no `revalidatePath` for data, RSC only for shell/auth), realtime patches as today, RSC refetch only on hard entry. This is what instant-feeling local-first tools do; it would eliminate the triple-mechanism fragility (6.1) structurally.
- **Effort:** high (~4–6 sessions; every mutation's return shape + every consumer audited). **Risk:** high — the 42ab41a bug class moves rather than disappears if any delta is wrong; offline/reconnect semantics must be re-proven.
- **What it buys:** architectural coherence + the last 200 ms. **Verdict: not now.** C1+A1+B1 deliver ~90% of the felt win at ~10% of the risk. Revisit only if, after those ship, measured interaction latency still misses the §1 targets.

---

## 4. Phased plan

**Sequencing rationale.** Phase 0 (see first) and Phase 1 are near-zero-risk multipliers — they make every later phase measurable and cheaper. Phases 2–3 are the felt-latency core (Theme C1 + Theme A1). Phases 4–5 are the data-model durability work (Theme A2 + risk cron). Phases 6–8 are the per-nav trims and realtime scale-out. Phase 9 closes the QA debt. **After every implementation phase:** `npm run lint && npm run typecheck && npm run build && npm run test`, re-measure the phase's stated metric against this doc's numbers, record residual risk here. One revertible commit per phase; production is live and `main` auto-deploys.

**Model legend** (house convention): **Fable 5 / high** → architecture, SQL/RPC design, correctness-sensitive data contracts. **Opus 4.8 / high** → subtle auth/realtime/scheduler correctness. **Sonnet / medium** → mechanical refactors.

| Phase | Goal | Theme | Model |
|---|---|:---:|---|
| 0 | Production observability floor | meta | Sonnet / medium |
| 1 | Function region → `pdx1` + measure | B1 | (config; any model to measure) |
| 2 | Instant queue actions (optimistic + coalesced refresh) | C1 | Opus 4.8 / high |
| 3 | `get_role_schedule` RPC — one-round-trip queue read | A1 | Fable 5 / high |
| 4 | Archive completed schedule rows (bounded reads) | A2 | Fable 5 / high |
| 5 | Risk flags: mutation-triggered + daily cron, set-based | A1 | Opus 4.8 / high |
| 6 | Auth trim + login static + revalidation scope diet | B2/C2 | Opus 4.8 / high |
| 7 | `windows.unit_id` denormalization + server-side realtime scoping | axis 4 | Fable 5 / high |
| 8 | Owner payload diet (projection or pagination) | B/5.2 | Fable 5 / high |
| 9 | Slow-4G walkthrough + concurrency probe (QA debt) | meta | any + manual |

---

### Phase 0 — Production observability floor

> **Model:** Sonnet / medium. Additive only; no behavior changes.

```
FSR Blinds (Next.js 16.2.1 on Vercel, Supabase) has zero production timing
instrumentation: next.config.ts `compiler.removeConsole` (exclude: ["error"])
strips the [owner-load]/[scoped-load] console.log timing lines from prod builds
— Vercel log queries for them return nothing. Speed Insights is mounted but
unread. Fix the observability floor without changing any behavior.

Tasks:
1. Make the existing loader timing lines survive prod builds. Smallest correct
   change: add "warn" to the removeConsole exclude list and switch the timing
   lines in src/lib/server-data/datasets.ts, src/lib/server-data/lookups.ts,
   and src/lib/manufacturing-scheduler.ts (loadPersistedRoleSchedule — add one)
   to console.warn with a stable prefix ([perf]). Do NOT un-strip console.log
   globally. Verify with `npm run build` + grep the built output for [perf].
2. Add a scripts/perf-budget.mjs that reads .next/build-manifest.json +
   per-route client-reference manifests (the methodology in
   docs/refactor/PERF_BASELINE.md), computes shared-base gz and the 5 heaviest
   routes' first-load gz, and exits non-zero if shared base > 175 kB gz or any
   measured route grows > 10% over the checked-in baseline JSON
   (scripts/perf-budget.baseline.json — generate it in this phase:
   base 168.2, /management/units 301.3, /management/schedule 292.4,
   /scheduler/units 291.2, /management 286.6, /cutter/queue 223.4 kB gz).
   Add "perf-budget": "node scripts/perf-budget.mjs" to package.json and run it
   after build in any CI that exists; otherwise document running it in the
   after-every-phase gate.
3. Document the RUM ritual in docs/refactor/PERF_BASELINE.md: a dated section
   with the Vercel Speed Insights p75 LCP/INP/TTFB for /management, /scheduler,
   /installer, /cutter (read manually from the dashboard — there is no read
   API) and a note to re-capture after each phase of
   docs/refactor/WORLD_CLASS_ROADMAP_2026H2.md.
Constraints: no route/data behavior changes; one revertible commit. After:
lint, typecheck, build, test, and confirm a prod build retains the [perf] lines.
```

**Verification:** `[perf]` lines visible in `vercel logs` after next deploy; `npm run perf-budget` passes. **Rollback:** revert commit.

---

### Phase 1 — Function region → `pdx1`

> **Config change + measurement.** No code.

```
Move the FSR Blinds Vercel project's function region next to its Supabase
project (aws us-west-2). Verified today: prod functions run in iad1
(x-vercel-id: yul1::iad1) while Supabase is us-west-2 — every DB round-trip
pays ~60–75 ms cross-country, on every request (auth profile read + dataset
RPC + action reads).

Steps:
1. Capture BEFORE numbers: p75 TTFB for /login and (from Speed Insights or
   curl with an authenticated cookie) /management and /cutter; plus the [perf]
   loader timings from Phase 0 in vercel logs over a day.
2. Vercel Dashboard → fsr-blinds → Settings → Functions → Function Region →
   Portland (pdx1). (Available on Hobby. If the setting is absent, STOP and
   report — do not attempt vercel.json `regions`, which is Pro-only for
   serverless.)
3. Redeploy (empty commit is fine: git commit --allow-empty -m "chore: apply
   pdx1 function region"), confirm x-vercel-id now shows ::pdx1::.
4. Capture AFTER numbers (same set, same method) and append a dated
   before/after table to docs/refactor/PERF_BASELINE.md. Expected: [perf]
   loader ms drop materially (multi-round-trip paths most); TTFB from Ontario
   grows ≤ ~50 ms; total request time drops for every authenticated route.
Rollback: set the region back to iad1 and redeploy.
```

**Verification:** `x-vercel-id` shows `pdx1`; loader timings drop; no auth regressions (login round-trip unaffected — Supabase Auth is also us-west-2, so auth *improves*). **Rollback:** revert the dashboard setting.

---

### Phase 2 — Instant queue actions

> **Model:** Opus 4.8 / high. Client interaction semantics + action timing; realtime correctness must be preserved (missed updates are worse than slow ones).

```
Make the FSR Blinds manufacturing queue actions feel instant. Today every
action waits on server truth, and some wait on a full route re-render.
Re-verify all lines first.

Verified problems:
- src/app/actions/cutter-production-actions.ts (~lines 34-35, and the same in
  moveUnitBackToQueue): revalidatePath("/cutter/queue","layout") runs
  SYNCHRONOUSLY in the action, so the action response re-renders the queue
  route — which re-runs loadPersistedRoleSchedule (measured ~5 s at current
  data size) while the button shows "Moving…".
- src/components/manufacturing/cutter-production.tsx handleStatusChange
  (~line 422): router.refresh() fires PER mark-cut click — marking a batch of
  windows fires a full RSC refetch per window.
- src/components/manufacturing/cutter-queue.tsx (~lines 126-140) and
  manufacturing-role-queue.tsx (~lines 165-172): search/filter changes
  schedule router.refresh() after 400 ms — a full server re-render for a
  client-side filter.
- manufacturing-role-queue.tsx runWindowAction (~197-226): optimisticUpdate is
  optional; pushback/return actions use refreshOnSuccess (full refetch) with
  no optimistic path.

Tasks:
1. Move the revalidatePath calls in moveUnitToProduction / moveUnitBackToQueue
   into after(), and add an optimistic update at the call site (the unit group
   moves out of the queue list immediately; restore on failure). The action
   should return in one auth-check + one UPDATE.
2. Coalesce refreshes: add a small useCoalescedRefresh(router, delayMs=1500)
   hook (trailing edge, resets on each call) and use it everywhere these
   components currently call router.refresh() after a mutation — a burst of N
   marks yields ONE refetch after the burst settles.
3. Delete the filter/search router.refresh() effects in cutter-queue.tsx and
   manufacturing-role-queue.tsx (filtering is client-side over already-loaded
   items; freshness is covered by the coalesced refresh + the existing
   revalidatePath-on-mutation).
4. Make every mark/undo/return action in manufacturing-role-queue.tsx use
   optimisticUpdate with rollback (the mechanism already exists — extend it to
   the pushback path: the row leaves/changes state immediately, the dialog
   closes, errors restore + toast).
5. Do NOT change what any action writes, and do NOT remove the after()
   reflow triggers. Server truth must still reconcile: verify with two
   browsers that a mark in A appears in B within ~2 s (realtime), and that A's
   own view reconciles on the coalesced refresh.

Constraints: no scheduler-math changes; queue contents identical after
reconciliation; one revertible commit. After: lint/typecheck/build/test +
two-browser realtime check + measure tap-to-feedback (< 100 ms) and confirm a
10-mark burst produces exactly one route refetch (Network tab).
```

**Verification:** tap-to-feedback < 100 ms on mark-cut/move-to-production; one refetch per burst; two-browser reconciliation holds. **Rollback:** revert single commit.

---

### Phase 3 — `get_role_schedule` RPC (one-round-trip queue read)

> **Model:** Fable 5 / high. SQL + data-contract parity; the p9/p11 groove.

```
Collapse FSR Blinds' manufacturing queue read into one DB round-trip,
byte-identical output. Re-verify lines first; mirror the proven pattern from
docs/refactor/NAVIGATION_PERFORMANCE_AUDIT_2026.md Phases 9 + 11.

Verified problem: src/lib/manufacturing-scheduler.ts loadPersistedRoleSchedule
(~lines 576-666) (a) pages the ENTIRE window_manufacturing_schedule table
(1,800 rows, growing ~+115/week, never archived), then (b) fans out FIVE
chunked query families over ~1,800 window ids (units, windows,
window_production_status, window_manufacturing_escalations open, escalations
history — note open+history scan the SAME table twice) in chunks of 100 at
concurrency 4 (src/lib/supabase-chunking.ts), then (c) a rooms wave. A
faithful replica measured 5,170 ms against prod (2026-07-13). This runs on
every cutter/assembler/qc dashboard view, queue view, completed view (via
loadManufacturingRoleSchedule), and every post-action refresh.

Tasks:
1. Migration: create get_role_schedule(p_date_column text) — or one function
   returning all columns with the caller passing the role — SECURITY DEFINER,
   search_path=public, GRANT to authenticated, returning ONE jsonb with:
   schedule_rows (all columns, ordered by the role's date column nulls-last),
   plus joined arrays keyed the way the TS builder needs them: units (the 11
   columns the loader selects), windows (the 13 columns), production statuses
   (the 11 columns), rooms (id,name), and escalations as TWO keys — open_by_window
   and history_by_window — computed in one pass over
   window_manufacturing_escalations (fold the duplicate scan).
2. TS: keep ALL mapping/assembly logic in loadPersistedRoleSchedule exactly as
   is; feed it from the RPC when available, retaining the current chunked path
   as the pre-migration/rollback fallback (the p9 pattern: shared builder, two
   sources, byte-identical). Add a [perf] console.warn timing line (Phase 0
   convention).
3. Parity check before shipping: a throwaway service-role script (scratch
   space, delete after) that diffs the RPC-fed ManufacturingRoleSchedule
   against the chunked-fed one for all three roles on live prod — exact set
   parity on item windowIds per section + field-value parity on 20 sampled
   items per role. Record the result + timing (expect ~5,170 ms → well under
   500 ms) in this doc's Phase 3 status note.
4. Gotchas from p9 to re-check: id columns are TEXT not uuid; jsonb reorders
   keys (compare values, not serialization); PostgREST 8KB URL limit is why
   chunking existed — the RPC removes it.

Constraints: queue output byte-identical; no scheduling-math changes; RLS/role
authorization unchanged (the RPC must not widen visibility — it returns the
same all-rows set the current loader already reads as authenticated); one
revertible commit; migration additive (CREATE OR REPLACE only).
After: lint/typecheck/build/test + parity output + re-measure the cutter
dashboard [perf] line in prod.
```

**Verification:** parity script ALL CHECKS PASSED; prod `[perf]` for queue read < 500 ms; queue/completed/management-schedule views unchanged. **Rollback:** revert commit — fallback path remains.

---

### Phase 4 — Archive completed schedule rows

> **Model:** Fable 5 / high. Data-model change; the one June explicitly deferred pending exactly this design.

```
Bound FSR Blinds' manufacturing reads: window_manufacturing_schedule rows are
never removed when a unit completes, so every read is O(all-time history)
(1,800 rows and the largest table in the DB — 3.4 MB with indexes). Completed
views legitimately need history; active views don't. Introduce an archive.

Design constraints (from the June audit Phase 1 Task 3 deferral — read it):
- /cutter|assembler|qc/completed (loadManufacturingCompletedRoleData) and the
  management-schedule completed counts (schedule-view-model.ts, qcApprovedAt
  in interval) read all-time rows. They must keep identical output.
- Reflow (reflowManufacturingSchedules) must only ever see ACTIVE rows.

Tasks:
1. Migration: window_manufacturing_schedule_archive (same columns +
   archived_at timestamptz default now()), RLS enabled matching the source
   table, plus a move_completed_schedules_to_archive() function: move rows
   whose unit is fully installed (units.status='installed') or whose windows
   are all qc_approved — decide the predicate by reading what the completed
   views actually filter on, and state it in the status note. Backfill-run it
   once in the migration.
2. Trigger the move at the mutations that complete a unit (the same set that
   already call recomputeUnitStatus and land status='installed') — inside
   after(), coalesced. NOT on a view.
3. Rewrite the completed-view loaders to read active ∪ archive (or archive
   only, per the predicate) with a date bound parameter where the UI already
   has one; rewrite the management-schedule completed counts the same way.
4. Update Phase 3's RPC (CREATE OR REPLACE) to read only the active table for
   the role queues/dashboards.
5. Parity: before/after diff of (a) all three completed views' item sets and
   (b) the management-schedule completed counts for the current month, on live
   prod via a throwaway script. Byte-identical or the phase does not ship.
Constraints: ARCHIVE, never DELETE (rollback = INSERT back + drop trigger);
one revertible commit; reflow math untouched. After: lint/typecheck/build/
test + parity + confirm the active table row count drops to the active set
and the [perf] queue-read time falls further.
```

**Verification:** parity on completed views/counts; active-table count ≈ in-zone windows; rollback rehearsed (re-insert from archive works). **Rollback:** revert commit + re-insert archived rows (non-destructive by design).

---

### Phase 5 — Risk flags: mutation-triggered + daily cron, set-based

> **Model:** Opus 4.8 / high. Notification semantics must not double-fire.

```
Take computeAndUpdateManufacturingRisk() off the view path in FSR Blinds.
Verified today: it runs in after() on EVERY cutter/assembler/qc dashboard view
(src/app/cutter/page.tsx ~19-22 + assembler/qc identical) and is a SERIAL N+1
loop (src/app/actions/production-actions.ts ~322-416): per in-zone unit with
an install date it does a window_production_status select, a prev-flag select,
an UPDATE, and possibly an assignment select + notification insert — ~300-400
queries per view. It is time-based (daysUntil), so it needs a daily tick, and
event-based (qc_approved → complete), so it needs mutation triggers. Views
give it neither correctly.

Tasks:
1. Rewrite the computation as ONE set-based SQL statement (single UPDATE ...
   FROM over units joined to a per-unit qc_approved count and the working-day
   target date). Working-day math (addWorkingDays with settings/overrides) is
   TS — either precompute the per-unit target_ready_date into the update's
   input (build the date map in TS in one pass, then one UPDATE with a VALUES
   join) or port the calendar walk to SQL; prefer the TS-precompute (no logic
   fork). Return the units whose flag CHANGED so notification emission stays
   in TS and fires once per transition (current dedupe: flag !== prevFlag AND
   daysUntil <= 2 — preserve exactly).
2. Triggers: (a) daily Vercel cron /api/cron/manufacturing-risk (the second
   Hobby cron slot is free — vercel.json currently has one; guard with
   CRON_SECRET like the existing daily-snapshot route); (b) the mutations that
   change inputs — installation_date changes, qc-approve, unit entering the
   zone — fire it coalesced in after() (the app already has this coalescing
   pattern for reflow).
3. Remove the after() risk call + revalidatePath from all three role
   dashboard pages. Reads become pure.
4. Prove notification parity: no duplicate "behind schedule" notifications on
   repeated runs with unchanged inputs (idempotence), and a flag transition
   still notifies exactly once.
Constraints: identical flag values for identical inputs (diff a full
before/after flag snapshot on prod data); one revertible commit. After:
lint/typecheck/build/test + flag-parity snapshot + confirm dashboard views
issue zero writes.
```

**Verification:** flag parity snapshot identical; dashboards issue no writes (DB logs); cron visible in Vercel; notifications idempotent. **Rollback:** revert commit (view-triggered path returns).

---

### Phase 6 — Auth trim, static login, revalidation scope diet

> **Model:** Opus 4.8 / high. Auth trust model (`app_metadata` only) must hold; re-run the role-gating test matrix.

```
Remove the last per-navigation fixed costs in FSR Blinds. Re-verify lines.
Trust model: authorize ONLY from service-role-written app_metadata; never
user_metadata (see src/lib/supabase/middleware.ts header comment).

A. getCurrentUser (src/lib/auth.ts ~83-144) pays a user_profiles read on EVERY
   request even when getClaims() already returned the role — the read only
   supplies display_name/email and a staleness backfill. Stamp display_name
   into app_metadata at the same service-role write sites that stamp role
   (auth-actions.ts account create/update + account-sync.ts), then fast-path:
   claims with role + display_name → return without the DB read; fall back to
   the profile read (and keep the self-heal backfill) only when either is
   missing. Batch-backfill existing users' app_metadata display_name with a
   one-time script (admin API, scratch space).
B. Make /login static: it currently ships dynamic (build shows ƒ) — audit why
   (likely the page reads cookies/getCurrentUser for the already-signed-in
   redirect); move that check client-side or to middleware (middleware already
   handles / and portal redirects) so the login shell prerenders (○) and CDN-
   caches. Keep the SupabaseCookiePurgeScript behavior.
C. Revalidation scope diet: audit the ~102 revalidatePath calls
   (grep src/app/actions). Replace "layout"-scoped invalidations with page-
   scoped ones where the mutation only changes page data, starting with the
   10 highest-frequency actions (production marks, schedule saves, assignment
   changes). Do not touch the ones that legitimately change layout data
   (dataset provider seeds).
D. Add /qc to PORTAL_REQUIRED_ROLE in src/lib/supabase/middleware.ts (~36-42)
   — currently missing, so unauthenticated /qc hits reach the layout before
   bouncing (works but inconsistent + one wasted render).
Constraints: one commit PER sub-part (A-D independently revertible); after
each: lint/typecheck/build/test + login, role-gating, role-change session-kill
walkthrough (A and D touch auth). After A: confirm via [perf]/DB logs that
navigations no longer read user_profiles for backfilled users.
```

**Verification:** per-nav `user_profiles` reads gone (DB logs); `/login` prerenders (○ in build); role matrix passes. **Rollback:** revert per sub-part.

---

### Phase 7 — `windows.unit_id` + server-side realtime scoping

> **Model:** Fable 5 / high. Realtime correctness: a missed event is worse than an extra one.

```
Give FSR Blinds realtime a scalable shape. Verified today
(src/lib/use-realtime-sync.ts ~213-241): scheduler/installer clients RECEIVE
every facility rooms/windows change and drop out-of-scope events client-side —
fan-out is O(users × events) because windows carries only room_id and
postgres_changes filters need a single column. Historical stats:
realtime.list_changes was 23.3% of total DB time.

Tasks:
1. Migration: add unit_id text to windows, backfilled from rooms, NOT NULL
   after backfill, FK + index; add a BEFORE INSERT/UPDATE trigger keeping it
   consistent with room_id (single source of truth stays rooms.unit_id).
   Update the write paths that INSERT windows to supply it (or rely on the
   trigger — state which and why in the status note).
2. Server-side filters: scheduler/installer subscriptions currently listen
   unfiltered. postgres_changes supports eq/in filters with LIMITED in-list
   size — the installer scope (a handful of units) fits an in filter refreshed
   on (re)subscribe; the scheduler scope (460 units today, one scheduler) does
   NOT fit. So: installer → filtered listeners (unit_id=in.(...)); scheduler →
   EVALUATE per-unit broadcast channels or keeping delivery as-is with the
   client-side guard (measure the actual event volume first via the Phase 0
   instrumentation before choosing; write the decision down). Do not regress
   the p6 owner win (owner subscribes to neither table).
3. Two-browser verification per role: window add/update/delete in scope
   arrives; out-of-scope does not re-render (React Profiler); DELETE events
   still apply (they carry only old.id — the filter column may be absent on
   DELETE payloads for filtered subscriptions: VERIFY this Supabase behavior
   and, if filtered DELETEs don't deliver, keep an unfiltered DELETE-only
   listener as the safety net).
4. Simplify markWindowCut-style unit resolution (production-actions.ts
   ~158-169) to read windows.unit_id directly (drops the rooms!inner join).
Constraints: no missed updates (the 3.4/DELETE caveat is the trap); migration
additive + trigger-maintained; one revertible commit. After: lint/typecheck/
build/test + two-browser matrix + measure delivered-event volume per client
before/after.
```

**Verification:** two-browser matrix green incl. DELETEs; per-client delivered events drop; no p6 regressions. **Rollback:** revert commit (column stays, harmless; listeners return to unfiltered).

---

### Phase 8 — Owner payload diet

> **Model:** Fable 5 / high. The remaining big owner lever; do AFTER Phases 1–3 (they may make it unnecessary to go deep).

```
Shrink the FSR Blinds owner portal payload. Measured 2026-07-13:
get_owner_dataset returns 509 KB JSON (460 units select *, 387 schedule
entries, 460 assignments), serialized into the RSC stream on every portal
entry (src/app/management/layout.tsx ~83-96) and re-fetched whole on every
foreground/reconnect/PI-issue refresh (use-realtime-sync.ts ~268-274,
~317-325). Prior art: June Phase 4 Task 2 (pagination) was deferred because
schedule/reports/installers/building/client pages read units from the shared
provider — read that status note first.

Option 1 (recommended first): PROJECTION. The units list/dashboard/schedule
render a fraction of units' columns. Define the owner list projection (audit
every consumer of dataset.units in the management portal — enumerate fields),
change get_owner_dataset (CREATE OR REPLACE, keep full-row fallback) to return
only those columns, and type the TS Unit for the owner path accordingly.
Detail routes already load full rows via loadUnitDetail. Expect roughly
50-70% payload cut for ~1 session of work and no route restructuring.
Measure the exact KB before/after.

Option 2 (bigger, only if RUM still shows owner entry as the bottleneck):
route-local loaders for schedule/reports/installers/building/client pages,
then paginate /management/units from searchParams (the June-deferred plan).
~3 sessions, medium risk (per-route scoping like p10's scheduler work).

Also (either option): scope the PI-issue realtime handler to refresh only
when the change is in an open state the dashboard counts, and throttle the
foreground refresh (e.g. skip if < 30 s since last).
Constraints: identical rendered output on every owner screen (field audit is
the deliverable's core); one revertible commit; RPC change additive with
fallback. After: lint/typecheck/build/test + payload KB before/after +
owner-screen visual walkthrough.
```

**Verification:** payload measurably down (target ≤ ~200 KB with Option 1); all owner screens render identically. **Rollback:** revert; full-row RPC path retained.

---

### Phase 9 — Close the QA debt (Slow-4G walkthrough + concurrency probe)

> **Manual + scripted.** The two checks promised since June Phase 8 and never run. Run once after Phases 1–3 land, then after each later phase.

```
1. Slow-4G role walkthrough (manual, authenticated): Chrome DevTools, Slow 4G
   + 4× CPU. For each role (owner, scheduler, installer, cutter, assembler,
   qc): cold load (SW cleared), warm load, warm in-portal nav, and the role's
   primary action (mark-cut / assign / complete-unit). Record
   paint/interactive/action-feedback times into the PERF_BASELINE Slow-4G
   table (the TBD one from Phase 0, 2026-06-27).
2. Concurrency probe (scripted, service-role, scratch space, off-hours):
   simulate 15 concurrent cutter+qc dashboard/queue loads (the Phase 3 RPC
   read) + 5 owner loads for 2 minutes; capture p50/p95 per request and
   Supabase pooler utilization before/during. Pass = p95 < 2× solo latency and
   zero pool-exhaustion errors. Compare against the 2026-06-23 outage shape.
3. Record both in PERF_BASELINE.md as the "2026 H2 after" section, against
   this doc's §1 targets.
```

**Verification:** the §1 target table gets a measured "after" column. **Rollback:** n/a (measurement only).

---

## 5. Explicitly rejected ideas (do not re-litigate)

| Idea | Verdict | Why |
|---|---|---|
| **Shared-base bundle diet** | REJECTED (re-affirmed) | 168.2 kB gz base re-measured today, byte-flat since June; proven framework floor by the 2026-06-29 spike (core-js is vendored in Next; jspdf already lazy). See the June audit's spike section. |
| **PPR / `cacheComponents` for the portals** | REJECTED for now | Every portal route is per-user dynamic behind auth; the dataset RPCs already made dynamic rendering cheap, and the win would be a static shell the `loading.tsx` skeletons already emulate. Re-evaluate only if Next 16.x makes it zero-config and Phase 6B shows static shells paying off. |
| **`unstable_cache` on unit-detail pick-lists** (June Phase 9 Task 2 redux) | REJECTED unless Phase 6A doesn't ship | Same reasoning as p9: reads ride inside RPCs or run parallel to required queries (~0 latency win), while a missed `revalidateTag` yields a stale assign pick-list — correctness risk for no felt gain. Phase 6A (claims fast-path) removes the biggest remaining repeat read instead. |
| **Supabase region migration** (us-west-2 → ca-central-1) | REJECTED | Phase 1 (function region, config-only, reversible in minutes) achieves the same function↔DB adjacency at ~1% of the risk. Revisit only if Vercel Hobby loses the region setting. |
| **Edge runtime for data routes** | REJECTED | Data still lives in us-west-2; edge scatters compute *away* from the DB (opposite of Phase 1), and Supabase SSR cookie flows are tuned for Node. |
| **Wholesale React Query / SWR migration** | REJECTED | The selector-bailout store + realtime bridge already does what a client cache would, with domain-aware patching. The gap is mutation ergonomics (Phase 2), not the cache layer. C3 (store-first restructure) is the honest deep option if targets are still missed after Phases 1–3 — as designed, not as a library swap. |
| **SW caching of documents / RSC / data** | REJECTED (standing) | Realtime correctness beats offline reads; stale queue data is a factory-floor correctness bug. The shell-only SW is the designed boundary. |
| **Materialized views for owner aggregates** | REJECTED at current scale (re-affirmed from Phase 8) | `get_owner_dashboard_counts` absent from outliers; dataset is 460 units. Revisit at ~5× data or if the counts RPC surfaces in `pg_stat_statements`. |
| **Removing the chunked fallbacks after RPC adoption** | REJECTED | They are the rollback story for every RPC phase (p9 precedent) and cost nothing at runtime. |

---

## 6. Constraints (hard, inherited + new)

- Production is live; `main` auto-deploys. Every phase = one revertible commit (per sub-part where stated), no combined concerns.
- No scheduling-algorithm (`reflowManufacturingSchedules`) math changes anywhere in this roadmap. Phases 3–5 touch *when/where* reads and derived flags happen, never the packing math, and each carries a parity check.
- Realtime correctness beats offline support; missed updates are worse than slow ones (Phase 7's DELETE caveat is the embodiment).
- Respect Vercel Hobby (2 crons — both will be used after Phase 5; function-region setting is the plan's linchpin, verify before Phase 1 celebrates) and Supabase pooler limits (keep `selectInChunks` caps in all fallbacks).
- Preserve the `app_metadata`-only trust model, RLS, and installer offline-upload behavior through every phase.
- After every phase: `npm run lint && npm run typecheck && npm run build && npm run test && npm run perf-budget` (Phase 0), re-measure the phase's stated metric, and append the status note to this doc.
