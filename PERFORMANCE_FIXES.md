# Performance Fix Prompts — Sign-in & "Queue as Cutter"

Copy each prompt block into a fresh Claude Code session. Each section tells you which **model** and **mode** to use before pasting.

---

## How to read the model/mode notes

- **Model**: switch with `/model` in Claude Code.
  - **Sonnet 4.6** — faster, cheaper, fine for mechanical edits with clear acceptance criteria.
  - **Opus 4.7** — use when the change touches subtle invariants (scheduler logic, cache correctness, concurrency).
- **Mode**:
  - **Plan mode** (`Shift+Tab` to toggle) — Claude proposes a plan first, you approve, then it edits. Use for anything that touches the manufacturing scheduler or auth.
  - **Normal mode** — direct edits. Fine for isolated, mechanical changes.
- **Verify before commit**: after each fix, run `npm run build` (or whatever this repo uses) and click through the affected flow in the dev server. Don't trust "it compiled" as proof the fix worked.

---

# IMMEDIATE WINS

These are independent. Do them in order; each ships separately.

---

## Fix 1 — Defer manufacturing risk + schedule reflow off the dashboard render path

**Why it matters:** This is the single biggest cause of slow sign-in. After auth, the user lands on `/cutter` (or `/assembler`/`/qc`), and the page **awaits** two heavy operations before rendering anything. Both should run after the response is sent.

**Files involved:**
- [src/app/cutter/page.tsx](src/app/cutter/page.tsx) — top-level await of `computeAndUpdateManufacturingRisk()` and `loadManufacturingRoleSchedule("cutter")`
- [src/app/assembler/page.tsx](src/app/assembler/page.tsx) — same pattern (verify)
- [src/app/qc/page.tsx](src/app/qc/page.tsx) — same pattern (verify)
- [src/app/actions/production-actions.ts:323-417](src/app/actions/production-actions.ts#L323-L417) — `computeAndUpdateManufacturingRisk()` definition
- [src/lib/manufacturing-scheduler.ts](src/lib/manufacturing-scheduler.ts) — `reflowManufacturingSchedules` (~line 701) and `loadManufacturingRoleSchedule`

**Model/mode:** **Opus 4.7 in Plan mode.** This touches what the dashboard reads on first paint — getting it wrong means stale data shown to a cutter. Plan mode forces a written plan you can review.

### Prompt to paste

```
I want to make sign-in feel fast by deferring expensive work off the dashboard render path.

Context — the slow path:
- After login, users land on /cutter, /assembler, or /qc
- src/app/cutter/page.tsx awaits two heavy ops before rendering:
  1. computeAndUpdateManufacturingRisk() in src/app/actions/production-actions.ts:323
     — scans all measured/bracketed/manufactured units, queries production status per unit, updates risk flags
  2. loadManufacturingRoleSchedule("cutter") which calls reflowManufacturingSchedules() in src/lib/manufacturing-scheduler.ts (~line 701)
     — fetches all units in 4 statuses, all rooms, all windows, all production statuses, all escalation history, runs full capacity packing

Task:
1. Read all three role pages (cutter/assembler/qc) and confirm the same pattern. Also check if `/management` does this.
2. Propose a plan to:
   a) Render the dashboard from the LAST PERSISTED state (read manufacturing_risk_flag on units; read whatever the latest scheduler output is persisted in DB) — i.e. the dashboard should NOT call computeAndUpdateManufacturingRisk or reflowManufacturingSchedules on its render path.
   b) Move both computations into a deferred trigger using `after()` from "next/server" — so they run AFTER the response is sent. Place them either at the page level (after()) or in a server action triggered by the client after mount.
   c) Ensure the data the dashboard reads is freshly persisted by the previous reflow run (verify what tables/columns the scheduler writes to and that the dashboard reads from those, not from in-memory results).
3. Identify any caller that DEPENDS on these being fresh-on-first-render (e.g. an alert that must fire immediately). For those, leave them on the synchronous path or find a different trigger.
4. Show me the plan; do NOT edit yet.

Constraints:
- Do not change scheduler internals. We only want to change WHEN it runs relative to render.
- Mobile / slow connections matter — every awaited Supabase round-trip costs us.
- If you are not 100% sure where the dashboard reads risk/schedule data from, grep for it and tell me; do not guess.
```

---

## Fix 2 — Stop revalidating four layouts on every "mark cut/assembled/qc" action

**Why it matters:** Every cutter click revalidates `/cutter`, `/assembler`, `/qc`, AND `/management` layouts. The browser ends up refetching pages the user isn't even looking at.

**File involved:**
- [src/app/actions/production-actions.ts:31-36](src/app/actions/production-actions.ts#L31-L36) — `revalidateAll()` helper, called from `scheduleManufacturingFollowUp()` at [line 57](src/app/actions/production-actions.ts#L57)

**Model/mode:** **Sonnet 4.6 in normal mode.** Mechanical, low-risk.

### Prompt to paste

```
In src/app/actions/production-actions.ts there is a helper revalidateAll() (lines 31–36) that revalidates four layouts after every mark-cut / mark-assembled / mark-qc action. This is causing the "queue as cutter" action to feel slow because the browser refetches pages the user isn't on.

Replace it with targeted revalidation:
- markWindowCut → revalidate only "/cutter" layout
- markWindowAssembled → revalidate only "/assembler" layout
- markWindowQCApproved → revalidate only "/qc" layout

Each action already passes a `scheduleReason` ("mark_cut" | "mark_assembled" | "mark_qc") to scheduleManufacturingFollowUp. Use that to pick which path to revalidate. The /management layout does not need to be live-revalidated on every per-window action — if you find a place that depends on it, flag it but don't include /management in the per-action revalidation.

Verify:
- The mark actions still trigger the right post-write recompute via scheduleManufacturingFollowUp (don't break that).
- recomputeUnitStatus and reflowManufacturingSchedules still run inside after() — only the revalidation scope changes.

Show me the diff before applying.
```

---

## Fix 3 — Make "Queue as cutter" feel instant via stronger optimistic UI

**Why it matters:** The action ALREADY uses `optimisticUpdate` for local state, but the user still waits for the round-trip. We want the row to disappear immediately and the action to appear "done" before the server responds.

**Files involved:**
- [src/components/manufacturing/manufacturing-role-queue.tsx:1131-1138](src/components/manufacturing/manufacturing-role-queue.tsx#L1131-L1138) — cutter click handler
- [src/components/manufacturing/manufacturing-role-queue.tsx:1184-1190](src/components/manufacturing/manufacturing-role-queue.tsx#L1184-L1190) — assembler click handler
- [src/components/manufacturing/manufacturing-role-queue.tsx:1225-1231](src/components/manufacturing/manufacturing-role-queue.tsx#L1225-L1231) — QC click handler
- Likely a `useTransition` and an `optimisticUpdate` helper around line 307

**Model/mode:** **Sonnet 4.6 in normal mode.** Standard React pattern. If the file is huge or has complex state, switch to Opus.

### Prompt to paste

```
In src/components/manufacturing/manufacturing-role-queue.tsx there are three click handlers around lines 1131, 1184, 1225 that mark a window as cut / assembled / qc-approved. They already do optimistic local updates, but the user still perceives latency because:
- The button doesn't visibly disable / change label until after the server returns
- A success toast (if any) only fires after the round-trip
- Errors are not surfaced clearly

Task:
1. Read the relevant section of the file (around lines 280–350 for state setup, and 1100–1240 for the three handlers).
2. Tighten optimistic UI for all three handlers so that on click:
   a) The row visually leaves the queue list immediately (or shows an inline "Marked — undoing if error" pill that disappears after success)
   b) The button becomes disabled and shows a subtle spinner during the transition
   c) On server error, roll back the optimistic state and show an error toast with the server message
   d) On success, no further visible work — the row should already be gone
3. Use the existing useTransition/useOptimistic pattern that the file already uses; do not invent a new state-management approach.
4. Do not change the server actions. This is purely a client-side perceived-latency fix.

Show me the diff before applying. After applying, walk me through the manual test steps to verify all three roles (cutter / assembler / qc).
```

---

# MEDIUM-EFFORT FIXES

Tackle these only after Fixes 1–3 ship and you measure that it's still too slow. They're more invasive.

---

## Fix 4 — Split the dashboard queue into critical (today/tomorrow) + deferred (rest)

**Why it matters:** Even with Fix 1, the persisted schedule for ALL future days is loaded on every dashboard render. For an installer pipeline weeks out, that's a lot of rows the cutter doesn't need to see immediately.

**Files involved:**
- [src/app/cutter/page.tsx](src/app/cutter/page.tsx), [src/app/assembler/page.tsx](src/app/assembler/page.tsx), [src/app/qc/page.tsx](src/app/qc/page.tsx)
- [src/components/manufacturing/manufacturing-role-queue.tsx](src/components/manufacturing/manufacturing-role-queue.tsx)
- `loadManufacturingRoleSchedule` in [src/lib/manufacturing-scheduler.ts](src/lib/manufacturing-scheduler.ts)

**Model/mode:** **Opus 4.7 in Plan mode.** Touches data-loading shape; needs careful Suspense boundary placement.

### Prompt to paste

```
Goal: split each role dashboard (/cutter, /assembler, /qc) into two data fetches so the user sees today's queue immediately and the longer horizon streams in.

Background:
- After Fix 1, the dashboard reads persisted schedule data (no live recomputation on render).
- loadManufacturingRoleSchedule in src/lib/manufacturing-scheduler.ts still returns the full schedule horizon. We want to reduce what blocks first paint.

Task — do steps in order, do not skip:

1. INVESTIGATE: read loadManufacturingRoleSchedule and understand its return shape. What does the queue component (manufacturing-role-queue.tsx) consume? Is the data grouped by date already, or does the component group it client-side?

2. PROPOSE a split:
   - "Critical" slice: items scheduled for today + tomorrow (or whatever "now" means for that role). Loaded synchronously on the page.
   - "Deferred" slice: everything else. Loaded inside a <Suspense> boundary with a skeleton.
   - If the queue UI is one big list that needs the full data to sort/group, propose a UI change too — e.g. a "Today / Tomorrow / Upcoming" tabbed view, where Upcoming is the suspended slice.

3. Identify any aggregations (counts, capacity bars, etc.) that need the FULL dataset — those need a separate loader or accept "eventually consistent" once the deferred slice arrives.

4. Show me the plan including:
   - New loader signatures (e.g. loadManufacturingRoleScheduleCritical, loadManufacturingRoleScheduleDeferred)
   - Which RSC components vs client components own each slice
   - Where Suspense boundaries go
   - Migration risks (e.g. if a feature relies on having the full schedule synchronously)

5. Wait for my approval before editing.

This is invasive — be conservative. If a clean split isn't possible without rewriting the queue component, say so and propose the smallest safe alternative (e.g. a row-count cap with a "load more" button).
```

---

## Fix 5 — Coalesce schedule reflows so a burst of mark-actions reflows once, not N times

**Why it matters:** A cutter marking 20 windows in a minute triggers 20 full-schedule reflows. Each one is independent and each `after()` callback runs the full scheduler against the same DB. We can dedupe.

**Files involved:**
- [src/app/actions/production-actions.ts:38-59](src/app/actions/production-actions.ts#L38-L59) — `scheduleManufacturingFollowUp()`
- [src/lib/manufacturing-scheduler.ts](src/lib/manufacturing-scheduler.ts) — `reflowManufacturingSchedules()`

**Model/mode:** **Opus 4.7 in Plan mode.** Concurrency + cache invalidation correctness. Easy to introduce subtle bugs (stale schedule, lost updates).

### Prompt to paste

```
Goal: prevent N full schedule reflows when a user marks N windows in quick succession. The scheduler does not need to run per-action; running it once per burst gives the same result.

Read first:
- src/app/actions/production-actions.ts lines 38–59 (scheduleManufacturingFollowUp)
- src/lib/manufacturing-scheduler.ts — find reflowManufacturingSchedules (~line 701) and understand what it reads/writes and whether it is idempotent.

Constraints — verify each before designing:
1. Is reflowManufacturingSchedules() idempotent — i.e. running it twice with no DB changes between produces the same result?
2. Does it ALWAYS read fresh data from the DB at the start? (i.e. the result depends only on current DB state, not on which mark-action triggered it)
3. Are there any side effects keyed off the `scheduleReason` arg ("mark_cut" / "mark_assembled" / "mark_qc") that would be lost if we coalesce?

If all three are true, propose a coalescing strategy. Options to consider:
A) Per-request-batch dedupe: within a single Next.js server action invocation, only schedule one after() callback no matter how many marks happened. (Helps if the client batches calls.)
B) Process-level debounce with leading + trailing edge: a module-level promise that delays reflow by ~500ms; subsequent calls within the window collapse into the existing pending reflow. (Helps if the client makes separate sequential calls.)
C) DB-row-based queue: write a "reflow_pending" row, have a single worker drain it. (Heaviest option — only consider if A and B both have correctness gaps.)

For each option:
- Risks (stale data shown to users, lost notifications, race with concurrent writers)
- How to test it
- Rollout (feature flag? gradual?)

Show me the analysis and your recommendation. Do NOT edit yet — coalescing has subtle correctness pitfalls and I want to read the design first.

If you find that reflowManufacturingSchedules is NOT idempotent or depends on the scheduleReason for behavior other than logging, stop and report — that changes the whole approach.
```

---

# Optional cleanup (only if metrics show it matters)

## Sign-in role lookup — only relevant on the unhappy path

The 5-table role lookup in [src/lib/auth.ts:35-59](src/lib/auth.ts#L35-L59) only fires when a user has no `user_profiles` row (PGRST116) or the lookup errors. The HAPPY path is a single `user_profiles.select` at [line 103](src/lib/auth.ts#L103). So this is **not** the sign-in bottleneck for established users.

**Only do this if:** logs show many users hitting the PGRST116 / unexpected-error path (e.g. new signups, schema migration in flight).

**Model/mode:** Sonnet 4.6, normal mode.

### Prompt to paste (only if metrics warrant it)

```
In src/lib/auth.ts, inferRoleFromLinkedAccount (lines 35–59) runs five Supabase queries to figure out which role table a user belongs to. This only triggers on the unhappy path (missing user_profiles row), but if it's hot, we should cache the result.

Task: when getCurrentUser() (line 79) auto-creates a user_profiles row at line 136, also write the inferred role into auth.users.user_metadata via supabase.auth.updateUser({ data: { role } }). Then on next sign-in, normalizeUserRole(user.user_metadata.role) at line 65 will short-circuit and skip the 5-query lookup entirely.

Constraints:
- Do not change behavior for the happy path (user_profiles row exists).
- If the metadata write fails, do NOT fail the whole request — log and continue.
- Confirm RLS / auth client allows updateUser from server context here. If it doesn't, propose an alternative (e.g. an admin-context update via service role) and ask before using the service role.

Show me the diff and explain how to verify the cache hit on the next login.
```

---

# Suggested order

1. **Fix 1** — biggest sign-in win, ship first, measure
2. **Fix 2** — trivial, ship same PR or right after
3. **Fix 3** — UX win, ship independently so it's easy to revert if it surfaces a bug
4. *Measure.* If sign-in and "queue as cutter" feel snappy, stop here.
5. **Fix 4** + **Fix 5** — only if measurements still show problems

For each fix: branch off `main`, ship as its own PR, manually click through the affected flow on the dev server before merging.
