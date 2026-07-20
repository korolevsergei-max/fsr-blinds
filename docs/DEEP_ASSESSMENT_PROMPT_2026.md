# Deep Code Assessment Prompt — Performance · Security · Best Practices

**Purpose:** a reusable, copy-paste prompt for a fresh agent session. It produces
(1) an evidence-backed assessment of the codebase across three axes and
(2) a phased implementation plan where every phase names the best model and
thinking effort to execute it. Executed 2026-07-17 → output in
[DEEP_ASSESSMENT_2026H2.md](DEEP_ASSESSMENT_2026H2.md).

---

## The prompt

```
You are performing a deep assessment of this repository across three axes —
PERFORMANCE, SECURITY, and BEST-PRACTICE CODE QUALITY — and turning the result
into a detailed, phased implementation plan. The app is in production and
`main` auto-deploys, so the plan must be shippable in small revertible steps.

════════════════════════════════════════════════════════════════════
STEP 1 — Load prior art before touching code (30 min, mandatory)
════════════════════════════════════════════════════════════════════
This repo has been assessed before. Read, in order:
  - docs/refactor/WORLD_CLASS_ROADMAP_2026H2.md   (performance playbook)
  - docs/security/SECURITY_REMEDIATION_PLAN.md    (security playbook)
  - docs/refactor/PERF_BASELINE.md                (measurement history)
  - docs/CONTEXT.md and docs/adr/                 (architecture decisions)
Rules of engagement with prior art:
  a. NEVER re-litigate an idea in a "rejected" section — cite it and move on.
  b. NEVER trust a plan's status claims. Verify every "done" and every "open"
     item against the current code before it enters your assessment. Docs go
     stale; code is truth.
  c. Where a prior playbook already contains a good phase prompt, REFERENCE it
     rather than rewriting it. Your value-add is the unified sequence, the
     verification of current state, and the gaps the prior docs missed.

════════════════════════════════════════════════════════════════════
STEP 2 — Assess (evidence discipline applies to every finding)
════════════════════════════════════════════════════════════════════
Every finding must carry: a file:line citation OR a fresh measurement OR a
command whose output you show. No finding ships on vibes. Score each finding
impact × confidence (/10) so the plan can be sequenced honestly.

AXIS 1 — PERFORMANCE
  - Read paths: round-trips per page view, O(what) does each loader scale with,
    N+1 patterns, chunked fan-outs, payload sizes (measure, don't estimate).
  - Write paths: what a mutation costs before the user sees feedback; use of
    optimistic UI; revalidation scope (layout vs page vs tag).
  - Infra: function region vs DB region, caching model, bundle sizes vs the
    checked-in baseline, service-worker behavior.
  - Concurrency: what breaks at 3× users (pool pressure, realtime fan-out,
    broadcast-amplified refetches).
  - Meta: does production have timing instrumentation that survives the build?
    Are there perf budgets in CI? Is RUM read by anyone?

AXIS 2 — SECURITY
  - Server actions are unauthenticated POST endpoints unless guarded. Build an
    authz matrix: EVERY exported "use server" function × the guard it calls
    (directly or via a helper — trace the imports; a naive grep undercounts).
    Flag every export with no guard and state what RLS does or doesn't backstop.
  - RLS: which roles can read/write which tables; anon exposure; SECURITY
    DEFINER functions' search_path and GRANTs.
  - Trust model: what claims are authorized from (app_metadata only?), signup
    trigger behavior, session invalidation on role change.
  - Headers: CSP, HSTS, X-Frame-Options, X-Content-Type-Options.
  - Dependencies: npm audit (state severity, whether runtime or build-time,
    and the fix path). Repo hygiene: committed data files, secrets, .gitignore.
  - Rate limiting on expensive authenticated endpoints.

AXIS 3 — BEST-PRACTICE CODE QUALITY
  - Type safety: tsconfig strictness; count `as any`, @ts-ignore,
    eslint-disable; runtime validation at trust boundaries (RPC payloads,
    action inputs) — `as`-casts over network data are findings.
  - Resilience: timeouts/AbortSignal on network calls; error paths that
    swallow; unbounded Promise.all.
  - Tests: what layers have coverage (pure logic vs loaders vs actions vs
    SQL↔TS contract parity); is CI enforcing anything at all?
  - Structure: files > ~750 lines, duplicated wiring patterns, dead config.
  - Conventions: does new code have a pattern to follow for auth, data
    loading, mutations, realtime? Where do surfaces hand-wire what should be
    shared?

════════════════════════════════════════════════════════════════════
STEP 3 — Produce the phased plan
════════════════════════════════════════════════════════════════════
Write ONE unified plan (do not emit three parallel plans). Requirements:

  1. SEQUENCE by (risk-adjusted value ÷ effort), with multipliers first:
     observability and config wins that make later phases cheaper/measurable
     go before the work they de-risk. State the sequencing rationale.
  2. Each phase must be: independently shippable, one revertible commit (or
     one per sub-part), with explicit VERIFICATION (the command/measurement
     that proves it worked) and ROLLBACK (the exact undo).
  3. Each phase carries a self-contained prompt a fresh session can execute —
     or an explicit pointer to the prior playbook's prompt if one exists.
  4. Each phase names the MODEL and THINKING EFFORT to run it with, using
     this rubric (current Anthropic lineup — update as models change):

     ┌────────────────────────┬──────────────────────────────────────────────┐
     │ Fable 5 · high         │ Architecture, SQL/RPC contract design, data- │
     │ (claude-fable-5)       │ model migrations, realtime-correctness       │
     │                        │ design, anything where a subtle mistake      │
     │                        │ corrupts data or drops updates silently.     │
     ├────────────────────────┼──────────────────────────────────────────────┤
     │ Opus 4.8 · high        │ Auth/security correctness, notification/     │
     │ (claude-opus-4-8)      │ idempotence semantics, interaction-timing    │
     │                        │ work where UX and correctness interact.      │
     ├────────────────────────┼──────────────────────────────────────────────┤
     │ Sonnet 5 · medium      │ Mechanical refactors, additive               │
     │ (claude-sonnet-5)      │ instrumentation, dependency bumps, header    │
     │                        │ config, doc updates with clear specs.        │
     ├────────────────────────┼──────────────────────────────────────────────┤
     │ Haiku 4.5 · low        │ Trivial config flips, .gitignore edits,      │
     │ (claude-haiku-4-5)     │ doc-only truth-ups — anything a checklist    │
     │                        │ fully specifies.                             │
     └────────────────────────┴──────────────────────────────────────────────┘

     Thinking effort meaning: high = extended thinking on, generous budget
     (design + adversarial self-review); medium = standard reasoning;
     low = direct execution. When a phase mixes design and mechanics, name
     both (e.g. "design with Fable 5/high, then execute with Sonnet 5/medium").

  5. End with: hard constraints (inherited + new), a rejected-ideas table so
     future sessions don't re-litigate, and the after-every-phase gate
     (lint/typecheck/build/test + the phase's stated metric).

════════════════════════════════════════════════════════════════════
HARD CONSTRAINTS (this repo — verify, then inherit into your plan)
════════════════════════════════════════════════════════════════════
  - Production is live; main auto-deploys to Vercel. Small revertible commits.
  - No changes to reflowManufacturingSchedules math — parity checks required
    on anything near it.
  - Authorize only from service-role-written app_metadata; never user_metadata.
  - Realtime correctness beats performance: a missed update is worse than a
    slow one.
  - Vercel Hobby limits: 2 cron slots, function-region setting, no
    vercel.json `regions` (Pro-only).
  - Preserve RLS and installer offline-upload behavior through every phase.

Deliverable: docs/DEEP_ASSESSMENT_<date>.md containing §1 verified current
state, §2 findings tables (per axis, scored, evidenced), §3 the unified
phased plan with model/thinking per phase, §4 constraints + rejected ideas.
Update stale status claims you found in prior docs (and say you did).
```

---

## Reuse notes

- The prompt is repo-aware in Step 1 and the constraints block; swap those two
  sections to reuse it on another codebase. Steps 2–3 are generic.
- The model rubric reflects the lineup as of 2026-07; re-check model IDs
  before each reuse.
- Expected session shape when executing: ~30 min reading prior art, ~1–2 h
  verification and sweeps, ~1 h writing. Run it with **Fable 5 / high** —
  the assessment itself is the highest-leverage architecture task in the cycle.
