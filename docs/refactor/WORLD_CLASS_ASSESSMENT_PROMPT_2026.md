# World-Class Performance Assessment — Prompt for Fable

**Created:** 2026-07-13
**How to use:** Open a **fresh Claude Code session** in this repo, switch to **Fable 5** (`/model`), and paste the prompt below as-is. This is a **read-only assessment** — no plan mode needed, but expect a long run (it must read docs, verify code, and take measurements). The deliverable is a new roadmap document, not code edits.

**Tip:** If the session runs out of context mid-way, ask it to write findings-so-far into the deliverable doc first, then continue in a new session pointing at that doc.

---

## Prompt to paste

```
You are doing a deep strategic performance assessment of FSR Blinds — a production
field-operations web app for a window-blinds manufacturer/installer. Six role portals
(owner/management, scheduler, installer, cutter, assembler, QC) share one Next.js app.

Stack: Next.js 16.2.1 (App Router, Turbopack, React Compiler) · React 19 · Supabase
(Postgres + SSR auth + realtime) · Tailwind 4 · Vercel (free plan, main auto-deploys
to prod) · PWA manifest with an app-shell service worker.

# Mission

This is NOT another incremental fix list. A full audit-and-fix cycle already ran in
June 2026 and shipped 12 phases. The app is much faster than it was. The question now
is: **what separates this app from world-class, instant-feeling software — and what
are ALL the credible options (small, medium, and deep-restructure) to close that gap?**

You are explicitly allowed to propose deep changes: data-model restructuring, a
different caching architecture, moving computation, rethinking the client/server
split. For each, be honest about cost and risk. I want to understand my option space,
not just receive a task list.

# Step 1 — Absorb prior work first (mandatory, in this order)

1. docs/refactor/NAVIGATION_PERFORMANCE_AUDIT_2026.md — the prior diagnosis, the
   2-axis framing (weak-connection latency vs many-users concurrency), and per-phase
   implementation status notes with residual risks.
2. docs/refactor/PERF_BASELINE.md — measured baselines + Phase 8 "after" numbers.
3. PERFORMANCE_FIXES.md, docs/refactor/PERFORMANCE_PROMPTS_2026.md,
   docs/refactor/DATA_SCOPING_PLAN.md — earlier rounds.
4. docs/CONTEXT.md, docs/refactor-playbook.md, docs/BUG_SOLUTIONS.md — app context
   and house conventions.
5. git log --oneline since 2026-06-25 — perf commits are tagged perf(p0)…perf(p11).

## Already done — DO NOT re-propose (verify, then move on)

- Manufacturing reflow taken off the queue read path; hot-filter indexes added (p1)
- App-shell service worker replacing the old self-destruct SW (p2)
- Streaming management layout, cheaper auth via getClaims (p3)
- Owner dataset RPC + SQL dashboard counts + RSC entry (p4, partial — see open threads)
- Server-loaded unit supplemental data, image optimization (p5)
- Realtime client-side scoping + installer channel consolidation (p6)
- framer-motion → CSS, dead deps removed (p7)
- DB hardening, index review, pooler verification (p8)
- One-round-trip scoped RPCs for scheduler & installer, ~4.7×/~3× faster (p9)
- Scheduler payload −68% (p10); enrichment folded into dataset RPCs, −73% owner
  fetch (p11)
- Owner data-trim (units list virtualized, selector-bailout store, rooms/windows
  dropped from global load)
- Shared-bundle "base diet" — investigated and REJECTED as framework floor (~168 kB
  gz); do not re-propose shrinking the Next.js base bundle.

## Known open threads — verify each is still open, then fold into your assessment

- computeAndUpdateManufacturingRisk() still runs per-view on the 3 manufacturing
  dashboards (facility-wide scan+update); candidate: mutation-triggered + daily cron.
- window_manufacturing_schedule rows are never deleted/archived when a unit
  completes → completed views scan all-time history and reads can't be date-bounded
  without a data-model change (archive/delete on install, or separate bounded query).
- Realtime windows/rooms events are still DELIVERED to scheduler/installer clients
  (only the client-side apply is scoped) because windows lacks a filterable scope
  column; true server-side scoping needs a denormalized unit_id or per-unit channels.
- Reference data (clients/buildings/installers/schedulers) is still re-read on every
  navigation — no unstable_cache/revalidateTag layer was ever adopted (deliberately
  deferred; decide the Next 16 caching model holistically).
- Owner shell still serializes the full units array into HTML (Phase 4 Task 2 never
  fully landed — verify).
- Manual QA gaps from Phase 8: no Slow-4G role walkthrough, no 10–20 concurrent-user
  simulation was ever run.

# Step 2 — Measure before you claim (evidence standard)

Line numbers in the docs have drifted — RE-VERIFY every file:line against current
code before citing it. Every finding in your output needs either a file:line citation
or a measurement. Available instruments:

- npm run analyze (bundle analyzer) — compare to PERF_BASELINE.md numbers.
- npm run build — route-level first-load JS table.
- @vercel/speed-insights is installed — check whether real-user field data is being
  looked at; if you cannot access it, flag "no RUM feedback loop" as a finding.
- Supabase CLI (may need auth refresh): inspect db outliers / calls / index-stats.
- Read the actual loaders end-to-end: src/lib/server-data/datasets.ts,
  src/lib/manufacturing-scheduler.ts, src/lib/use-realtime-sync.ts, middleware.ts,
  src/lib/dataset-context.tsx, and one full portal path (e.g. /scheduler) from
  middleware → layout → page → client store → realtime.

# Step 3 — The assessment itself

Structure your thinking along these axes. The June audit covered axes A/B; go deeper
and wider now:

1. PERCEIVED performance (the "instant feel" layer — largely unexplored so far):
   route prefetching strategy (hover/viewport), Next.js router cache behavior across
   the 6 portals, optimistic UI on mutations (queue actions, status changes),
   skeletons vs blocking awaits on every route, View Transitions, back/forward
   instant restore. Where does the user WAIT today, and which waits are removable vs
   maskable? Walk the highest-frequency user journeys (cutter marking a window cut,
   installer completing a unit, scheduler assigning) and profile each interaction.
2. Next.js 16 caching architecture: the app currently treats almost every route as
   fully dynamic. Assess a deliberate caching model — "use cache"/PPR (if enabled in
   16.2), unstable_cache + revalidateTag for reference data, static shells with
   streamed dynamic slots. This was consciously deferred; now design it.
3. Data model & DB: schedule-row archiving (unblocks bounded reads), denormalized
   scope columns (unblocks server-side realtime filtering), materialized views for
   owner aggregates, moving the manufacturing-risk computation server-side/cron.
   What would the schema look like if designed today for these access patterns?
4. Concurrency & scale headroom: what breaks at 3× current users? Re-examine pool
   pressure, realtime fan-out (O(N) channels × tables), and the remaining per-view
   facility scans. The 2026-06-23 outage shape (unbounded Promise.all → pool
   exhaustion) is the cautionary tale.
5. Network & infra: Vercel free-plan constraints (no ISR concurrency, cold starts),
   function region vs Supabase region (measure the RTT), payload compression, RSC
   payload sizes per navigation.
6. Code strength (secondary, perf-adjacent): test coverage of the scheduler/reflow
   invariants, type-safety of the dataset contracts, error/timeout handling on
   Supabase calls, and anything that makes future perf work risky to ship.
7. Measurement infrastructure: the biggest meta-gap may be that there is no
   continuous feedback loop — no perf budgets in CI, no RUM dashboard being read,
   no regression alarms. Assess what a lightweight version looks like.

# Step 4 — Deliverable

Write docs/refactor/WORLD_CLASS_ROADMAP_2026H2.md in the established house style
(mirror NAVIGATION_PERFORMANCE_AUDIT_2026.md):

1. Executive diagnosis — 1 page max. What tier is the app at today, what does
   "world-class" concretely mean for THIS app (define target metrics: e.g. p75 warm
   navigation, p75 cold LCP on 4G, interaction-to-feedback on queue actions), and
   the 3–5 themes that matter most.
2. Findings table — scored /10 (felt impact × confidence), each with evidence
   (file:line or measurement), grouped by the axes above.
3. Options analysis — for the 3 biggest themes, lay out the option space (do
   nothing / targeted fix / restructure) with effort, risk, and what it buys. This
   is the "what possibilities do we have" section — write it for the app owner to
   make decisions with.
4. Phased plan — each phase: goal, model+mode recommendation, a SELF-CONTAINED
   copy-paste prompt for a fresh session (exact files, steps, constraints,
   verification commands, rollback), independently shippable and revertible.
   Safe/high-ROI first. After-every-phase gate: npm run lint && npm run typecheck
   && npm run build && npm run test, plus re-measure vs baseline.
5. Explicitly rejected ideas — with reasons, so future sessions don't re-litigate.

# Constraints (hard)

- Assessment is READ-ONLY: no source edits, no migrations, no deploys. Throwaway
  measurement scripts go in scratch space only.
- Production is live and main auto-deploys — every proposed phase must be a single
  revertible commit and must not change queue outputs or scheduler math unless the
  phase explicitly says so and provides a parity check.
- Realtime correctness beats offline support; missed updates are worse than slow ones.
- Respect the free Vercel plan and Supabase pooler limits in every recommendation.
```

---

## Notes for future me

- The prompt seeds the model with the open threads from the June audit's residual-risk notes so it starts at the frontier, but instructs it to re-verify each one.
- If you want two smaller runs instead of one big one: run Steps 1–3 as "assessment only, write findings to the doc", then a second session for Step 4's phased plan.
- After the roadmap exists, each phase prompt is designed to be pasted into its own fresh session, same as the June playbook.
