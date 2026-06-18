Yeah, so the way I think about the growth levers is there's organic, inorganic. Organic what I'm seeing outside in perspective that there's a bit of a gap between Roomash and Cloud Bads, meaning specifically like CRM module. I think that would be a big value lift. The second organic lever is better integrating with the kind of broader Aspire and Bowelsoft tech stack. So I know you guys have Valipate, perhaps there's other opportunities that are there as well. And the third thing is I know you guys have tiers of subscriptions, so finding a way to move independent the hotels through that upwards. And in organic, I was curious if there's any tuck-ins or anything like that that there could be out there that we would make sense to make. Maybe there's a way that we could address the CRM need through an organic means. The first six months really, it's really three things. One is like, you know, I'm coming somewhat outside of the hospitality sector, so I need to be ramped up on it, understanding what's what. Second, build trust with the team, assess the team really. And the third thing is exit the sixth month with a line signed off twelve month plan, which clear what's being delivered, what are the enablers, and there's a sign of commitment from you from the team on being able to support me and support that twelve month plan.# Performance & 2026 Architecture — Sequenced Prompts

Companion to [PERFORMANCE_FIXES.md](../../PERFORMANCE_FIXES.md). Each prompt below is **self-contained** — paste it into a **fresh** Claude Code session (no prior context needed). Run them top to bottom; ship each as its own PR off `main`.

**Global notes (apply to every prompt):**
- Switch model with `/model`; toggle Plan mode with `Shift+Tab`.
- Verification commands: `npm run build`, `npm run typecheck`, `npm run lint`, `npm run test`.
- Convention: branch off `main`, one PR per fix, click through the affected flow on the dev server before merging.

---

## Root causes (why this plan exists)

Three structural issues drive "sometimes it takes a while to load"; almost everything else is downstream:

1. **The whole database is loaded into the browser** every management/scheduler session — `loadFullDataset()` in [src/lib/server-data.ts](../../src/lib/server-data.ts) (line ~422). Scales linearly with the business.
2. **One giant client store with no selector bailout** re-renders ~27 component trees on *any* realtime event — [src/lib/dataset-context.tsx](../../src/lib/dataset-context.tsx) + [src/lib/use-realtime-sync.ts](../../src/lib/use-realtime-sync.ts). Zero `React.memo`, no virtualization.
3. **Auth is paid for twice per navigation** — middleware does `getUser()` + a `user_profiles` query ([src/lib/supabase/middleware.ts](../../src/lib/supabase/middleware.ts)), then the layout does it again via `getCurrentUser()` ([src/lib/auth.ts](../../src/lib/auth.ts) line ~79). React `cache()` does not dedupe across the middleware boundary.

## Scorecard (vs. 2026 best-in-class)

| Category | Score |
|----------|:----:|
| Client state & re-renders | 3/10 |
| Data fetching & server/client boundary | 4/10 |
| Code architecture / god files | 4/10 |
| Resilience & error handling | 4/10 |
| Observability / perf measurement | 3/10 |
| Auth & middleware latency | 5/10 |
| Bundle size & code splitting | 5/10 |
| Rendering strategy (Suspense/PPR/streaming) | 5/10 |
| Modern framework adoption | 6/10 |
| Database & query efficiency | 6/10 |
| Realtime efficiency | 6/10 |
| Perceived performance / UX | 7/10 |

## Sequence

`0 → 1 → 2A → 2B → 3 → 4 → 5A → 5B → 6A → 6B`. Phases 0–2 deliver most felt snappiness in week one; 5A/5B are the strategic ones that keep it fast as data grows.

---

## Prompt 0 — Instrumentation + dead-weight removal
**Model: Sonnet 4.6 · Normal mode**

```
You are working in the FSR Blinds repo: Next.js 16.2.1, React 19.2.4, Supabase (SSR), Tailwind 4, TypeScript 5, deployed on Vercel. It's a PWA with offline IndexedDB caching and 6 role portals (management/owner, installer, scheduler, cutter, assembler, qc).

GOAL: Establish a performance-measurement baseline and remove confirmed dead weight. This must ship before any other performance work so later changes are provable. Low-risk, mechanical.

Do these as ONE PR, in order:

1. DEAD DEPENDENCIES — verify then remove:
   a) "lucide-react" — I believe it has zero imports in src/. Confirm with: grep -rn "lucide" src. If truly unused, remove it from package.json dependencies.
   b) "xlsx" — I believe it is only used by scripts/import-lansdowne-b-produced-blinds.ts and never imported by anything under src/. Confirm with: grep -rn "xlsx\|XLSX" src. If only the script uses it, move "xlsx" from dependencies to devDependencies (do NOT delete it — the script needs it).
   Do not remove anything you cannot prove is unused.

2. next.config.ts — currently has experimental.serverActions.bodySizeLimit "12mb", experimental.viewTransition true, and images.remotePatterns. ADD (without removing existing keys):
   - experimental.optimizePackageImports: ["@phosphor-icons/react", "framer-motion"]  (these are barrel-imported across ~96 and ~42 files respectively; this improves tree-shaking)
   - compiler: { removeConsole: { exclude: ["error"] } }  (strips console.* in production builds except console.error)

3. BUNDLE ANALYZER: install @next/bundle-analyzer as a devDependency and wire it into next.config.ts behind an ANALYZE=true env flag (the standard withBundleAnalyzer wrapper). Add an "analyze" script to package.json: "ANALYZE=true next build". Do NOT make it run on normal builds.

4. WEB VITALS / RUM: add real-user monitoring so we can measure LCP/INP/TTFB. Prefer Vercel Speed Insights (@vercel/speed-insights) since the app deploys on Vercel — add the <SpeedInsights /> component to the root layout at src/app/layout.tsx. If you think a lighter custom useReportWebVitals hook is better, propose it but default to Speed Insights.

5. BASELINE: run "npm run build" and report the First Load JS sizes for the main routes (/management, /cutter, /installer, /login) from the build output. Write these numbers into a new file docs/refactor/PERF_BASELINE.md with today's date, so future PRs can compare against it.

CONSTRAINTS:
- Do not change any application logic or UI.
- Run npm run build, npm run typecheck, and npm run lint before finishing; fix anything you broke.
- Show me the diff before applying.

After applying, tell me the before/after dependency count and the baseline First Load JS numbers.
```

---

## Prompt 1 — Enable the React Compiler
**Model: Opus 4.8 · `think hard` · Plan mode for the audit, then apply**

```
You are working in the FSR Blinds repo: Next.js 16.2.1, React 19.2.4, Supabase (SSR), Tailwind 4. About 169 of 224 components are "use client", and the codebase currently has ZERO React.memo/useMemo-based memoization in app components — so it relies heavily on React re-rendering whole trees. There is a single large in-memory dataset store (src/lib/dataset-context.tsx) consumed by ~27 components, and Supabase Realtime patches it frequently, which re-renders many components.

GOAL: Enable the React Compiler (supported on Next 16 + React 19) so components are auto-memoized. This is the highest-leverage, lowest-churn way to reduce the re-render cost. Do NOT hand-write memo() — let the compiler do it.

STEP 1 — PLAN (do not edit yet):
1. Confirm the correct setup for THIS Next version: install babel-plugin-react-compiler (and react-compiler-runtime if required for React 19) and set experimental.reactCompiler in next.config.ts. Check the installed next version in package.json and node_modules and use the matching config shape.
2. The React Compiler bails out on components that violate the Rules of React/Hooks. Run a survey: search for patterns it will reject — mutation of props/state objects, conditional hooks, refs read during render, etc. Pay special attention to:
   - src/lib/dataset-context.tsx (custom useSyncExternalStore store)
   - src/lib/use-realtime-sync.ts
   - the large client components: src/app/management/accounts/accounts-manager.tsx, src/app/management/units/units-list.tsx, src/components/manufacturing/manufacturing-role-queue.tsx, src/components/rooms/room-windows-view.tsx, src/components/windows/window-form.tsx
3. Report which files (if any) the compiler is likely to skip or that need fixing. Present the plan and the risk list. WAIT for my approval.

STEP 2 — APPLY (after I approve):
- Enable the compiler, install deps, fix only the violations that block compilation (do not refactor beyond what's needed to compile cleanly).
- Verify: npm run build, npm run typecheck, npm run lint, npm run test must all pass.
- Compare First Load JS against docs/refactor/PERF_BASELINE.md and report the delta.
- Manually confirm the app still renders by running the dev server and loading /management and /cutter.

CONSTRAINTS:
- If the compiler can't be enabled cleanly on this Next version, STOP and report exactly why rather than forcing it.
- Do not change application behavior. The compiler should be transparent to users.
- Ship as its own PR off main.
```

---

## Prompt 2A — Make the dataset store selector-correct
**Model: Opus 4.8 · `ultrathink` · Plan mode mandatory**

```
You are working in the FSR Blinds repo: Next.js 16.2.1, React 19.2.4, Supabase (SSR).

PROBLEM: src/lib/dataset-context.tsx implements a client store with useSyncExternalStore. On every patch, it builds a NEW snapshot object, so every consumer re-renders even if the slice it reads is unchanged. There is a useDatasetSelector(selector) API but it does NOT provide a real selector bailout: useSyncExternalStore returns the whole snapshot, then the selector runs in a useMemo AFTER React has already decided to re-render. Roughly 27 components call useAppDataset() (the whole value) and only 4 use useDatasetSelector. src/lib/use-realtime-sync.ts patches this store on every INSERT/UPDATE/DELETE across ~10 tables (clients, buildings, units, rooms, windows, installers, schedule_entries, post-install issues + notes, cutters, schedulers, scheduler_unit_assignments). Net effect: a single edit re-renders almost every screen on every connected client.

GOAL: Give the store a TRUE selector bailout so a component re-renders only when its selected slice actually changes.

STEP 1 — INVESTIGATE & PLAN (do not edit yet):
1. Read src/lib/dataset-context.tsx fully and src/lib/use-realtime-sync.ts and src/components/data/app-dataset-client-shell.tsx.
2. List every consumer: grep -rn "useAppDataset\|useDatasetSelector\|useAppDatasetMaybe" src. Note which ones read the WHOLE dataset vs a slice.
3. Choose an approach and justify it:
   A) Use React's useSyncExternalStoreWithSelector (from "use-sync-external-store/shim/with-selector") with a custom equality function, keeping the existing store shape; OR
   B) Migrate the store to Zustand (it already closely resembles a Zustand store) and expose useDataset(selector, equalityFn).
   Recommend ONE. Favor the smallest change that gives correct per-slice bailout.
4. Define the new selector API and a migration path for the 27 useAppDataset() callers (most should switch to selecting only the slices they use).
5. Identify correctness risks: optimistic patchData updates, the isHydratingInitialData flag, syncMeta, and the offline-cache write in app-dataset-client-shell.tsx must all still work.
6. Present the plan. WAIT for approval.

STEP 2 — APPLY (after approval):
- Implement the store change first; keep useAppDataset() working as a back-compat shim that selects the whole value (so nothing breaks), then migrate high-traffic consumers to narrow selectors: start with src/app/management/units/units-list.tsx, src/app/management/units/page.tsx, src/app/management/schedule/schedule-screen.tsx, and the scheduler equivalents.
- Verify with React DevTools Profiler (describe the manual steps for me): editing one window should NOT re-render the clients list, the schedule, or unrelated unit rows.
- npm run build, typecheck, lint, test must pass.

CONSTRAINTS:
- Do NOT change the server-side data loading or the realtime subscription tables in this PR — only the client store's subscription/selection mechanics and the consumer call sites.
- Preserve all current behavior (optimistic updates, hydration flag, offline cache, visibility refresh).
- This is correctness-sensitive (stale UI is the failure mode). Ship as its own PR off main.
```

---

## Prompt 2B — Virtualize the long lists
**Model: Sonnet 4.6 · `think` · Normal mode**

```
You are working in the FSR Blinds repo: Next.js 16.2.1, React 19.2.4. Two screens render large lists with no virtualization, so they mount hundreds of DOM rows at once:
- src/app/management/units/units-list.tsx (~854 lines; multiple .map() over units)
- src/app/management/accounts/accounts-manager.tsx (~1,558 lines; 13 .map() calls over installers/cutters/schedulers/assemblers/qcs)

GOAL: Virtualize the long scrolling lists so only visible rows render.

TASK:
1. Add @tanstack/react-virtual (the standard React 19-compatible virtualization lib).
2. Start with units-list.tsx: identify the single longest list (the main units list). Wrap it in a virtualizer (useVirtualizer) with a scroll container. Keep the existing row markup, sorting, filtering, and click behavior identical — only the rendering windowing changes.
3. Then apply the same to the longest list(s) in accounts-manager.tsx.
4. Preserve: sticky headers, search/filter inputs, keyboard accessibility, and any "scroll into view" behavior. If a list is conditionally short (e.g. usually < 30 rows), leave it un-virtualized and note that.

CONSTRAINTS:
- Do not change data fetching or business logic. UI output must look identical; only off-screen rows are unmounted.
- Test on the dev server with a large dataset: scrolling must be smooth and search must still work.
- npm run build, typecheck, lint must pass.
- Show me the diff before applying. Ship as its own PR off main.

If a list is inside a complex layout (e.g. nested cards, animations via framer-motion) where virtualization would break the visual design, STOP on that list and tell me rather than forcing it.
```

---

## Prompt 3 — Eliminate the double auth round-trip per navigation
**Model: Opus 4.8 · `think harder` · Plan mode mandatory**

```
You are working in the FSR Blinds repo: Next.js 16.2.1, React 19.2.4, Supabase (SSR), 6 role portals.

PROBLEM: Every protected navigation pays for auth TWICE.
- src/lib/supabase/middleware.ts runs supabase.auth.getUser() and then a "user_profiles".select("role") query — and that role-lookup block is duplicated across ~6 route branches (/management, /installer, /scheduler, /cutter, /assembler).
- Then the matching layout calls getCurrentUser() in src/lib/auth.ts (line ~79), which does ANOTHER getUser() + user_profiles read. getCurrentUser is wrapped in React cache(), but that only dedupes within a single render — NOT across the middleware boundary.
- Net: ~2x auth network calls + 2x profile DB reads per navigation. There is a homePathForRole helper in src/lib/role-routes.ts.

GOAL: Remove the per-navigation DB role lookup from middleware and collapse the duplicated branches, without weakening auth/authorization correctness.

STEP 1 — INVESTIGATE & PLAN (do not edit yet):
1. Read src/lib/supabase/middleware.ts, src/lib/auth.ts, src/lib/role-routes.ts, src/lib/supabase/server.ts, and the auth callback/sign-in flow in src/app/actions/auth-actions.ts (where the session is established).
2. Verify these before designing:
   a) Can we reliably store the user's role in a place middleware can read WITHOUT a DB query — e.g. auth user_metadata (already referenced via roleFromAuthMetadata) or app_metadata / a JWT claim? Where is role currently written, and is it kept in sync when an owner changes someone's role?
   b) Does Supabase expose the role claim in the JWT that middleware's getUser() already returns, so no extra read is needed at all?
   c) What is the failure mode if metadata is stale (e.g. role changed but token not refreshed)? Authorization must NOT silently grant the wrong portal.
3. Design:
   - Write/maintain role in auth metadata (or a JWT claim) at sign-in and whenever role changes (account creation/role edits in auth-actions.ts / management-actions.ts).
   - Middleware reads role from the token/metadata only — no user_profiles query on the happy path. Keep a single DB fallback ONLY when the claim is missing.
   - Collapse the 6 duplicated role->redirect branches into one helper built on homePathForRole.
4. Present the plan + the staleness/security analysis + rollout (how existing logged-in users get the claim — on next refresh? a one-time backfill?). WAIT for approval.

STEP 2 — APPLY (after approval):
- Implement, keeping a safe fallback. Add a clear comment explaining the trust model.
- Verify all role routings still work: sign in as each role and confirm correct portal + that cross-portal access is still blocked (e.g. an installer hitting /management redirects out). Test the "role just changed" case.
- npm run build, typecheck, lint, test must pass.

CONSTRAINTS:
- Authorization correctness is non-negotiable — if you cannot guarantee the claim approach is safe against stale roles, propose the safest hybrid and ask before shipping.
- Do NOT use the service-role key in middleware.
- Ship as its own PR off main.
```

---

## Prompt 4 — Streaming, error boundaries, and a PPR pilot
**Model: Opus 4.8 · `think hard` · Plan mode for boundary placement**

```
You are working in the FSR Blinds repo: Next.js 16.2.1, React 19.2.4, Supabase (SSR), App Router, 6 role portals under src/app/{management,installer,scheduler,cutter,assembler,qc}.

PROBLEM: The app has ZERO error.tsx / global-error.tsx boundaries, only ~6 loading.tsx files, and only ~3 Suspense usages. So a transient query failure shows a broken/blank screen (reads as "slow/hung" to users), and heavy dashboards block on their slowest query before painting anything.

GOAL: Add graceful loading + error states and stream heavy content, then pilot Partial Prerendering (PPR) on one portal.

STEP 1 — PLAN (do not edit yet):
1. Map which routes currently have loading.tsx (find src/app -name loading.tsx) and which heavy pages block on data (the role dashboards and management/units, management/schedule, management/reports).
2. Propose:
   a) An error.tsx for each portal segment (management, installer, scheduler, cutter, assembler, qc) with a friendly message + a "Try again" reset button, plus a root src/app/global-error.tsx.
   b) Additional loading.tsx skeletons for heavy routes that lack them.
   c) Suspense boundaries that let the page shell (nav + header) paint immediately while the data-heavy section streams in. Identify exactly where the boundary goes for the management dashboard and one role dashboard.
   d) A PPR pilot: pick ONE portal whose chrome is static (likely a role portal) and outline enabling PPR (experimental.ppr) for just that route, with the static shell prerendered and dynamic data suspended.
3. Present the plan. WAIT for approval.

STEP 2 — APPLY (after approval):
- Add the error.tsx / global-error.tsx files (these must be Client Components with reset()).
- Add the loading skeletons and Suspense boundaries.
- Enable and verify the PPR pilot on the one chosen route only. If PPR is not stable/usable on this exact Next version, skip it and report why — do the rest regardless.
- Verify: simulate a server error (temporarily throw in a page's data load) and confirm the error boundary catches it with a working retry; confirm the shell paints before data on a throttled connection.
- npm run build, typecheck, lint must pass.

CONSTRAINTS:
- error.tsx boundaries must not swallow auth redirects (redirect() throws control-flow errors that must propagate). Verify redirects in layouts still work after adding boundaries.
- Ship as its own PR off main.
```

---

## Prompt 5A — Scope the data: stop loading the entire DB (analysis + plan only)
**Model: Opus 4.8 · `ultrathink` · Plan mode — NO edits this session**

```
You are working in the FSR Blinds repo: Next.js 16.2.1, React 19.2.4, Supabase (SSR).

PROBLEM (the strategic one): src/lib/server-data.ts loadFullDataset() (line ~422) loads the ENTIRE domain into memory and ships it to the client on every management session: clients, buildings, units, rooms, windows, installers, schedule_entries, cutters, schedulers, scheduler_unit_assignments, escalations, post-install issues. There is a get_full_dataset RPC fast path, but it still returns everything. Then withLiveUnitStatuses() (line ~320) runs ANOTHER production-status query over all units, recomputes statuses, and performs DB WRITES inside the read path via after() (lines ~400-411). src/app/management/layout.tsx feeds this whole blob into the client store, and ~27 components read it via useAppDataset(). This scales linearly with the business — every new building slows down every page. There is no pagination.

GOAL FOR THIS SESSION: Produce a migration design ONLY. Do not edit code.

DELIVERABLES:
1. A precise map of who actually needs what: for each screen that calls useAppDataset() (grep -rn "useAppDataset" src), list which slices it truly reads. Identify which screens need only one building's units, or one unit's rooms/windows, vs. genuinely global data.
2. A target architecture:
   - Which list/detail pages should become Server Components reading SCOPED queries (e.g. units for one building, windows for one unit) instead of deriving from the global blob.
   - What minimal shared client state should remain (likely: current user, notification counts, maybe a small "live status" channel) vs. what should be fetched per-route.
   - A pagination strategy for the management units list and accounts list.
3. The plan to remove writes from the read path: where should units.status actually be kept correct so withLiveUnitStatuses' self-heal write-back becomes unnecessary? (Find every caller of recomputeUnitStatus and the mutation paths.)
4. A SEQUENCED, low-risk migration: which screen to convert first (smallest blast radius), how to keep the old loadFullDataset working during migration, and how to verify parity at each step.
5. A rollback story and the risks (realtime sync currently assumes a full client dataset — how does scoping interact with src/lib/use-realtime-sync.ts?).

CONSTRAINTS:
- This changes the data contract the whole app depends on — be conservative and explicit.
- Do NOT write code. Produce the plan as docs/refactor/DATA_SCOPING_PLAN.md and walk me through it. I will approve before any implementation (that happens in 5B).
```

---

## Prompt 5B — Scope the data: implement the first slice
**Model: Opus 4.8 · `think harder` · Plan mode**

```
You are working in the FSR Blinds repo: Next.js 16.2.1, React 19.2.4, Supabase (SSR).

CONTEXT: We have an approved migration plan at docs/refactor/DATA_SCOPING_PLAN.md for moving off the monolithic loadFullDataset() (src/lib/server-data.ts line ~422) toward per-route scoped Server Component queries. Read that plan first; it is the source of truth.

GOAL: Implement ONLY the FIRST migration step from that plan (the smallest-blast-radius screen identified there), behind the safety of keeping loadFullDataset() intact for everything not yet migrated.

TASK:
1. Re-read DATA_SCOPING_PLAN.md and restate the exact first step you are about to implement, and confirm it matches the plan. If anything in the codebase has drifted from the plan, STOP and tell me.
2. Implement that one screen: add the scoped server-side loader, convert the page to a Server Component (or pass scoped props), and remove its dependency on the global useAppDataset() blob.
3. Ensure realtime still works for that screen per the plan (src/lib/use-realtime-sync.ts).
4. Verify PARITY: the migrated screen must show identical data and behavior to before. Describe the manual test steps and run the dev server to confirm.
5. npm run build, typecheck, lint, test must pass.

CONSTRAINTS:
- Migrate exactly ONE screen this PR. Do not touch others.
- Do not delete loadFullDataset() or change unmigrated screens.
- If you discover the plan's first step is riskier than it looked, STOP and report before proceeding.
- Ship as its own PR off main. After this lands and is verified in production, we'll repeat 5B for the next screen.
```

---

## Prompt 6A — Decompose the god files
**Model: Sonnet 4.6 for mechanical splits · Opus 4.8 + `think hard` for scheduler-adjacent files · Plan mode**

```
You are working in the FSR Blinds repo: Next.js 16.2.1, React 19.2.4, TypeScript 5. Several files are too large, which slows HMR/type-checking, hurts code-splitting, and makes changes risky:
- src/app/actions/fsr-data.ts (~2,671 lines, ~90KB — "use server" actions)
- src/app/management/accounts/accounts-manager.tsx (~1,558 lines, client component)
- src/app/actions/auth-actions.ts (~1,132 lines)
- src/lib/server-data.ts (~1,093 lines)
- src/components/rooms/room-windows-view.tsx (~1,064 lines)
- src/components/windows/window-form.tsx (~1,061 lines)

GOAL: Split these by COHESION (not arbitrarily by line count), preserving all behavior and public import paths.

STEP 1 — PLAN (do not edit yet):
1. For EACH file, read it and propose a split into cohesive modules. Examples to consider:
   - fsr-data.ts -> per-entity server-action modules (units, windows, rooms, buildings, clients...), with the original path re-exporting for back-compat so no import sites break.
   - accounts-manager.tsx -> one component per role section (installers/cutters/schedulers/assemblers/qcs/owners) + a thin orchestrator that composes them.
   - server-data.ts -> per-portal loaders (full/scheduler/installer) + shared helpers.
2. For each, state which split is purely mechanical (safe for Sonnet) vs. which touches subtle invariants. Flag anything that imports from or feeds src/lib/manufacturing-scheduler.ts as HIGH RISK — those need extra care.
3. Present the plan, one file at a time, ordered safest-first. WAIT for approval. We will likely do these as SEPARATE PRs.

STEP 2 — APPLY (after approval, ONE file per PR):
- Split the approved file. Keep the original module path as a re-export barrel so existing imports keep working, OR update import sites if cleaner — your call, but no broken imports.
- Behavior must be byte-for-byte identical. This is a pure refactor.
- npm run build, typecheck, lint, test must pass; the diff should be moves + re-exports, not logic changes.

CONSTRAINTS:
- Do NOT change logic, types, or behavior. If you're tempted to "fix" something while splitting, note it separately and leave it.
- For any file touching the manufacturing scheduler, switch to Opus 4.8 with extended thinking and treat it as high-risk.
- One file per PR off main. Start with the safest (likely auth-actions.ts or accounts-manager.tsx).
```

---

## Prompt 6B — Realtime channel consolidation + animation diet
**Model: Sonnet 4.6 · `think` · Normal mode**

```
You are working in the FSR Blinds repo: Next.js 16.2.1, React 19.2.4, Supabase (SSR).

TWO cleanups in one PR:

1. REALTIME CHANNELS: src/lib/use-realtime-sync.ts opens a SEPARATE Supabase channel per table via sub() (channel name `realtime-${table}`), so each client holds ~10+ websocket channels. Investigate whether these can be consolidated into fewer channels (Supabase allows multiple postgres_changes listeners on one channel). Refactor to reduce channel count while keeping every table's INSERT/UPDATE/DELETE handling, the role-based gating (shouldTrackMetaTables / shouldTrackStaffLists / shouldTrackManufacturingLists), and the debounced refresh behavior identical. Verify edits from a second browser still propagate live to all the same tables.

2. ANIMATION DIET: framer-motion is imported in ~42 files (import { motion } / AnimatePresence). The app already has experimental.viewTransition enabled in next.config.ts. Identify the SIMPLEST framer-motion usages — basic fade/slide/scale on mount, simple hover/tap — that can be replaced with plain CSS transitions or the View Transitions API, reducing how many routes pull in framer-motion. Do NOT touch complex orchestrated animations or layout/AnimatePresence-dependent ones; leave those on framer-motion. List what you converted and what you intentionally left.

CONSTRAINTS:
- No visual regressions — converted animations must look the same to users.
- Realtime correctness is the priority for part 1: if consolidation risks dropping events, keep separate channels and just document why.
- Compare First Load JS against docs/refactor/PERF_BASELINE.md and report which routes got lighter.
- npm run build, typecheck, lint must pass. Show me the diff before applying. Ship as its own PR off main.
```
