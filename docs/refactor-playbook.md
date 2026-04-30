# FSR Blinds — Refactor Playbook

> **Author**: planning session 2026-04-30
> **Audience**: future-you handing tactical prompts to a less-capable AI
> **Codebase rating going in**: 6 / 10 — broad but shallow
> **Goal**: deepen modules, raise testability, reduce blast radius

---

## ⚠️ READ THIS BEFORE TOUCHING ANYTHING

This codebase has **NO staging environment** — every merge to `main` hits production. You are **solo**. You may be **away for weeks** at a time and unable to revert. Therefore:

1. **Every change is additive first, destructive later.** Old code stays in place (commented `// LEGACY:`) until the new code has been live and quiet for ≥ 7 days.
2. **One phase per week, max.** Do not stack changes.
3. **Do not start any phase numbered ≥ 5 within 14 days of a planned absence.** They take a full day and benefit from a 1-week soak window before you fly.
4. **Manual smoke test after every commit.** No exceptions. Click through the role(s) the change touches.
5. **`git revert` is your friend. `git reset --hard` is forbidden.** Always make a *new* commit that undoes a bad commit. Never rewrite history.

---

## 📊 Phase summary

| # | Phase | Risk | Time | Model | Defer if traveling? |
|---|---|---|---|---|---|
| 1 | Documentation foundation | 🟢 None | 45 min | Haiku 4.5 | No |
| 2 | Inline `manufacturing-process.ts` only | 🟡 Low | 1 hr | Sonnet 4.6 | No |
| 3 | Revalidation registry | 🟡 Low–Med | 1/2 day | Sonnet 4.6 | No |
| 4 | Scheduler pure/effect split | 🟡 Med | 1 day | Opus 4.7 | No |
| **STOP-GATE** | **Do not proceed beyond here within 14 days of any absence** | | | | |
| 5 | Split `fsr-data.ts` (2,533 lines) | 🟠 High | 1 day | Opus 4.7 | **Yes** |
| 6 | Photo-upload orchestration | 🟠 High | 1 day | Opus 4.7 | **Yes** |
| 7 | Per-feature loaders (`server-data.ts`) | 🟠 High | 1 day | Opus 4.7 | **Yes** |
| 8 | Decompose `manufacturing-role-queue.tsx` | 🔴 Highest | 1.5 days | Opus 4.7 | **Yes** |
| 9 | Repository layer (Supabase) | DEFER | — | — | **DO NOT START** |

Phase 9 is intentionally not scripted. It's a multi-week effort that needs in-person planning sessions, not a copy-paste prompt pack. Revisit after Phases 1–8 are landed and have soaked.

---

## 🔁 UNIVERSAL PREAMBLE — paste FIRST in every new AI session

```
You are working on the FSR Blinds Next.js + Supabase codebase at
/Users/sergeikorolev/5. Vibe coding/260322-FSRblinds.

HARD RULES — DO NOT VIOLATE:
1. Make ONE file change at a time. After each change, STOP and wait for me to type "next".
2. Never delete code without ALL THREE of: (a) grep confirms zero callers,
   (b) `npx tsc --noEmit` is clean, (c) the deletion is its own standalone commit.
   When any condition is unclear, STOP and ask me.
3. After every file edit, run `npx tsc --noEmit` and paste the FULL output.
4. If `tsc` produces ANY new error: run `git diff <file>`, paste the full diff,
   and STOP. Do NOT revert anything yourself — I will decide.
5. NEVER run: rm -rf, git reset --hard, git push --force, npm uninstall, supabase migrations.
6. NEVER edit: package.json, .env*, supabase/, next.config.ts, middleware.ts,
   tsconfig.json, anything under supabase/migrations/, anything ending in .sql.
7. NEVER call `revalidatePath` with a path that doesn't already appear in the codebase.
8. NEVER import from `src/app/` inside a `src/lib/` file. lib/ is below app/ in the
   dependency stack — that direction is forbidden.
9. If you are unsure about ANYTHING, stop and ask. Do not guess.
10. Before starting work, run `git status`. If there are uncommitted changes you
    didn't make, STOP and ask me.
11. Do not run `npm run dev` or `npm run build` unless I tell you to.
    `npx tsc --noEmit` is your only check.

When I say "commit", run:
  git add -A && git commit -m "<message>"

Confirm you've read these rules by replying with the words "Rules acknowledged"
before doing anything else.
```

---

## 🚦 ONE-TIME PRE-FLIGHT (do this YOURSELF, in terminal)

```bash
cd "/Users/sergeikorolev/5. Vibe coding/260322-FSRblinds"
git status                          # MUST be clean
git checkout -b refactor/safe-wins
npx tsc --noEmit > baseline-tsc.txt 2>&1
echo "exit=$?"                      # MUST be 0
wc -l baseline-tsc.txt              # save this number
npm test                            # confirm tests pass
```

When the AI asks "what's the baseline", paste `baseline-tsc.txt` (or just say "0 errors, X lines of output"). Every later check must match.

---

# PHASE 1 — Documentation foundation

**Risk: 🟢 None.** Pure new files. Cannot break anything.
**Model: Haiku 4.5** • **Thinking: off** • **Time: 45 min**

### SESSION 1.1 — Create `docs/CONTEXT.md`

Paste preamble, then:

```
TASK: Create ONE new file at docs/CONTEXT.md. Do not modify any existing file.

Step A — Read these files (read-only, no edits):
  - src/lib/server-data.ts
  - src/lib/progress-snapshot.ts (skim, top 100 lines is enough)
  - src/lib/manufacturing-scheduler.ts (skim, top 100 lines is enough)
  - src/components/windows/window-form.tsx (skim for domain terms only)

Step B — Write docs/CONTEXT.md with EXACTLY these sections, in this order:

# FSR Blinds — Domain Context

## Entities
(One short paragraph each, plain English. Include AT LEAST: Building, Unit,
 Room, Window, MediaUpload. Add others ONLY if you saw them clearly in source.)

## Roles
(One paragraph each: owner, scheduler, installer, cutter, assembler, qc,
 manufacturer. Describe what the human in that role does day-to-day, NOT what
 the code does.)

## Lifecycle stages
(Bulleted list of stages a Window passes through. Use the exact stage names
 you found in the source. Do not invent stages.)

Step C — Run `git status` and paste output. STOP.

CONSTRAINTS:
- Do NOT invent terminology. Only use words you literally saw in source files.
- If you can't find a clear definition, write "TODO: confirm with Sergei" instead of guessing.
- Maximum 400 lines total.
```

**Verify**: read the file. Fix any "TODO" lines manually.
**Commit**: `git add docs/CONTEXT.md && git commit -m "docs: add CONTEXT.md domain glossary"`

---

### SESSION 1.2 — Seed `docs/adr/`

Paste preamble, then:

```
TASK: Create folder docs/adr/ and exactly THREE files inside.

Each file uses this template:

  # ADR-NNNN: <title>

  ## Status
  Accepted (2026-04-30)

  ## Context
  (2–4 sentences describing the situation that forced the decision.)

  ## Decision
  (1–3 sentences stating exactly what was decided.)

  ## Consequences
  (Bullet list: what becomes easier, what becomes harder.)

Files to create:

1. docs/adr/0001-server-actions-over-api-routes.md
   Decision: We use Next.js Server Actions for mutations, not /api routes.
   Evidence: only one /api route exists (src/app/api/cron/daily-snapshot/route.ts).

2. docs/adr/0002-supabase-joins-in-javascript.md
   Decision: Joins between Supabase tables happen in JS mappers, not in SQL.
   Evidence: src/lib/server-data.ts performs sequential .from() reads then joins in TS.

3. docs/adr/0003-role-based-portal-segments.md
   Decision: Each user role has its own /<role>/ segment under src/app/.
   Evidence: directories management/, scheduler/, installer/, cutter/, assembler/,
   qc/, manufacturer/.

Each ADR ≤ 60 lines. Do not modify any existing file. After writing, run
`git status` and paste output. STOP.
```

**Verify**: review all three. **Commit**: `git commit -m "docs: seed initial ADRs"`

---

# PHASE 2 — Inline shallow utilities

**Risk: 🟡 Low.** Mechanical, but a wrong import path will fail typecheck.
**Model: Sonnet 4.6** • **Thinking: medium** • **Time: 1 hr**

> **Scope reduced after review**: The original plan included inlining `role-routes.ts` and `unit-install-guard.ts`. Both survive the deletion test — `role-routes.ts` owns a role→path mapping that would scatter across N callers if removed (worse locality), and `unit-install-guard.ts` almost certainly encodes a business invariant. Inlining them would make the codebase *shallower*, not deeper. Only `manufacturing-process.ts` qualifies — it is a pure 22-line re-export with no added contract.

### SESSION 2.1 — Inline `src/lib/manufacturing-process.ts`

Paste preamble, then:

```
TASK: Inline a 22-line re-export file. Multiple sub-steps. Stop at every checkpoint.

Step A (READ-ONLY):
  1. Read src/lib/manufacturing-process.ts in full. Tell me what it re-exports
     and from which file.
  2. Run: grep -rn "from ['\"].*manufacturing-process['\"]" src --include="*.ts" --include="*.tsx" --include="*.mts"
  3. Run: grep -rn "from ['\"].*lib/manufacturing-process['\"]" src --include="*.ts" --include="*.tsx" --include="*.mts"
  4. Combine results into a numbered list of importers (file path + line). Show me.
  5. STOP. Wait for "next".

[after I say "next"]

Step B — For EACH importer, in order:
  1. Edit ONLY that one file. Change its import path from
     "@/lib/manufacturing-process" (or relative equivalent) to point at the
     underlying file that manufacturing-process.ts re-exports from.
  2. Do NOT change anything else. Not whitespace. Not other imports. Not logic.
  3. Run `npx tsc --noEmit`. Paste the FULL output.
  4. If output matches baseline (0 new errors), STOP and wait for "next".
  5. If output has new errors, run `git diff <file>`, paste it, and STOP.
     Do NOT revert anything yourself.

Step C (after ALL importers migrated):
  1. Run: grep -rn "manufacturing-process" src
  2. If the only remaining hits are inside src/lib/manufacturing-process.ts
     itself (and not its tests), tell me — I will delete the file manually.
  3. STOP.

CONSTRAINTS:
- Never batch multiple files in one edit. One file → tsc → stop.
- Never change a function body. Only import paths.
```

**Smoke test**: `npm run dev`, click into manufacturing screens (cutter, assembler, qc) — confirm they render.
**You delete the file**: `git rm src/lib/manufacturing-process.ts`
**Commit**: `git commit -m "refactor: inline manufacturing-process re-export shim"`

---

---

# PHASE 3 — Revalidation registry

**Risk: 🟡 Low–Medium (purely additive).**
**Model: Sonnet 4.6** • **Thinking: high** • **Time: half day**

### SESSION 3.1 — Inventory (READ-ONLY)

Paste preamble, then:

```
TASK: Read-only audit. Do NOT edit any file in this session.

Step A:
  Read src/app/actions/revalidation.ts in full. List every exported function
  and, for each, every revalidatePath() call inside (path string + tag).

Step B:
  Run: grep -rn "revalidatePath(" src/app/actions --include="*.ts"

Step C:
  Produce ONE markdown table with columns:
    file | line | path argument | tag (if any) | enclosing function name
  Sort by file, then line.

Step D:
  After the table, list DISTINCT path patterns (deduplicated). Group by entity
  (unit, window, room, media, manufacturing queue, management dashboard).

Output everything in your reply. Do not write any file. STOP.
```

**You do**: save the table to `docs/refactor/revalidation-audit.md` manually.

---

### SESSION 3.2 — Create the registry (additive only)

Paste preamble, then:

```
TASK: Create ONE new file: src/lib/invalidation/registry.ts. Do not modify any existing file.

Use the audit I'm pasting below to build the file:

[PASTE THE TABLE FROM SESSION 3.1 HERE]

Required exports:

  export type InvalidationEvent =
    | { kind: "unit.updated"; unitId: string }
    | { kind: "unit.window.changed"; unitId: string; windowId: string }
    | { kind: "unit.room.changed"; unitId: string; roomId: string }
    | { kind: "unit.media.changed"; unitId: string }
    | { kind: "manufacturing.queue.changed" }
    | { kind: "management.dashboard.changed" };

  export function invalidate(event: InvalidationEvent): void;

CRITICAL:
- The implementation must call revalidatePath() with the EXACT SAME path
  strings already used in the audit. Do not invent new paths.
- For each kind, use the union of paths you saw in the audit for that
  conceptual operation.
- Add a top-of-file comment:
    // Additive — old revalidation.ts still in use; migrate callers one at a time.

After writing:
  1. Run `npx tsc --noEmit`. Paste output.
  2. Run `git status`. Paste output.
  3. Confirm: only ONE new file exists, no other file is modified.

STOP.
```

**Commit**: `git commit -m "feat(invalidation): add additive entity-event invalidation registry"`

---

### SESSION 3.3 — Pilot migration (smallest caller)

Paste preamble, then:

```
TASK: Migrate ONE file as a pilot for the new invalidate() registry.

Target: src/app/actions/label-print-actions.ts

Step A — Read the file. List every revalidatePath() call (line + path + function).

Step B — For EACH call, propose the equivalent invalidate({ kind: ... }) using
these mappings (refer to src/lib/invalidation/registry.ts):
  - paths under /management/... touching a unit listing → "management.dashboard.changed"
  - paths matching /units/[unitId]/... → "unit.updated" with that unitId
  - paths matching /manufacturer or /qc or /cutter or /assembler queues → "manufacturing.queue.changed"
  - anything else → STOP and ask me.

Show me your proposed mapping table. STOP. Wait for "approved".

[after "approved"]

Step C — Edit the file:
  1. Add: import { invalidate } from "@/lib/invalidation/registry";
  2. ABOVE each revalidatePath() line, insert the invalidate() call.
  3. Comment-out (do NOT delete) the original revalidatePath() with
     "// LEGACY: replaced by invalidate() above".
  4. Keep the existing `import { revalidatePath } from "next/cache"` for now.

Step D — Verify:
  1. `npx tsc --noEmit` — paste output.
  2. `git diff src/app/actions/label-print-actions.ts` — paste it.
  3. STOP.
```

**Smoke test**: print a label end-to-end. Confirm UI refreshes.
**Commit**: `git commit -m "refactor: migrate label-print-actions to invalidate() registry (pilot)"`

---

### SESSIONS 3.4–3.8 — Migrate remaining callers

Repeat 3.3 once per file, smallest first:

1. `src/app/actions/post-install-issue-actions.ts` (233 lines)
2. `src/app/actions/production-actions.ts` (417 lines)
3. `src/app/actions/manufacturing-actions.ts` (682 lines)
4. `src/app/actions/management-actions.ts` (968 lines)
5. `src/app/actions/auth-actions.ts` (1,132 lines)

For `fsr-data.ts` (2,533 lines), do it in **Phase 5** instead — that's the file split phase.

**One commit per file. Manual smoke test after each.**

---

### SESSION 3.9 — Cleanup (do this YOURSELF after all callers migrated AND have soaked ≥ 7 days)

```bash
grep -rn "from .*actions/revalidation" src --include="*.ts" --include="*.tsx"
# Only LEGACY-commented imports should remain.
# Manually remove the // LEGACY: lines, file by file.
npx tsc --noEmit
npm run build
git commit -m "refactor: remove legacy revalidation.ts after registry migration"
```

If anything fails: `git revert HEAD` (don't try to fix forward).

---

# PHASE 4 — Scheduler pure/effect split

**Risk: 🟡 Medium. Logic intricate but contained.**
**Model: Opus 4.7** • **Thinking: high** • **Time: 1 day**

### SESSION 4.1 — Audit (READ-ONLY)

Paste preamble, then:

```
TASK: Read-only audit of src/lib/manufacturing-scheduler.ts (1,079 lines).
Do NOT edit anything.

Step A: Read the entire file. List every top-level function (exported and not).

Step B: For each function, classify it:

  PURE:
    - Returns a value
    - No supabase calls
    - No fetch / network
    - No console.* (warn/log allowed only if commented as debug)
    - No reads of Date.now() or `new Date()` UNLESS passed in as a parameter
    - No reads of process.env
    - Does not mutate any argument
    - Does not call any other function in this file that is impure

  IMPURE:
    Anything not pure.

  UNCERTAIN:
    Anything you can't be 100% sure about. List explicitly — I'd rather you
    flag than guess.

Step C: For each function, list which other functions in this file it calls.

Step D: Produce a final markdown report with three tables (PURE / IMPURE /
UNCERTAIN). Below them, list any function whose pureness depends on assumptions.

Output in reply. Do not write any file. STOP.
```

**You do**: review every UNCERTAIN entry. Tell the AI in plain words how to classify each.

---

### SESSION 4.2 — Copy all pure functions into `pure.ts` (additive — originals stay)

Paste preamble, then:

```
TASK: COPY all pure functions from src/lib/manufacturing-scheduler.ts into a
new file src/lib/scheduler/pure.ts. Do NOT cut them — originals stay in place.

Approved PURE list (from Session 4.1):
  [PASTE THE FINAL CONFIRMED LIST HERE]

Step 1: Create src/lib/scheduler/pure.ts with header:
          // Pure scheduling logic — no I/O, no Date.now(), no global state.

Step 2: COPY every function on the approved list into pure.ts.
        Preserve EXACT whitespace, comments, and JSDoc.

Step 3: At the top of pure.ts, add all import statements the functions need.
        Copy import lines exactly as they appear in manufacturing-scheduler.ts.

Step 4: Do NOT add re-exports in manufacturing-scheduler.ts. Do NOT modify
        manufacturing-scheduler.ts at all in this session.

Step 5: `npx tsc --noEmit` — paste output. STOP.

CONSTRAINTS — INVIOLABLE:
- Do NOT change a single character of any function body.
- Do NOT change any signature.
- Do NOT import from src/app/ in pure.ts.
- If a pure function calls a helper that is also pure, copy the helper too.
```

**Verify**: `git diff src/lib/manufacturing-scheduler.ts` → must be empty (file untouched).
**Commit**: `git add src/lib/scheduler/pure.ts && git commit -m "refactor(scheduler): copy pure functions into scheduler/pure.ts (additive)"`

---

### SESSION 4.3 — Tests for `pure.ts` (tests gate the next step)

Paste preamble, then:

```
TASK: Create src/lib/scheduler/pure.test.mts. Do not modify any other file.

Step A — Read these to learn the repo's test conventions:
  - src/lib/escalation-helpers.test.mts
  - src/lib/dataset-mappers.test.mts
  - package.json — "scripts" section only

Step B — Tell me:
  1. Test runner used?
  2. Exact test command from package.json?
  3. Import style used by existing tests?
  STOP and wait for "approved".

[after "approved"]

Step C — Write src/lib/scheduler/pure.test.mts with:
  - Imports from src/lib/scheduler/pure.ts (NOT from manufacturing-scheduler.ts)
  - 3 tests minimum per pure function
  - Cover: happy path, empty input, boundary value
  - Match style and import conventions from step A exactly

Step D — Run the test command. Paste FULL output. STOP.

CONSTRAINTS:
- Do NOT modify pure.ts to make tests pass. Tests must work as-is.
- If a function's behavior is unclear, write `test.todo("...")` instead of guessing.
- If a test fails, do NOT fix pure.ts. Tell me which test failed and why.
```

**Commit**: `git commit -m "test(scheduler): add unit tests for pure scheduler module"`

---

### SESSION 4.4 — Replace originals with re-exports (tests gate each step)

> Run only after 4.3 tests are green. Confirm with `npm test` before starting.

Paste preamble, then:

```
TASK: Replace each pure function body in src/lib/manufacturing-scheduler.ts
with a re-export statement pointing to pure.ts. ONE FUNCTION AT A TIME.

Per function:
  Step 1: Find the function in manufacturing-scheduler.ts. Show me the full
          signature + JSDoc (not the body). STOP. Wait for "next".

  Step 2: Replace the entire function (JSDoc + function keyword + body) with:
            export { functionName } from "./scheduler/pure";

  Step 3: `npx tsc --noEmit` — paste output.

  Step 4: `npm test` — paste output.

  Step 5: If BOTH are clean, STOP and wait for "next".
          If either fails, run `git diff src/lib/manufacturing-scheduler.ts`,
          paste it, and STOP. Do NOT revert anything yourself.

CONSTRAINTS:
- Do NOT change pure.ts.
- Do NOT change any caller of manufacturing-scheduler.ts.
- The re-export must use the exact same exported name as the original.
```

**After all functions replaced:**
```bash
npx tsc --noEmit   # clean
npm test           # green
```
**Commit**: `git commit -m "refactor(scheduler): replace pure function bodies with re-exports to pure.ts"`

---

# 🛑 STOP-GATE

**Phases 1–4 above are the safe wins.** If you can do these and ship, the codebase moves from 6/10 to ≈ 7/10 with very low risk.

**Phases 5–8 below carry meaningful regression risk.** Before starting any of them, confirm:

- [ ] You will be physically reachable for at least 7 days after merge.
- [ ] You have completed all of Phases 1–4 and they have soaked in production for ≥ 7 days.
- [ ] You have done the manual smoke-test list (below) successfully on the current `main`.
- [ ] You are not within 14 days of any planned absence.

If any box is unchecked, **stop here**.

### Master smoke-test checklist (run before AND after any Phase 5–8 change)

For EACH role (owner, scheduler, installer, cutter, assembler, qc, manufacturer):
1. Log in. Confirm post-login lands on correct home page.
2. Open one Unit. Confirm it renders with rooms/windows.
3. Open one Window. Confirm photos display.
4. Trigger one mutation appropriate to the role (e.g. installer marks bracketed; cutter marks cut).
5. Confirm UI refreshes after the mutation.
6. Log out.

Total: ~30 min.

---

# PHASE 5 — Split `fsr-data.ts` (2,533 lines)

**Risk: 🟠 High. Touched by every page.**
**Model: Opus 4.7** • **Thinking: high** • **Time: 1 day, single sitting**

The file is **already grouped by domain** (notifications/auth → bulk → unit → room → window → media), with JSDoc and `@deprecated` markers. Splitting is mechanical, but every page imports from it.

### Strategy: barrel re-export

We do **NOT** change any caller. We split the file's *contents* into 5 sub-files, then make the original `fsr-data.ts` re-export everything. Callers continue to `import { foo } from "@/app/actions/fsr-data"` — they neither know nor care that the implementation moved.

### SESSION 5.1 — Audit (READ-ONLY)

```
TASK: Read-only audit of src/app/actions/fsr-data.ts (2,533 lines).
Do NOT edit anything.

Step A: Read the entire file. Produce a markdown table with columns:
  line range | exported name | category | description (1 line)

Categories must be ONE of:
  - bulk     (operations across many entities, e.g. bulkAssignUnits)
  - unit     (createUnit, updateUnitStatus, etc.)
  - room     (createRoomsForUnit, updateRoomName, deleteRoom, etc.)
  - window   (createWindowWithPhoto, updateWindowWithOptionalPhoto, deleteWindow)
  - media    (uploadXxxPhoto, deleteXxxPhoto, deleteWindowMediaItem)
  - notification (markNotificationRead, markAllNotificationsRead)
  - helper   (non-exported functions used internally)

Step B: List every IMPORT at the top of fsr-data.ts.

Step C: List every helper function (non-exported) and which exported functions
use it.

Step D: Identify any function that crosses categories (e.g. an "upload" that
also mutates window status — categorize as "media" but flag it).

Output in reply. Do not write any file. STOP.
```

**You do**: review the audit. Confirm category assignments. Push back on anything weird.

### SESSION 5.2 — Create sub-files (additive, by category)

```
TASK: Create new files under src/app/actions/fsr/, ONE category at a time.
Do NOT modify fsr-data.ts yet.

Approved category list (from Session 5.1):
  [PASTE FINAL CATEGORIES + EXPORTED NAMES]

For category "notification" (smallest, do first):
  Step 1: Create src/app/actions/fsr/notification.ts.
  Step 2: At the top, COPY all imports from fsr-data.ts that this file's
          functions need (be conservative — copy more than needed; we'll
          remove unused later).
  Step 3: Add the file-level "use server" directive at line 1.
  Step 4: COPY (do not cut yet) every function in the "notification" category
          from fsr-data.ts into this new file. Preserve EXACT whitespace,
          comments, JSDoc, types.
  Step 5: COPY any helper functions used only by notification functions.
  Step 6: Run `npx tsc --noEmit`. Paste output.
  Step 7: STOP. Wait for "next".

Continue with categories in this order: notification, bulk, room, window, media, unit.

CONSTRAINTS — INVIOLABLE:
- COPY, do not cut. fsr-data.ts must remain untouched in this session.
- Each new file must compile in isolation.
- If a function uses a helper, the helper goes in the SAME file as its only
  caller. If multiple categories use the same helper, COPY it into each
  (we'll dedupe later).
- Do NOT add a "use server" directive to helper-only files (only to files
  that export server actions).
```

After all 6 sub-files created:

```
Final check:
  1. `npx tsc --noEmit` — paste output.
  2. Run `ls src/app/actions/fsr/` — list files.
  3. STOP.
```

**No commit yet.** Nothing has changed for callers.

### SESSION 5.3 — Convert `fsr-data.ts` to a barrel

```
TASK: Convert src/app/actions/fsr-data.ts into a barrel file that re-exports
from src/app/actions/fsr/*.ts.

Step 1: Show me the current file's exports. List every name.

Step 2: For each exported name, find which sub-file in src/app/actions/fsr/
contains its implementation. Build a mapping table. STOP and wait for
"approved".

[after "approved"]

Step 3: Replace the ENTIRE contents of fsr-data.ts with:
  - A "use server" directive at line 1
  - A top comment: "// Barrel re-export. Implementations in src/app/actions/fsr/*"
  - One `export { fnName } from "./fsr/<file>"` line per exported name
  - Nothing else. No imports. No bodies. No helpers.

Step 4: `npx tsc --noEmit` — paste output.
Step 5: `git diff src/app/actions/fsr-data.ts` — paste.
Step 6: STOP.

CONSTRAINTS:
- Do NOT add new exports.
- Do NOT remove any existing export name.
- Order exports alphabetically.
```

**Manual smoke test**: run the FULL master checklist. All 7 roles. ~30 min.
**Commit**: `git commit -m "refactor: split fsr-data.ts into per-domain modules under fsr/"`

### SESSION 5.4 — Migrate revalidation calls in fsr/* (continuation of Phase 3)

For each of the 6 new sub-files, run the Session 3.3 prompt template, treating it like a normal caller migration. One commit per file.

### SESSION 5.5 — (Later, ≥ 7 days after 5.3) Dedupe helpers

Don't do this in the same week. Once everything is stable, ask the AI to find duplicated helper functions across `src/app/actions/fsr/*.ts`, propose moving them to `src/app/actions/fsr/_shared.ts`, one helper at a time. Standard ONE-FILE-AT-A-TIME pattern.

---

# PHASE 6 — Photo-upload deep module

**Risk: 🟠 High. Photo-upload bugs are user-visible and orphaned storage objects are painful to clean up.**
**Model: Opus 4.7** • **Thinking: high** • **Time: 1 day**

**Architecture**: `src/lib/` must NOT import from `src/app/`. The correct shape is a genuine deep module in `lib/photo-upload/` that server actions call *into* — the dependency arrow points downward.

| Layer | Owns |
|---|---|
| `src/app/actions/fsr/media.ts` (server actions) | Auth check, building the upload spec, calling the lib, calling `revalidatePath` |
| `src/lib/photo-upload/` (deep module) | Validation, compression, storage upload, media row insert, entity patch, activity log insert |

The 4 server actions become thin adapters on top of the lib. The lib knows nothing about routes or auth.

### SESSION 6.1 — Behavior diff audit (READ-ONLY)

```
TASK: Read-only audit. Do NOT edit anything.

Read these 4 server actions from src/app/actions/fsr/media.ts
(or src/app/actions/fsr-data.ts if Phase 5 is not yet done):
  - uploadUnitStagePhotos
  - uploadWindowPostBracketingPhoto
  - uploadWindowInstalledPhoto
  - uploadRoomFinishedPhotos

Produce a comparison table with rows = behaviors, columns = the 4 actions:
  - validates image? (Y/N + how)
  - compresses image? (Y/N + library used)
  - storage bucket name
  - storage path pattern
  - media_uploads fields set (list each field and value pattern)
  - inserts activity_log row? (Y/N + fields)
  - patches parent entity? (table + fields)
  - error rollback? (deletes uploaded blob if DB insert fails?)

Then list plainly: which behaviors are IDENTICAL across all 4, which DIFFER.

Output in reply. Do not write any file. STOP.
```

**You do**: save to `docs/refactor/photo-upload-diff.md`.

### SESSION 6.2 — Create `lib/photo-upload/types.ts` and `validate.ts`

```
TASK: Create TWO new files. Do NOT edit any existing file.

Using the diff table pasted below:
  [PASTE DIFF TABLE FROM 6.1]

File 1: src/lib/photo-upload/types.ts

  Export a discriminated union PhotoUploadSpec with one variant per upload flow.
  Each variant must contain ALL the data the corresponding server action currently
  hardcodes inline (storage bucket, path pattern, media_uploads field values,
  activity log entry fields, entity patch fields):

  export type PhotoUploadSpec =
    | {
        kind: "unit-stage";
        unitId: string;
        stage: <copy the exact stage union type from existing code>;
        bucket: string;
        storagePath: string;
        mediaFields: { <exact fields from audit> };
        activityLog?: { <fields if audit shows activity log, else omit> };
      }
    | { kind: "window-post-bracketing"; windowId: string; unitId: string;
        bucket: string; storagePath: string; mediaFields: { ... }; activityLog?: { ... }; }
    | { kind: "window-installed"; /* same pattern */ }
    | { kind: "room-finished"; /* same pattern */ };

File 2: src/lib/photo-upload/validate.ts

  Export pure validation functions extracted from the existing server actions.
  No supabase. No network. No React.
  Returns { ok: true } | { ok: false; error: string }.

CONSTRAINTS:
- Do NOT import from src/app/ in either file.
- Do NOT call supabase in either file.
- After creating both: `npx tsc --noEmit` — paste output. STOP.
```

**Commit**: `git add src/lib/photo-upload/ && git commit -m "feat(photo-upload): add PhotoUploadSpec type and pure validators"`

### SESSION 6.3 — Create `lib/photo-upload/execute.ts`

```
TASK: Create src/lib/photo-upload/execute.ts. Do NOT edit any existing file.

Export:

  import type { SupabaseClient } from "@supabase/supabase-js";
  import type { PhotoUploadSpec } from "./types";

  export type PhotoUploadResult =
    | { ok: true; mediaIds: string[] }
    | { ok: false; error: string };

  export async function executePhotoUpload(
    supabase: SupabaseClient,
    files: File[],
    spec: PhotoUploadSpec,
  ): Promise<PhotoUploadResult>

Implementation — in this order:
  1. Validate files using validate.ts functions. Return { ok: false } on failure.
  2. Compress each file if the audit showed compression for this kind.
  3. Upload to supabase.storage using spec.bucket and spec.storagePath.
     On storage error: return { ok: false, error: ... }. Do NOT throw.
  4. Insert row(s) into media_uploads using spec.mediaFields.
     On DB error: delete the uploaded blob (rollback), return { ok: false }.
  5. If spec.activityLog is defined, insert into activity_log.
  6. Patch the parent entity if spec requires it.
  7. Return { ok: true, mediaIds: [...] }.

CONSTRAINTS:
- Do NOT call revalidatePath. Revalidation stays in the server action.
- Do NOT call createClient(). The supabase client is injected by the caller.
- Do NOT import from src/app/.
- Handle every error path explicitly — no unhandled promise rejections.

After creating: `npx tsc --noEmit` — paste output. STOP.
```

**Commit**: `git add src/lib/photo-upload/execute.ts && git commit -m "feat(photo-upload): add executePhotoUpload IO module"`

### SESSION 6.4 — Pilot: refactor `uploadWindowPostBracketingPhoto`

```
TASK: Refactor ONE server action to use the new photo-upload lib.

Target: uploadWindowPostBracketingPhoto in src/app/actions/fsr/media.ts

Step A — Read the current implementation. Extract:
  - How files/formData arrive as parameters
  - The storage bucket and path pattern
  - The media_uploads fields it sets
  - The activity_log entry it creates (if any)
  - The entity patch it performs (if any)
  - The revalidatePath calls it makes

Show me this as a structured list. STOP.

[after "approved"]

Step B — Refactor the function body to:
  1. Keep auth check at the top (unchanged).
  2. Call validatePhotoUpload() from src/lib/photo-upload/validate.ts. Return early on failure.
  3. Build a spec: const spec: PhotoUploadSpec = { kind: "window-post-bracketing", ... }
     using the exact field values you extracted in step A.
  4. Call: const result = await executePhotoUpload(supabase, files, spec)
  5. If !result.ok: return { ok: false, error: result.error }
  6. Keep ALL revalidatePath() calls at the end (unchanged).
  7. Return { ok: true }.

Step C: `npx tsc --noEmit` — paste.
Step D: `git diff <target file>` — paste. STOP.

CONSTRAINTS:
- The server action's parameter signature must NOT change.
- The return type must NOT change.
- revalidatePath calls stay in the server action.
- Auth check stays in the server action.
```

**Smoke test**: upload a post-bracketing photo. Confirm photo in gallery, activity log entry, status badge, other roles see the change.
**Commit**: `git commit -m "refactor: migrate uploadWindowPostBracketingPhoto to photo-upload lib (pilot)"`

### SESSIONS 6.5–6.7 — Migrate remaining upload actions

Use the SESSION 6.4 prompt with new target. One session per action.

| Session | Target action | Smoke test |
|---|---|---|
| 6.5 | `uploadWindowInstalledPhoto` | Upload installed photo, check gallery + status |
| 6.6 | `uploadRoomFinishedPhotos` | Upload room photo, check gallery |
| 6.7 | `uploadUnitStagePhotos` | Upload unit-stage photo, check display |

---

# PHASE 7 — Per-feature loaders for `server-data.ts`

**Risk: 🟠 High. `loadFullDataset` only has 3 callers (smaller than feared), but the file exports types used everywhere.**
**Model: Opus 4.7** • **Thinking: high** • **Time: 1 day**

### Findings before starting

- `loadFullDataset` is called from: `management/layout.tsx`, `management/settings/page.tsx`, `actions/dataset-queries.ts` (a thin wrapper).
- `loadSchedulerDataset`, `loadInstallerDataset`, `loadUnitActivityLog`, `loadUnitStageMedia` already exist.
- The file also exports types (`UnitStageMediaItem`, `InstallerMediaItem`) used by ~15 components.

### SESSION 7.1 — Audit `loadFullDataset` field usage

```
TASK: Read-only audit. Do NOT edit anything.

Step A — Read src/lib/server-data.ts. Identify the type returned by
loadFullDataset (likely AppDataset).

Step B — For EACH of the 3 callers:
  - src/app/management/layout.tsx
  - src/app/management/settings/page.tsx
  - src/app/actions/dataset-queries.ts (wrapper — note who calls IT)

  Read the file. List every field of the AppDataset that the file actually
  uses. Be thorough — include fields used by components rendered with the
  data passed in as props.

Step C — Produce a markdown table:
  caller | fields actually used | fields NOT used

Step D — Identify candidate per-feature loaders that would replace
loadFullDataset, e.g.:
  loadManagementOverview — fields used by management/layout.tsx
  loadManagementSettings — fields used by management/settings/page.tsx

Output in reply. Do not write any file. STOP.
```

**You do**: review the audit. Confirm proposed loader shapes.

### SESSION 7.2 — Create per-feature loaders (additive, no caller changes)

```
TASK: Add new loader functions to src/lib/server-data.ts. Do not modify
existing functions or callers.

Approved loader specs (from 7.1):
  [PASTE SPEC]

Per loader, do exactly this:

  Step 1: Add the new function NEXT TO loadFullDataset in server-data.ts.
  Step 2: Implementation: call the same .from() queries as loadFullDataset,
          but ONLY for the tables/fields needed.
  Step 3: Return type: a new exported type (e.g. ManagementOverviewDataset)
          — DO NOT modify AppDataset.
  Step 4: `npx tsc --noEmit` — paste.
  Step 5: STOP. Wait for "next".

CONSTRAINTS:
- Do NOT remove or modify loadFullDataset.
- Do NOT modify any caller in this session.
- Every new loader must be wrapped in `cache(...)` if loadFullDataset is.
- New types are additive. AppDataset stays the same.
```

**Commit**: `git commit -m "feat(server-data): add per-feature loaders (additive)"`

### SESSION 7.3 — Migrate ONE caller as a pilot

Pick `management/settings/page.tsx`.

```
TASK: Migrate ONE caller to a per-feature loader.

Target: src/app/management/settings/page.tsx

Step A — Read the file. Find the loadFullDataset() call.

Step B — Replace it with the new per-feature loader (from Session 7.2).

Step C — If the file passes the dataset to child components/props, ensure
the prop types still match. If a child expects AppDataset and you're now
passing ManagementSettingsDataset, EITHER:
  (a) widen the new dataset to include the extra fields, OR
  (b) ask me — do not silently cast.

Step D:
  1. `npx tsc --noEmit` — paste output.
  2. `git diff src/app/management/settings/page.tsx` — paste.
  3. STOP.

CONSTRAINTS:
- Do NOT remove loadFullDataset itself.
- Do NOT modify any other file.
- Preserve ALL rendered behavior — page must look identical.
```

**Manual smoke test**: log in as owner, go to /management/settings. Click around. Confirm everything renders.
**Commit**: `git commit -m "refactor: migrate management/settings to loadManagementSettings (pilot)"`

### SESSION 7.4 — Migrate remaining callers

`management/layout.tsx` and the indirect callers via `dataset-queries.ts`. Same template, one per session.

### SESSION 7.5 — (Later, ≥ 14 days after 7.4) Remove `loadFullDataset`

Only after callers have soaked AND you confirm `grep -rn "loadFullDataset" src` returns zero hits.

---

# PHASE 8 — Decompose `manufacturing-role-queue.tsx` (1,867 lines)

**Risk: 🔴 Highest. UI regressions are invisible to typecheck. There is no visual testing.**
**Model: Opus 4.7** • **Thinking: high** • **Time: 1.5 days, two sittings**

### CRITICAL: take screenshots BEFORE starting

Before touching anything, take **screenshots of the queue in every relevant state**:
- Cutter queue, default view
- Cutter queue, with a building filter applied
- Cutter queue, with a status filter applied
- Cutter queue, sort modal open
- Cutter queue, print modal open
- Cutter queue, EZ-sort applied
- Same 6 states for: assembler, qc, manufacturer

Save them in `docs/refactor/queue-baseline/`. After every commit in this phase, take the same screenshots and **diff visually**. There is no automated way to catch regressions here.

### Strategy: pure projection first, then state hooks

The original plan extracted `useQueueFilters` (state) first. This gives smaller files but no real depth — state moving is not logic moving. The right first step is extracting the **filter/sort/projection logic** into a pure function in `src/lib/queue/project.ts`. That is testable, has leverage, and makes the subsequent hook extraction lower-stakes because logic is already gone from the component.

Order: **pure projection → tests → wire projection → hooks → (later) JSX split**

### SESSION 8.1 — Audit (READ-ONLY)

```
TASK: Read-only audit of src/components/manufacturing/manufacturing-role-queue.tsx.
Do NOT edit anything.

Step A — STATE: Every useState call. Columns: line | name | type | initial value | what it tracks.

Step B — FILTER & SORT LOGIC (highest priority): Find every computation that
transforms the raw items array before rendering:
  - .filter() calls
  - .sort() / .toSorted() calls
  - .map() that transforms shape
  - useMemo blocks
  For each: line | input variables used | output name | 1-line description.

Step C — OTHER DERIVED VALUES: useMemo / inline computations not in step B.

Step D — EVENT HANDLERS: onClick/onChange. Columns: line | mutates which state | calls which server action.

Step E — JSX STRUCTURE: Name and describe the major sub-trees (filters bar,
sort modal, print modal, table/list rows, etc.). Just describe — do not refactor.

Output in reply. Do not write any file. STOP.
```

**You do**: save to `docs/refactor/queue-audit.md`. **Step B is the most important** — that's where the real leverage is.

### SESSION 8.2 — Extract pure `projectQueue` function

```
TASK: Create src/lib/queue/project.ts with a pure projection function.
Do NOT modify the component.

Using the filter/sort logic from Step B of the audit:
  [PASTE STEP B FROM AUDIT]

Export:

  export type QueueFilterState = {
    buildingFilter: string[];
    installDates: string[];
    completionDates: string[];
    statusFilters: QueueStatusFilter[];
    fabricTypeFilter: string[];
    floorFilter: string[];
    componentFilter: ComponentFilter;
  };

  export type QueueSortState = {
    sortLevels: SortLevel[];
    ezSort: "list_packaging" | "manufacturing" | null;
  };

  export function projectQueue(
    items: QueueItem[],
    filters: QueueFilterState,
    sort: QueueSortState,
    role: <role type from existing code>,
  ): QueueItem[];

Re-export any needed types (QueueStatusFilter, ComponentFilter, SortLevel, QueueItem)
from wherever they currently live.

CONSTRAINTS:
- Pure function. No useState, useEffect, or any React import.
- No supabase, no fetch, no Date.now() unless passed as a parameter.
- Copy the filter/sort/grouping logic from the component EXACTLY. Do NOT
  invent or improve behavior. This is a mechanical extraction.
- Do NOT import from src/app/.
- After creating: `npx tsc --noEmit` — paste. STOP.
```

**Commit**: `git add src/lib/queue/ && git commit -m "feat(queue): extract pure projectQueue function"`

### SESSION 8.3 — Tests for `projectQueue`

```
TASK: Create src/lib/queue/project.test.mts. Do not modify any other file.
Imports from src/lib/queue/project.ts only.

Required tests:
  - empty items → empty result
  - building filter: matching item included, non-matching excluded
  - status filter: matching included, non-matching excluded
  - fabricType filter
  - floor filter
  - combined building + status filter
  - sort by one level ascending
  - sort by one level descending
  - sort by two levels (primary + secondary)
  - ezSort "manufacturing" produces expected ordering
  - role isolation (if role affects projection, test at least one role pair)

Follow test style from src/lib/escalation-helpers.test.mts.
Run tests. Paste FULL output. STOP.

CONSTRAINTS:
- Do NOT modify project.ts to make tests pass.
- If a test reveals unexpected behavior, tell me — do NOT silently fix.
- `test.todo("...")` for anything behaviorally unclear.
```

**Commit**: `git commit -m "test(queue): add unit tests for projectQueue"`

### SESSION 8.4 — Wire `projectQueue` into the component

```
TASK: Replace inline filter/sort computation in the queue component with a
call to projectQueue(). Behavior unchanged — this is mechanical extraction.

Target: src/components/manufacturing/manufacturing-role-queue.tsx

Step A — From the audit (Step B), identify the EXACT lines where filtering
and sorting happens. Show me the line numbers and code. STOP.

[after "next"]

Step B — Replace the inline computation with:
  const displayRows = projectQueue(
    rawItems,
    { buildingFilter, installDates, completionDates, statusFilters,
      fabricTypeFilter, floorFilter, componentFilter },
    { sortLevels, ezSort },
    role,
  );
  Then render from displayRows instead of the old derived variable.

Step C:
  1. `npx tsc --noEmit` — paste.
  2. `npm test` — paste.
  3. `git diff src/components/manufacturing/manufacturing-role-queue.tsx` — paste.
  4. STOP.

CONSTRAINTS:
- Do NOT change any JSX.
- Do NOT change any state declarations yet.
- Do NOT change any event handlers.
```

**Smoke test**: retake all baseline screenshots. **Diff visually.** Click every filter + sort. ~30 min.
**Commit**: `git commit -m "refactor(queue): wire projectQueue for filter/sort computation"`

### SESSION 8.5 — Extract `useQueueFilters` (now just state — no logic)

> With `projectQueue` owning the logic, this hook is genuinely just state management — simpler and safer than it was.

```
TASK: Create src/components/manufacturing/use-queue-filters.ts.
Do NOT modify the component yet.

Export:

  export function useQueueFilters(): {
    buildingFilter: string[];      setBuildingFilter: (v: string[]) => void;
    installDates: string[];        setInstallDates: (v: string[]) => void;
    completionDates: string[];     setCompletionDates: (v: string[]) => void;
    statusFilters: QueueStatusFilter[];  setStatusFilters: (v: QueueStatusFilter[]) => void;
    fabricTypeFilter: string[];    setFabricTypeFilter: (v: string[]) => void;
    floorFilter: string[];         setFloorFilter: (v: string[]) => void;
    componentFilter: ComponentFilter;   setComponentFilter: (v: ComponentFilter) => void;
    resetFilters: () => void;
  };

Use EXACT same initial values as the existing useState calls (per 8.1 audit).
After creating: `npx tsc --noEmit` — paste. STOP.
```

**Commit**: `git add src/components/manufacturing/use-queue-filters.ts && git commit -m "feat(queue): add useQueueFilters hook (additive)"`

### SESSION 8.6 — Wire `useQueueFilters` into component

⚠️ Riskiest remaining edit. Baseline screenshots must exist.

```
TASK: Replace the 7 filter useState calls with useQueueFilters().

Target: src/components/manufacturing/manufacturing-role-queue.tsx

Step A — Locate the 7 useState calls: buildingFilter, installDates,
completionDates, statusFilters, fabricTypeFilter, floorFilter, componentFilter.

Step B — Show me the EXACT lines you will remove and the EXACT line you will add.
Do not edit yet. STOP.

[after "approved"]

Step C:
  1. Add: const filters = useQueueFilters();
  2. Replace every reference to each filter variable and its setter with
     filters.<name> and filters.set<Name>.
  3. DELETE (do not comment) the 7 old useState lines.

Step D: `npx tsc --noEmit` + `npm test` — paste both. STOP.

CONSTRAINTS — INVIOLABLE:
- Do NOT change any JSX.
- Do NOT change the projectQueue call or displayRows.
- Every reference to every filter variable must be replaced. Missing one breaks the queue.
- If unsure about even one reference, STOP and ask.
```

**Smoke test**: full screenshot diff. Click every filter + sort + modal. ~45 min.
**Commit**: `git commit -m "refactor(queue): replace filter useState with useQueueFilters"`

### SESSIONS 8.7–8.9 — Remaining hooks (same pattern)

| Sessions | Hook | State variables |
|---|---|---|
| 8.7a + 8.7b | `useQueueSort` | sortLevels, sortModalOpen, draftSortLevels, ezSort, ezSortModalOpen |
| 8.8a + 8.8b | `useQueuePrint` | printModalOpen, printLabelMode, skipAlreadyPrinted |
| 8.9a + 8.9b | `useQueueActions` | busyWindowId + useTransition calls |

Screenshot diff + smoke test after each `b` session.

### SESSION 8.10 — (Later, ≥ 14 days after 8.9) Split the JSX

By this point the render function is substantially smaller. Plan a fresh Opus 4.7 session. Split JSX sub-trees into dedicated components, one at a time, same pattern as Phase 5.

---

# PHASE 9 — Repository layer (DEFERRED)

**Status: not scripted in this playbook.** Re-evaluate after Phases 1–8 land.

Reasoning:
- RLS is "permissive authenticated" (verifies login, not row ownership). Auth scoping is in TS.
- A repo layer would dedupe scoping logic across 453 `.from()` calls.
- BUT: it's a multi-week effort with subtle bugs (forgetting a filter = data leak).
- BUT: it requires a real test strategy (mock Supabase or test DB), which doesn't exist yet.
- BUT: with 7 portals × N entities, the repo surface is huge.

When you revisit this:
1. Start a fresh planning conversation with Opus 4.7.
2. Read `docs/CONTEXT.md` and the ADRs first.
3. Pick ONE entity (probably `Window`) and build `WindowRepo` only. Don't generalize.
4. Migrate ONE feature to use it. Soak. Then expand.

This is a months-long, not days-long, project. Don't try to script it.

---

# 🧯 Panic page

### Symptom: tsc errors after a step
```bash
git diff <file>            # see exactly what the AI changed
# Understand the change first, then decide:
git checkout -- <file>     # safe ONLY if `git status` was clean before the session started
# If git status was NOT clean before the session, do not run the above.
# Instead: `git stash` to park changes, then inspect what's in the stash.
npx tsc --noEmit           # confirm baseline restored after revert
```

### Symptom: build passes, app behaves wrong
```bash
git log --oneline -10                 # which commit caused it?
git revert <commit-hash>              # makes a NEW commit reverting it
# Do NOT use `git reset --hard`
```

### Symptom: AI got confused mid-session and edited something it shouldn't
```bash
git stash                  # park bad changes
git stash drop             # discard them
# Restart in a fresh AI conversation. Re-paste the preamble.
```

### Symptom: branch is too messy
```bash
git checkout main
git branch -D refactor/safe-wins      # nuke ONLY the local refactor branch
git checkout -b refactor/safe-wins    # start clean
```

### Symptom: you merged a refactor and prod is broken and you're at the airport
```bash
# On your phone, via GitHub web UI:
# 1. Open the bad PR.
# 2. Click "Revert" — it creates a revert PR.
# 3. Merge the revert PR.
# Vercel will redeploy the previous good version automatically.
```

This is why every phase is one PR, not one giant PR.

---

# ⏱ Recommended pacing

| Week | What |
|---|---|
| 1 | Pre-flight + Phase 1 + Phase 2.1 |
| 2 | Phase 2.2, 2.3 + Phase 3.1, 3.2, 3.3 (pilot) |
| 3 | Phase 3.4–3.8 (one caller per day) |
| 4 | Phase 3.9 (cleanup) + Phase 4.1, 4.2 |
| 5 | Phase 4.3 (tests) + 1-week soak — DO NOTHING ELSE |
| 6 | Phase 5 (fsr-data split) — single sitting + 1-week soak |
| 7 | Phase 5 caller migrations for revalidation |
| 8 | Phase 6 (photo-upload) + 1-week soak |
| 9 | Phase 7 (per-feature loaders) + 1-week soak |
| 10–11 | Phase 8 (queue decomposition) — slowest, most careful |

**Hard rule: if you're going to be away in N days, do not start a phase that takes more than (N − 7) days.**

---

# 📋 Per-phase quick reference

| Phase | Branch | PR title | Smoke checklist |
|---|---|---|---|
| 1 | refactor/docs | docs: domain glossary + ADRs | none |
| 2 | refactor/inline-utils | refactor: inline shallow utility shims | login as each role |
| 3 | refactor/invalidation-registry | refactor: invalidation registry | trigger one mutation per role |
| 4 | refactor/scheduler-split | refactor: pure/effect split for scheduler | trigger scheduling action |
| 5 | refactor/fsr-data-split | refactor: split fsr-data into per-domain modules | full master checklist |
| 6 | refactor/photo-upload-flow | refactor: PhotoUploadFlow facade | upload photos in 4 contexts |
| 7 | refactor/per-feature-loaders | refactor: per-feature server-data loaders | management overview + settings |
| 8 | refactor/queue-hooks | refactor: extract queue hooks | full master + screenshot diff |

---

# 🤖 Model + thinking summary

| Phase | Model | Extended thinking | Why |
|---|---|---|---|
| 1 | Haiku 4.5 | off | Pure prose. |
| 2 | Sonnet 4.6 | medium | Follow imports correctly. |
| 3 | Sonnet 4.6 | high | Easy to drop a path; thinking helps. |
| 4 | Opus 4.7 | high | Hallucination cost is real bugs. |
| 5 | Opus 4.7 | high | Many moving parts; barrel re-export is subtle. |
| 6 | Opus 4.7 | high | Photo flow differences are easy to lose. |
| 7 | Opus 4.7 | high | Type drift between datasets is a footgun. |
| 8 | Opus 4.7 | high | UI invariants invisible to compiler. |

**Cost note**: Opus is more expensive but the cost difference vs. a real production regression is trivial. Don't downgrade.

---

# 🏁 Definition of done

After all 8 phases:
- Codebase rating ≈ **8 / 10** (from 6).
- `manufacturing-scheduler.ts` test-covered.
- `fsr-data.ts` is a 30-line barrel.
- `revalidatePath` calls live in one registry.
- Photo uploads go through one flow.
- `manufacturing-role-queue.tsx` is < 800 lines, with hooks tested separately.
- `docs/CONTEXT.md` and ADRs document the design.

You will NOT have:
- A repository layer (Phase 9 deferred).
- Full test coverage (still mostly pure-helper tests).
- Component-level visual regression tests.

These are still gaps, but they're smaller gaps and the codebase is now navigable enough to address them when you have time.
