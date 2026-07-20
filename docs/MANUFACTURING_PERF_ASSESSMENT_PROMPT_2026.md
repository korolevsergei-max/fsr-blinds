# Manufacturing Performance Assessment Prompt — Cutter · QC · Packaging (Assembler)

**Purpose:** a reusable, copy-paste prompt for a fresh agent session. It produces
(1) an evidence-backed performance assessment of the three shop-floor portals —
**/cutter**, **/qc**, and **/assembler** (assembly + packaging; packaging labels
print from the assembler flow) — and (2) a phased implementation plan whose
phases slot into the unified roadmap in
[DEEP_ASSESSMENT_2026H2.md](DEEP_ASSESSMENT_2026H2.md) rather than forking a
new one. Sibling of [DEEP_ASSESSMENT_PROMPT_2026.md](DEEP_ASSESSMENT_PROMPT_2026.md),
scoped to manufacturing-portal performance.

---

## The prompt

```
You are performing a deep PERFORMANCE assessment of the manufacturing side of
this repository — the three shop-floor role portals and everything they touch:

  - CUTTER     src/app/cutter/       (queue, process, production, completed,
                                      unit detail, label/cut-list printing)
  - QC         src/app/qc/           (queue, process, completed, unit detail)
  - PACKAGING  src/app/assembler/    (assembly + packaging are one portal;
                                      packaging-label printing lives here)

plus their shared machinery:
  - src/components/manufacturing/    (role dashboards, queues, process screens,
                                      unit cards, bulk action bar, print sheets)
  - src/lib/cutter-data.ts, src/lib/assembler-data.ts,
    src/lib/manufacturing-process-server.ts (per-role loaders),
    src/lib/manufacturing-queue-core.ts, src/lib/manufacturing-process-core.ts,
    src/lib/dataset-store.ts + src/lib/dataset-context.tsx (client dataset),
    src/lib/cut-labels.ts, src/lib/cut-list-pdf.ts (print/PDF paths)
  - src/app/actions/manufacturing-actions.ts,
    src/app/actions/cutter-production-actions.ts,
    src/app/actions/label-print-actions.ts (mutations)

The app is in production and `main` auto-deploys to Vercel, so every proposed
change must ship as a small revertible step. The users of these portals are
factory staff on shop-floor devices — assume mid-range tablets, spotty Wi-Fi,
and a person standing at a bench waiting for the screen. Perceived latency of
tap → feedback is the metric that matters most here, ahead of pure server time.

════════════════════════════════════════════════════════════════════
STEP 1 — Load prior art before touching code (30 min, mandatory)
════════════════════════════════════════════════════════════════════
This repo has been assessed before and p0–p11 of a performance program have
already shipped. Read, in order:
  - docs/DEEP_ASSESSMENT_2026H2.md                 (the unified plan — your
                                                    output must slot into its
                                                    stages, not compete with it)
  - docs/refactor/WORLD_CLASS_ROADMAP_2026H2.md    (performance playbook; known
                                                    top finds include a 5.2 s
                                                    queue read, iad1↔us-west-2
                                                    function/DB region split,
                                                    no optimistic-UI layer, and
                                                    prod timing stripped by
                                                    removeConsole — verify each
                                                    is still open before citing)
  - docs/refactor/PERF_BASELINE.md and docs/refactor/queue-baseline/
                                                    (measurement history — reuse
                                                    the same methodology so
                                                    numbers are comparable)
  - docs/refactor/NAVIGATION_PERFORMANCE_AUDIT_2026.md
  - docs/CONTEXT.md and docs/adr/                  (architecture decisions)
Rules of engagement with prior art:
  a. NEVER re-litigate an idea in a "rejected" section — cite it and move on.
  b. NEVER trust a plan's status claims. Verify every "done" and every "open"
     item against the current code before it enters your assessment. Docs go
     stale; code is truth.
  c. Where a prior playbook already contains a good phase prompt, REFERENCE it.
     Your value-add is the manufacturing-specific depth the whole-app
     assessments could only skim.

════════════════════════════════════════════════════════════════════
STEP 2 — Measure before judging (evidence discipline)
════════════════════════════════════════════════════════════════════
Every finding must carry: a file:line citation OR a fresh measurement OR a
command whose output you show. No finding ships on vibes. Score each finding
impact × confidence (/10). Where PERF_BASELINE.md has a prior number for the
same path, report old → new so drift is visible.

Baseline these, per role (cutter, qc, assembler), before proposing anything:
  1. Cold and warm load of /[role]/queue and /[role]/process — round-trips,
     total server time, payload bytes, and what the loader's cost scales with
     (units? windows? all-time completed rows?).
  2. The hot mutation loop: mark-window-done (and QC pass/fail, packaging
     complete) — time from action invocation to (a) server confirm and
     (b) visible UI update. State whether feedback is optimistic or
     round-trip-gated, and what revalidation it triggers (layout vs page vs
     tag) — over-broad revalidation on a per-window action is a finding.
  3. Print paths: cut-label sheet, cut-list PDF, packaging label — generation
     time and whether generation blocks the UI thread.
  4. Realtime: what each portal subscribes to, what a single window-status
     write fans out to across the three portals + scheduler/management, and
     whether a broadcast triggers refetches larger than the delta
     (broadcast-amplified refetch is a known failure class here).
  5. Bundle: per-portal first-load JS vs the checked-in baseline; anything
     heavy (PDF lib?) loaded eagerly on queue/process routes that is only
     needed on print routes.

════════════════════════════════════════════════════════════════════
STEP 3 — Assess (manufacturing-specific axes)
════════════════════════════════════════════════════════════════════
AXIS 1 — READ PATHS
  N+1 patterns and chunked fan-outs in cutter-data/assembler-data/
  manufacturing-process-server loaders; over-fetching (does the queue pull
  full window production rows when it renders counts?); completed screens
  loading unbounded history; scaling behavior as
  units × rooms × windows grows over the busy season.

AXIS 2 — WRITE PATHS & PERCEIVED LATENCY
  Cost of each mutation before the operator sees feedback; optimistic-UI
  coverage of the dataset store (which actions bypass it?); bulk actions
  (cutter bulk action bar) — one round-trip or N?; double-tap and retry
  behavior on flaky Wi-Fi (idempotence of status writes).

AXIS 3 — REALTIME & CROSS-ROLE CONSISTENCY
  A missed update is worse than a slow one — flag any optimization that
  could drop or reorder a status transition. Cutter → QC → packaging is a
  pipeline: check that a stage handoff appears in the next role's queue
  without a manual refresh, and measure how long that propagation takes.

AXIS 4 — SHOP-FLOOR RESILIENCE
  Behavior on slow/offline networks: loading/skeleton states, error paths
  that swallow, unbounded Promise.all in loaders or actions, timeouts and
  AbortSignal on network calls, service-worker interaction with the
  installer offline-upload machinery (must not regress it).

AXIS 5 — OBSERVABILITY
  Does production have timing instrumentation on these paths that survives
  the build (removeConsole)? If the answer is no, instrumenting the hot
  loops is almost certainly phase 1 — you cannot tune what you cannot see.

════════════════════════════════════════════════════════════════════
STEP 4 — Produce the phased plan
════════════════════════════════════════════════════════════════════
Write ONE plan ordered by (risk-adjusted value ÷ effort), observability and
measurement multipliers first. Requirements:

  1. Each phase: independently shippable, one revertible commit (or one per
     sub-part), explicit VERIFICATION (the command/measurement that proves it,
     using the PERF_BASELINE methodology) and ROLLBACK (the exact undo).
  2. Each phase carries a self-contained prompt a fresh session can execute —
     or a pointer to an existing playbook prompt if one already covers it.
  3. Each phase names MODEL and THINKING EFFORT per the rubric in
     docs/DEEP_ASSESSMENT_PROMPT_2026.md (Fable 5/high for data-model or
     realtime-correctness design; Opus 4.8/high where UX timing and
     correctness interact; Sonnet 5/medium for mechanical refactors and
     instrumentation; Haiku 4.5/low for config flips) — re-check model IDs
     against the current lineup before reuse.
  4. State explicitly where each phase slots relative to the stages in
     docs/DEEP_ASSESSMENT_2026H2.md, and update that doc's stage tables to
     reference the new phases (say that you did). Do not create a competing
     roadmap.
  5. End with: hard constraints (inherited + new), a rejected-ideas table,
     and the after-every-phase gate (lint/typecheck/build/test + the phase's
     stated metric).

════════════════════════════════════════════════════════════════════
HARD CONSTRAINTS (this repo — verify, then inherit into your plan)
════════════════════════════════════════════════════════════════════
  - Production is live; main auto-deploys to Vercel. Small revertible commits.
  - No changes to reflowManufacturingSchedules math — parity checks required
    on anything near it.
  - Realtime correctness beats performance: a missed status update is worse
    than a slow one. Any caching/debouncing of the pipeline needs an explicit
    staleness argument.
  - Authorize only from service-role-written app_metadata; preserve the
    per-role guards in src/lib/auth.ts and RLS through every phase.
  - Preserve installer offline-upload behavior; label/PDF printing must keep
    working from shop-floor tablets.
  - Vercel Hobby limits: 2 cron slots, function-region setting, no
    vercel.json `regions` (Pro-only).
  - Rate limiting shipped in Phase 7 of the security plan — don't undo it,
    and don't add refetch loops that trip it.

Deliverable: docs/MANUFACTURING_PERF_ASSESSMENT_<date>.md containing
§1 verified current state + fresh baselines (old → new vs PERF_BASELINE),
§2 findings tables per axis (scored, evidenced), §3 the phased plan with
model/thinking per phase and its slot in DEEP_ASSESSMENT_2026H2.md,
§4 constraints + rejected ideas. Update stale status claims you found in
prior docs (and say you did).
```

---

## Reuse notes

- Run the assessment itself with **Fable 5 / high** — same reasoning as the
  general deep-assessment prompt: the assessment is the highest-leverage step.
- Expected session shape: ~30 min prior art, ~1–2 h measurement (the STEP 2
  baselines are the bulk of the work — don't skip them to get to opinions),
  ~1 h writing.
- The file inventory in the preamble was verified 2026-07-19; re-verify paths
  before reuse if the portal structure has changed.
- "Packaging" has no standalone portal — it is the back half of the assembler
  flow. If a dedicated packer role is ever split out, extend the scope list.
