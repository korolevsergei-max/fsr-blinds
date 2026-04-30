# FSR Blinds — Refactor Execution Prompts

> Companion to [../refactor-playbook.md](../refactor-playbook.md). The playbook explains *why*; this file is just the *what*. Each session is self-contained — read top-to-bottom, copy-paste, execute, commit, move on.
>
> **Revised 2026-04-30**: fixed delete rule, revert rule, removed low-leverage Phase 2 sessions, scheduler uses copy-first approach, photo-upload uses proper lib architecture, queue extracts pure projection before hooks.

---

## How to use this file

1. Open a fresh AI conversation for **each session below**.
2. Set the model and thinking level shown in the session header.
3. Paste the **🔁 Universal Preamble** (next section) FIRST.
4. Wait for AI to reply "Rules acknowledged".
5. Paste the **session prompt**.
6. Follow the **verify** + **smoke test** + **commit** steps as labelled.
7. Stop. Open the next session in a new conversation.

**Do not run two sessions in the same conversation.** Fresh context = fewer mistakes.

---

## 🔁 Universal Preamble (paste FIRST, every session)

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
    `npx tsc --noEmit` is your only automatic check.

When I say "commit", run:
  git add -A && git commit -m "<message>"

Confirm you've read these rules by replying with "Rules acknowledged"
before doing anything else.
```

---

## 🚦 Pre-flight (run YOURSELF in terminal — not via AI)

```bash
cd "/Users/sergeikorolev/5. Vibe coding/260322-FSRblinds"
git status                          # MUST be clean
git checkout -b refactor/safe-wins
npx tsc --noEmit > baseline-tsc.txt 2>&1
echo "exit=$?"                      # MUST be 0
wc -l baseline-tsc.txt              # save this number
npm test                            # confirm tests pass; save baseline-test.txt
```

When AI asks for "the baseline", paste `baseline-tsc.txt` (or say "0 errors, X lines of output").

---

# SESSION 1.1 — Create `docs/CONTEXT.md`

**Model**: Haiku 4.5 • **Thinking**: off • **Risk**: 🟢 None

### Prompt

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

### Verify
Read `docs/CONTEXT.md` yourself. Manually fix any "TODO" lines.

### Commit
```bash
git add docs/CONTEXT.md && git commit -m "docs: add CONTEXT.md domain glossary"
```

---

# SESSION 1.2 — Seed `docs/adr/`

**Model**: Haiku 4.5 • **Thinking**: off • **Risk**: 🟢 None

### Prompt

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

### Verify
Read all three files.

### Commit
```bash
git add docs/adr/ && git commit -m "docs: seed initial ADRs"
```

---

# PHASE 2 — Inline shallow utilities

> **Why only one session here**: The original plan included inlining `role-routes.ts` and `unit-install-guard.ts`. Both survive the deletion test — `role-routes.ts` owns a role→path mapping that would scatter to N callers if removed, and `unit-install-guard.ts` likely encodes a business invariant. Inlining them would hurt locality, not help it. Only `manufacturing-process.ts` is a true pass-through re-export with no added contract.

---

# SESSION 2.1 — Inline `manufacturing-process.ts`

**Model**: Sonnet 4.6 • **Thinking**: medium • **Risk**: 🟡 Low

### Prompt

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
     itself (and not its tests), tell me — I will delete the file.
  3. STOP.

CONSTRAINTS:
- Never batch multiple files in one edit.
- Never change a function body. Only import paths.
```

### Smoke test
`npm run dev` → click into manufacturing screens (cutter, assembler, qc) → confirm they render.

### You delete the file (three conditions must be met first)
```bash
# Condition 1: grep -rn "manufacturing-process" src → zero results
# Condition 2: npx tsc --noEmit → clean
# Condition 3: smoke test passed
git rm src/lib/manufacturing-process.ts
```

### Commit
```bash
git add -A && git commit -m "refactor: inline manufacturing-process re-export shim"
```

---

# SESSION 3.1 — Revalidation audit (READ-ONLY)

**Model**: Sonnet 4.6 • **Thinking**: high • **Risk**: 🟢 None (read-only)

### Prompt

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

Step E:
  Identify path patterns that appear in 3+ callers — these are the strongest
  candidates for the shared registry. List them separately.

Output everything in your reply. Do not write any file. STOP.
```

### What you do after
- Save the AI's table to `docs/refactor/revalidation-audit.md` manually.
- Review step E — if fewer than 3 path patterns appear in 3+ callers, ask me before proceeding to 3.2.

### Commit
```bash
git add docs/refactor/revalidation-audit.md && git commit -m "docs(refactor): capture revalidation audit"
```

---

# SESSION 3.2 — Create invalidation registry (additive)

**Model**: Sonnet 4.6 • **Thinking**: high • **Risk**: 🟡 Low

### Prompt

Replace `[PASTE TABLE]` with the audit table from 3.1.

```
TASK: Create ONE new file: src/lib/invalidation/registry.ts. Do not modify
any existing file.

Use the audit pasted below:
  [PASTE TABLE FROM SESSION 3.1]

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

### Verify
Read `src/lib/invalidation/registry.ts`. Cross-check every path against the audit table.

### Commit
```bash
git add -A && git commit -m "feat(invalidation): add additive entity-event invalidation registry"
```

---

# SESSION 3.3 — Pilot: migrate `label-print-actions.ts`

**Model**: Sonnet 4.6 • **Thinking**: high • **Risk**: 🟡 Low

### Prompt

```
TASK: Migrate ONE file as a pilot for the new invalidate() registry.

Target: src/app/actions/label-print-actions.ts

Step A — Read the file. List every revalidatePath() call (line + path + function).

Step B — For EACH call, propose the equivalent invalidate({ kind: ... }) using
these mappings (refer to src/lib/invalidation/registry.ts):
  - paths under /management/... touching a unit listing → "management.dashboard.changed"
  - paths matching /units/[unitId]/... → "unit.updated" with that unitId
  - paths matching /manufacturer or /qc or /cutter or /assembler → "manufacturing.queue.changed"
  - anything else → STOP and ask me.

Show me your proposed mapping table. STOP. Wait for "approved".

[after "approved"]

Step C — Edit the file:
  1. Add: import { invalidate } from "@/lib/invalidation/registry";
  2. For each revalidatePath() call: add the invalidate() call immediately ABOVE it.
     Leave the revalidatePath() call in place for now — we'll remove it in step D.
  3. Run `npx tsc --noEmit`. Paste output.
  4. STOP.

[after tsc is clean]

Step D — For each revalidatePath() call:
  1. Delete that line (the invalidate() call above it is its replacement).
  2. After deleting ALL revalidatePath() calls in this file, remove
     `import { revalidatePath } from "next/cache"` if it has no remaining uses.
  3. `npx tsc --noEmit` — paste output.
  4. `git diff src/app/actions/label-print-actions.ts` — paste.
  5. STOP.

CONSTRAINTS:
- Do NOT touch any other file.
- Do NOT leave commented-out dead code. Delete the replaced lines cleanly.
```

### Smoke test
Print a label end-to-end. Confirm UI refreshes.

### Commit
```bash
git add -A && git commit -m "refactor: migrate label-print-actions to invalidate() registry (pilot)"
```

---

# SESSIONS 3.4–3.8 — Migrate remaining callers (one per day)

Use the **SESSION 3.3 prompt**, substituting the Target. Order: smallest to largest.

| Session | Target file | Lines |
|---|---|---|
| 3.4 | `src/app/actions/post-install-issue-actions.ts` | 233 |
| 3.5 | `src/app/actions/production-actions.ts` | 417 |
| 3.6 | `src/app/actions/manufacturing-actions.ts` | 682 |
| 3.7 | `src/app/actions/management-actions.ts` | 968 |
| 3.8 | `src/app/actions/auth-actions.ts` | 1,132 |

> ⚠️ `fsr-data.ts` is migrated in Phase 5 (after the split), not here.

### Smoke test (after each)
Trigger one mutation handled by that action file. Confirm UI refreshes.

### Commit (after each)
```bash
git add -A && git commit -m "refactor: migrate <filename> to invalidate() registry"
```

---

# SESSION 3.9 — Cleanup (YOURSELF, ≥ 7 days after 3.8 with no regressions)

```bash
# Confirm zero callers of old functions remain in production code:
grep -rn "from .*actions/revalidation" src --include="*.ts" --include="*.tsx"

# If clean: remove unused exports from src/app/actions/revalidation.ts manually.
# Then:
npx tsc --noEmit
npm run build
git add -A && git commit -m "refactor: remove legacy revalidation exports after registry migration"
```

If anything fails: `git revert HEAD`. Don't fix forward.

---

# SESSION 4.1 — Scheduler audit (READ-ONLY)

**Model**: Opus 4.7 • **Thinking**: high • **Risk**: 🟢 None (read-only)

### Prompt

```
TASK: Read-only audit of src/lib/manufacturing-scheduler.ts. Do NOT edit anything.

Step A: Read the entire file. List every top-level function (exported and not).

Step B: For each function, classify it:

  PURE:
    - Returns a value
    - No supabase calls
    - No fetch / network
    - No Date.now() or `new Date()` UNLESS passed in as a parameter
    - Does not mutate any argument
    - Does not call any other function in this file that is impure

  IMPURE:
    Anything not pure.

  UNCERTAIN:
    Anything you can't be 100% sure about. List explicitly.

Step C: For each function, list which other functions in this file it calls.

Step D: Produce a markdown report with three tables (PURE / IMPURE / UNCERTAIN),
plus notes on any function whose classification depends on assumptions.

Output in reply. Do not write any file. STOP.
```

### What you do after
- Save to `docs/refactor/scheduler-audit.md`.
- Resolve every UNCERTAIN entry manually, then lock in the final PURE list.

### Commit
```bash
git add docs/refactor/scheduler-audit.md && git commit -m "docs(refactor): scheduler purity audit"
```

---

# SESSION 4.2 — Copy pure functions into `pure.ts` (additive)

**Model**: Opus 4.7 • **Thinking**: high • **Risk**: 🟡 Low (additive — originals stay)

### Prompt

Replace `[PASTE PURE LIST]` with your locked list from 4.1.

```
TASK: COPY all pure functions from src/lib/manufacturing-scheduler.ts into a
new file src/lib/scheduler/pure.ts. Do NOT cut them. Originals stay in place.

Approved PURE list:
  [PASTE PURE LIST]

Step 1: Create src/lib/scheduler/pure.ts with header:
          // Pure scheduling logic — no I/O, no Date.now(), no global state.

Step 2: COPY every function on the PURE list into pure.ts.
        Preserve EXACT whitespace, comments, and JSDoc.

Step 3: At the top of pure.ts, add import statements for every type or
        utility the functions need. Copy import lines exactly as they appear
        in manufacturing-scheduler.ts.

Step 4: Do NOT add re-exports in manufacturing-scheduler.ts. Do NOT modify
        manufacturing-scheduler.ts at all in this session.

Step 5: `npx tsc --noEmit` — paste output. STOP.

CONSTRAINTS:
- Do NOT change a single character of any function body.
- Do NOT change any signature.
- Do NOT import from src/app/ in pure.ts.
- If a pure function calls a helper that is also pure, copy the helper too.
```

### Verify
`git diff src/lib/manufacturing-scheduler.ts` → must be empty (file untouched).

### Commit
```bash
git add src/lib/scheduler/pure.ts && git commit -m "refactor(scheduler): copy pure functions into scheduler/pure.ts (additive)"
```

---

# SESSION 4.3 — Tests for `pure.ts`

**Model**: Opus 4.7 • **Thinking**: high • **Risk**: 🟢 Low

### Prompt

```
TASK: Create src/lib/scheduler/pure.test.mts. Do not modify any other file.

Step A — Read these to learn the repo's test conventions:
  - src/lib/escalation-helpers.test.mts
  - src/lib/dataset-mappers.test.mts
  - package.json — "scripts" section only

Step B — Tell me:
  1. Test runner used (node:test, vitest, jest)?
  2. Exact test command from package.json?
  3. Import style used by existing tests?
  STOP and wait for "approved".

[after "approved"]

Step C — Write src/lib/scheduler/pure.test.mts with:
  - Imports from src/lib/scheduler/pure.ts (not from manufacturing-scheduler.ts)
  - 3 tests minimum per pure function
  - Cover: happy path, empty input, boundary value
  - Match style and import conventions from step A exactly

Step D — Run the test command. Paste FULL output. STOP.

CONSTRAINTS:
- Do NOT modify pure.ts to make tests pass. Tests must work as-is.
- If a function's behavior is unclear, write `test.todo("...")` instead of guessing.
- If a test fails, do NOT fix pure.ts. Tell me which test failed and why.
```

### Commit
```bash
git add -A && git commit -m "test(scheduler): add unit tests for pure scheduler module"
```

---

# SESSION 4.4 — Replace originals with re-exports (one at a time, tests gate each)

**Model**: Opus 4.7 • **Thinking**: high • **Risk**: 🟡 Medium

> This session happens AFTER 4.3 tests are passing and green. Run `npm test` before starting and confirm all 4.3 tests pass.

### Prompt

```
TASK: For each pure function that now lives in src/lib/scheduler/pure.ts, replace
its body in src/lib/manufacturing-scheduler.ts with a re-export statement.

Do this ONE FUNCTION AT A TIME.

Per function:
  Step 1: Find the function in manufacturing-scheduler.ts. Show me the full
          signature + JSDoc (not the body). STOP. Wait for "next".

  [after "next"]

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
- If a function had a JSDoc block, the re-export line replaces the whole block.
```

### After all functions replaced, run final verification:

```bash
npx tsc --noEmit    # must be clean
npm test            # must be green
```

### Commit
```bash
git add -A && git commit -m "refactor(scheduler): replace pure function bodies with re-exports to pure.ts"
```

---

# 🛑 STOP-GATE

Phases 1–4 move the codebase from 6/10 to ~7/10. Phases 5–8 carry production regression risk. Before continuing, confirm ALL of these:

- [ ] You will be reachable for ≥ 7 days after merging any Phase 5–8 change.
- [ ] Phases 1–4 have been live in production for ≥ 7 days without regressions.
- [ ] The master smoke checklist (all 7 roles) passes on current `main`.
- [ ] You are NOT within 14 days of a planned absence.

### Master smoke checklist (run before AND after any Phase 5–8 commit)

For EACH of 7 roles (owner, scheduler, installer, cutter, assembler, qc, manufacturer):
1. Log in. Confirm home redirect is correct.
2. Open one Unit. Confirm rooms and windows render.
3. Open one Window. Confirm photos display.
4. Trigger one mutation appropriate to the role.
5. Confirm UI refreshes after the mutation.
6. Log out.

Total: ~30 min.

---

# SESSION 5.1 — `fsr-data.ts` audit (READ-ONLY)

**Model**: Opus 4.7 • **Thinking**: high • **Risk**: 🟢 None (read-only)

### Prompt

```
TASK: Read-only audit of src/app/actions/fsr-data.ts (2,533 lines).
Do NOT edit anything.

Step A: Read the entire file. Produce a markdown table with columns:
  line range | exported name | category | description (1 line)

Categories must be ONE of:
  - bulk         (multi-entity operations, e.g. bulkAssignUnits)
  - unit         (createUnit, updateUnitStatus, etc.)
  - room         (createRoomsForUnit, updateRoomName, deleteRoom, etc.)
  - window       (createWindowWithPhoto, updateWindowWithOptionalPhoto, deleteWindow, etc.)
  - media        (uploadXxxPhoto, deleteXxxPhoto, deleteWindowMediaItem, etc.)
  - notification (markNotificationRead, markAllNotificationsRead, etc.)
  - helper       (non-exported functions used internally)

Step B: List every IMPORT at the top of fsr-data.ts.

Step C: List every non-exported helper function, and which exported functions
use it.

Step D: Flag any function whose body crosses categories (e.g. an upload that
also patches window status). Categorize as primary, flag as "cross-concern".

Output in reply. Do not write any file. STOP.
```

### What you do after
- Save to `docs/refactor/fsr-data-audit.md`.
- Review and confirm category assignments.

### Commit
```bash
git add docs/refactor/fsr-data-audit.md && git commit -m "docs(refactor): fsr-data audit"
```

---

# SESSION 5.2 — Create per-domain sub-files (additive COPY)

**Model**: Opus 4.7 • **Thinking**: high • **Risk**: 🟡 Medium

### Prompt

Replace `[PASTE CATEGORIES]` with your locked audit from 5.1.

```
TASK: Create new files under src/app/actions/fsr/, ONE category at a time.
Do NOT modify fsr-data.ts in this session.

Approved categories:
  [PASTE CATEGORIES + FUNCTION NAMES FROM 5.1]

For category "notification" (smallest — do first):

  Step 1: Create src/app/actions/fsr/notification.ts.
  Step 2: Line 1: "use server";
  Step 3: COPY all imports from fsr-data.ts that this file's functions need.
          Be conservative — copy more than needed. We'll remove unused later.
  Step 4: COPY (not cut) every function in the "notification" category from
          fsr-data.ts into this new file. Preserve EXACT whitespace, comments, JSDoc.
  Step 5: COPY any helper functions used exclusively by notification functions.
  Step 6: `npx tsc --noEmit` — paste output.
  Step 7: STOP. Wait for "next".

Continue with categories in this order:
  notification → bulk → room → window → media → unit

CONSTRAINTS — INVIOLABLE:
- COPY, do not cut. fsr-data.ts must remain 100% untouched.
- If a helper is used by multiple categories, COPY it into each. We'll dedupe later.
- Each new file must compile independently (tsc clean after each).
- Do NOT import from other fsr/* files yet — no cross-file dependencies in this session.
```

### Verify after all 6 files created
```bash
ls src/app/actions/fsr/                       # should list 6 files
git diff src/app/actions/fsr-data.ts          # must be empty
npx tsc --noEmit                              # must be clean
```

> ⚠️ No commit yet — wait for 5.3.

---

# SESSION 5.3 — Convert `fsr-data.ts` to a barrel

**Model**: Opus 4.7 • **Thinking**: high • **Risk**: 🟠 High

### Prompt

```
TASK: Convert src/app/actions/fsr-data.ts into a thin barrel file that
re-exports from src/app/actions/fsr/*.ts. All callers continue to import
from fsr-data.ts and must not need any changes.

Step 1: List every exported name in fsr-data.ts. Show me the list. STOP.

Step 2: For each exported name, identify which sub-file in fsr/* contains it.
        Build a mapping table: name → file. STOP and wait for "approved".

[after "approved"]

Step 3: Replace the ENTIRE contents of fsr-data.ts with exactly:
  "use server";
  // Barrel re-export — implementations in src/app/actions/fsr/*
  export { <name> } from "./fsr/<file>";
  ... (one line per export, alphabetically ordered)

  Nothing else. No imports. No function bodies. No helpers.

Step 4: `npx tsc --noEmit` — paste output.
Step 5: `git diff src/app/actions/fsr-data.ts` — paste.
Step 6: STOP.

CONSTRAINTS:
- Do NOT add new exports.
- Do NOT remove or rename any existing export.
- Every exported name in the original must appear in the barrel.
```

### Smoke test (CRITICAL — full master checklist)
All 7 roles. ~30 min. Do not skip.

### Commit
```bash
git add -A && git commit -m "refactor: split fsr-data.ts into per-domain modules (fsr/)"
```

---

# SESSION 5.4 — Migrate revalidation in each `fsr/*` file

For each of the 6 sub-files, run the **SESSION 3.3 prompt** with the target set to the sub-file. One session per file. Smoke test + commit after each.

| Session | Target |
|---|---|
| 5.4.1 | `src/app/actions/fsr/notification.ts` |
| 5.4.2 | `src/app/actions/fsr/bulk.ts` |
| 5.4.3 | `src/app/actions/fsr/room.ts` |
| 5.4.4 | `src/app/actions/fsr/window.ts` |
| 5.4.5 | `src/app/actions/fsr/media.ts` |
| 5.4.6 | `src/app/actions/fsr/unit.ts` |

---

# SESSION 5.5 — Dedupe helpers (LATER, ≥ 7 days after 5.4)

```
TASK: Read-only audit of helpers.

For each file under src/app/actions/fsr/, list every NON-exported function.
Table: file | function name | brief description.

Then: identify functions with identical or near-identical bodies across multiple
files. List them. STOP — show me before editing anything.
```

After approval, instruct per helper:

```
Move helper `<name>` to src/app/actions/fsr/_shared.ts (create if needed).
Replace each occurrence in other files with an import from _shared.ts.
One helper → tsc → stop.
```

---

# PHASE 6 — Photo-upload deep module

> **Architecture note**: `src/lib/` must NOT import from `src/app/`. The correct shape is a proper deep module in `lib/photo-upload/` that server actions in `app/actions/fsr/media.ts` call into — NOT a façade that wraps the server actions.
>
> Server actions own: auth check, building the upload spec, calling the lib, calling `revalidatePath`.
> The lib owns: validation, compression, storage upload, media row insert, entity patch, activity log insert.

---

# SESSION 6.1 — Photo-upload behavior diff (READ-ONLY)

**Model**: Opus 4.7 • **Thinking**: high • **Risk**: 🟢 None (read-only)

### Prompt

```
TASK: Read-only audit. Do NOT edit anything.

Read these 4 server actions from src/app/actions/fsr/media.ts
(or src/app/actions/fsr-data.ts if Phase 5 not yet done):
  - uploadUnitStagePhotos
  - uploadWindowPostBracketingPhoto
  - uploadWindowInstalledPhoto
  - uploadRoomFinishedPhotos

Produce a comparison table with rows = behaviors, columns = the 4 actions:
  - validates image? (Y/N + how)
  - compresses image? (Y/N + library used)
  - storage bucket name
  - storage path pattern
  - media_uploads fields set (list each field and its value)
  - inserts activity_log row? (Y/N + fields)
  - patches parent entity? (table + fields)
  - error rollback? (deletes uploaded blob if DB insert fails?)

Then list plainly: which behaviors are IDENTICAL across all 4, which DIFFER.

Output in reply. Do not write any file. STOP.
```

### What you do after
Save to `docs/refactor/photo-upload-diff.md`.

### Commit
```bash
git add docs/refactor/photo-upload-diff.md && git commit -m "docs(refactor): photo upload behavior diff"
```

---

# SESSION 6.2 — Create `lib/photo-upload/types.ts` + pure helpers

**Model**: Opus 4.7 • **Thinking**: high • **Risk**: 🟢 Low (new files only)

### Prompt

Replace `[PASTE DIFF TABLE]` with your saved table from 6.1.

```
TASK: Create two new files in src/lib/photo-upload/. Do NOT edit any existing file.

Using the diff table pasted below:
  [PASTE DIFF TABLE]

File 1: src/lib/photo-upload/types.ts

  Export a discriminated union PhotoUploadSpec with one variant per upload flow:

  export type PhotoUploadSpec =
    | {
        kind: "unit-stage";
        unitId: string;
        stage: <copy the stage union type from existing code>;
        bucket: "<exact bucket name from audit>";
        storagePath: string;
        mediaFields: { /* exact fields from audit */ };
        activityLog?: { /* fields if audit shows activity log */ };
      }
    | {
        kind: "window-post-bracketing";
        windowId: string;
        unitId: string;
        bucket: "<exact bucket name>";
        storagePath: string;
        mediaFields: { /* ... */ };
        activityLog?: { /* ... */ };
      }
    | { kind: "window-installed"; /* same pattern */ }
    | { kind: "room-finished"; /* same pattern */ };

  The spec must contain ALL the variant-specific data each server action currently
  hardcodes inline (paths, fields, log entries). Copy the exact field names from
  the existing code.

File 2: src/lib/photo-upload/validate.ts

  Export pure validation functions extracted from the existing server actions.
  No supabase. No network. No React. Returns { ok: true } | { ok: false; error: string }.

CONSTRAINTS:
- Do NOT import from src/app/ in either file.
- Do NOT call supabase in either file.
- After creating both files: `npx tsc --noEmit` — paste output. STOP.
```

### Commit
```bash
git add src/lib/photo-upload/ && git commit -m "feat(photo-upload): add PhotoUploadSpec type and pure validators"
```

---

# SESSION 6.3 — Create `lib/photo-upload/execute.ts`

**Model**: Opus 4.7 • **Thinking**: high • **Risk**: 🟡 Medium

### Prompt

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

Implementation:
  1. Validate files using src/lib/photo-upload/validate.ts functions.
  2. For each file: compress if the audit showed compression in that flow.
  3. Upload to supabase.storage using spec.bucket and spec.storagePath.
  4. On storage error: return { ok: false, error: ... }. Do NOT throw.
  5. Insert row(s) into media_uploads using spec.mediaFields.
  6. On DB error: delete the uploaded blob (rollback), return { ok: false }.
  7. If spec.activityLog is present, insert into activity_log.
  8. Patch parent entity if spec requires it (use spec fields).
  9. Return { ok: true, mediaIds: [...] }.

CONSTRAINTS:
- Do NOT call revalidatePath. Revalidation stays in the server action.
- Do NOT call createClient(). Supabase client is INJECTED by the caller.
- Do NOT import from src/app/.
- Handle every error explicitly — no unhandled promise rejections.

After creating: `npx tsc --noEmit` — paste output. STOP.
```

### Commit
```bash
git add src/lib/photo-upload/execute.ts && git commit -m "feat(photo-upload): add executePhotoUpload IO module"
```

---

# SESSION 6.4 — Pilot: refactor `uploadWindowPostBracketingPhoto`

**Model**: Opus 4.7 • **Thinking**: high • **Risk**: 🟠 High (user-visible)

### Prompt

```
TASK: Refactor ONE server action to use the new photo-upload lib.

Target: uploadWindowPostBracketingPhoto in src/app/actions/fsr/media.ts
        (or src/app/actions/fsr-data.ts if Phase 5 not done)

Step A — Read the current implementation. Extract:
  - How files/formData arrive as parameters
  - The storage bucket and path pattern it uses
  - The media_uploads fields it sets
  - The activity_log entry it creates (if any)
  - The entity patch it performs (if any)
  - The revalidatePath calls it makes

Show me this as a structured list. STOP.

[after "approved"]

Step B — Refactor the function body to:
  1. Keep auth check at the top (unchanged).
  2. Call validatePhotoUpload() from src/lib/photo-upload/validate.ts.
     Return early on failure.
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
- revalidatePath calls are NOT moved into execute.ts.
- auth check stays in the server action.
```

### Smoke test
Upload a post-bracketing photo. Confirm:
- Photo appears in gallery.
- Activity log entry created (if it was before).
- Status badge updates.
- Other roles see the change.

### Commit
```bash
git add -A && git commit -m "refactor: migrate uploadWindowPostBracketingPhoto to photo-upload lib (pilot)"
```

---

# SESSIONS 6.5–6.7 — Migrate remaining upload actions

Use the **SESSION 6.4 prompt** with the new target. One session per action.

| Session | Target action | Smoke test |
|---|---|---|
| 6.5 | `uploadWindowInstalledPhoto` | Upload installed photo, check gallery + status |
| 6.6 | `uploadRoomFinishedPhotos` | Upload room photo, check gallery |
| 6.7 | `uploadUnitStagePhotos` | Upload unit-stage photo, check display |

---

# SESSION 7.1 — `loadFullDataset` field-usage audit

**Model**: Opus 4.7 • **Thinking**: high • **Risk**: 🟢 None (read-only)

### Prompt

```
TASK: Read-only audit. Do NOT edit anything.

Step A — Read src/lib/server-data.ts. Identify the type returned by
loadFullDataset (likely AppDataset or similar).

Step B — For EACH of these 3 callers, read the file and list every field of
the dataset the file actually uses (include fields passed to child components):
  - src/app/management/layout.tsx
  - src/app/management/settings/page.tsx
  - src/app/actions/dataset-queries.ts (and trace who calls IT)

Step C — Produce a table:
  caller | fields actually used | fields NOT used

Step D — Propose per-feature loader names and their return types, e.g.:
  loadManagementOverview — used by management/layout.tsx
  loadManagementSettings — used by management/settings/page.tsx

Output in reply. Do not write any file. STOP.
```

### What you do after
Save to `docs/refactor/server-data-audit.md`.

### Commit
```bash
git add docs/refactor/server-data-audit.md && git commit -m "docs(refactor): server-data loader audit"
```

---

# SESSION 7.2 — Add per-feature loaders (additive)

**Model**: Opus 4.7 • **Thinking**: high • **Risk**: 🟡 Medium

### Prompt

Replace `[PASTE SPEC]` with your approved loader designs from 7.1.

```
TASK: Add new loader functions to src/lib/server-data.ts. Do not modify
existing functions or any callers.

Approved loader specs:
  [PASTE SPEC FROM 7.1]

Per new loader, do exactly this:
  Step 1: Add the function adjacent to loadFullDataset.
  Step 2: Implementation queries only the tables/fields the caller actually uses.
  Step 3: Return type is a new named type (e.g. ManagementOverviewDataset).
          Do NOT modify AppDataset.
  Step 4: Wrap in `cache(...)` if and only if loadFullDataset uses `cache`.
  Step 5: `npx tsc --noEmit` — paste.
  Step 6: STOP. Wait for "next".

CONSTRAINTS:
- Do NOT remove or modify loadFullDataset.
- Do NOT change any caller.
- New types are additive. AppDataset is unchanged.
```

### Commit
```bash
git add -A && git commit -m "feat(server-data): add per-feature loaders (additive)"
```

---

# SESSION 7.3 — Pilot: migrate `management/settings/page.tsx`

**Model**: Opus 4.7 • **Thinking**: high • **Risk**: 🟠 High

### Prompt

```
TASK: Migrate ONE caller to use a per-feature loader.

Target: src/app/management/settings/page.tsx

Step A — Read the file. Find the loadFullDataset() call.

Step B — Replace with the new per-feature loader.
If a child component expects AppDataset and you're now passing a narrower type:
  Option (a): widen the new type to include the extra fields, OR
  Option (b): ask me — do NOT silently cast types.
Show me the proposed change before editing. STOP.

[after "approved"]

Step C:
  1. Make the edit.
  2. `npx tsc --noEmit` — paste.
  3. `git diff src/app/management/settings/page.tsx` — paste.
  4. STOP.
```

### Smoke test
Log in as owner → /management/settings. Click around all tabs. Confirm identical rendering.

### Commit
```bash
git add -A && git commit -m "refactor: migrate management/settings to per-feature loader (pilot)"
```

---

# SESSIONS 7.4–7.5 — Migrate remaining callers

Same prompt as 7.3 for:
- `src/app/management/layout.tsx`
- `src/app/actions/dataset-queries.ts` (and its indirect callers)

---

# 📸 SESSION 8.0 — Baseline screenshots (DO BEFORE 8.1)

Before any Phase 8 session, take screenshots of every queue state and save to `docs/refactor/queue-baseline/`.

For each role (cutter, assembler, qc, manufacturer):
- `<role>-default.png` — queue, no filters
- `<role>-building-filter.png` — building filter applied
- `<role>-status-filter.png` — status filter applied
- `<role>-sort-modal.png` — sort modal open
- `<role>-print-modal.png` — print modal open
- `<role>-ezsort.png` — EZ-sort applied

After every Phase 8 commit, retake and diff visually. There is no automated regression test here.

---

# SESSION 8.1 — Queue audit (READ-ONLY)

**Model**: Opus 4.7 • **Thinking**: high • **Risk**: 🟢 None (read-only)

### Prompt

```
TASK: Read-only audit of src/components/manufacturing/manufacturing-role-queue.tsx.
Do NOT edit anything.

Step A — STATE: Every useState. Columns: line | name | type | initial value | what it tracks.

Step B — FILTER & SORT LOGIC: Find every computation that transforms the raw
items array before rendering. This includes:
  - .filter() calls
  - .sort() / .toSorted() calls
  - .map() that transforms shape
  - useMemo blocks
  For each: line | input variables used | output name | 1-line description.

Step C — DERIVED VALUES: Other useMemo / inline computations not in B.

Step D — EVENT HANDLERS: onClick/onChange. Columns: line | mutates which state | calls which server action.

Step E — JSX STRUCTURE: Identify the major sub-trees (filters bar, sort modal,
print modal, table/list rows, etc.). Just name and describe — do not refactor.

Output in reply. Do not write any file. STOP.
```

### What you do after
Save to `docs/refactor/queue-audit.md`. Pay close attention to **Step B** — that's where the leverage is.

### Commit
```bash
git add docs/refactor/queue-audit.md && git commit -m "docs(refactor): queue audit"
```

---

# SESSION 8.2 — Extract pure `projectQueue` function

**Model**: Opus 4.7 • **Thinking**: high • **Risk**: 🟡 Low (new file only)

> This is the high-leverage win: a pure, testable function that owns all filter+sort+grouping logic. The hook extraction in 8.5+ becomes lower-stakes once logic lives here.

### Prompt

Replace `[PASTE STEP B FROM AUDIT]` with the filter & sort logic table from 8.1.

```
TASK: Create src/lib/queue/project.ts with a pure projection function.
Do NOT modify the component.

Using the filter/sort logic from the audit:
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

Re-export any types needed (QueueStatusFilter, ComponentFilter, SortLevel, QueueItem,
etc.) from wherever they currently live in the codebase.

CONSTRAINTS:
- Pure function. No useState, useEffect, or any React import.
- No supabase, no fetch, no Date.now() unless passed as a parameter.
- Copy the filter/sort/grouping logic from the component EXACTLY as it is.
  Do NOT invent or improve behavior. This is a mechanical extraction.
- Do NOT import from src/app/.
- After creating: `npx tsc --noEmit` — paste. STOP.
```

### Commit
```bash
git add src/lib/queue/ && git commit -m "feat(queue): extract pure projectQueue function"
```

---

# SESSION 8.3 — Tests for `projectQueue`

**Model**: Opus 4.7 • **Thinking**: high • **Risk**: 🟢 Low

### Prompt

```
TASK: Create src/lib/queue/project.test.mts. Do not modify any other file.

Imports from src/lib/queue/project.ts only.

Required test coverage:
  - empty items → empty result
  - single building filter: matching item included, non-matching excluded
  - single status filter: matching included, non-matching excluded
  - fabricType filter
  - floor filter
  - combined building + status filter
  - sort by one level ascending
  - sort by one level descending
  - sort by two levels (primary + secondary)
  - ezSort "manufacturing" produces expected ordering (describe from the code, not invention)
  - role isolation: if role changes the output, test at least one role pair

Follow test style from src/lib/escalation-helpers.test.mts.
Run tests and paste FULL output. STOP.

CONSTRAINTS:
- Do NOT modify project.ts to make tests pass.
- If a test reveals a bug in the extracted logic, tell me — do NOT silently fix.
- `test.todo("...")` for anything behaviorally unclear.
```

### Commit
```bash
git add -A && git commit -m "test(queue): add unit tests for projectQueue"
```

---

# SESSION 8.4 — Wire `projectQueue` into the component

**Model**: Opus 4.7 • **Thinking**: high • **Risk**: 🟠 High

### Prompt

```
TASK: Replace inline filter/sort computation in the queue component with a
call to projectQueue(). This changes implementation, not behaviour.

Target: src/components/manufacturing/manufacturing-role-queue.tsx

Step A — From the audit (Step B), identify the EXACT lines in the component
where filtering and sorting happens. Show me the line numbers and the code.
STOP.

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

### Smoke test
Retake all baseline screenshots. **Diff against `docs/refactor/queue-baseline/`.**
Click every filter. Apply sort. Confirm all queue states look identical. ~45 min.

### Commit
```bash
git add -A && git commit -m "refactor(queue): wire projectQueue for filter/sort computation"
```

---

# SESSION 8.5 — Extract `useQueueFilters` (now just state — no logic)

**Model**: Opus 4.7 • **Thinking**: high • **Risk**: 🟡 Low

> With projectQueue extracting the logic in 8.2, this hook is now genuinely just state management — much simpler and safer than before.

### Prompt

```
TASK: Create src/components/manufacturing/use-queue-filters.ts.
Do NOT modify the component yet.

Export:

  export function useQueueFilters(): {
    buildingFilter: string[];
    setBuildingFilter: (v: string[]) => void;
    installDates: string[];
    setInstallDates: (v: string[]) => void;
    completionDates: string[];
    setCompletionDates: (v: string[]) => void;
    statusFilters: QueueStatusFilter[];
    setStatusFilters: (v: QueueStatusFilter[]) => void;
    fabricTypeFilter: string[];
    setFabricTypeFilter: (v: string[]) => void;
    floorFilter: string[];
    setFloorFilter: (v: string[]) => void;
    componentFilter: ComponentFilter;
    setComponentFilter: (v: ComponentFilter) => void;
    resetFilters: () => void;
  };

Use the EXACT same initial values as the useState calls in the component
(per the Session 8.1 audit).

After creating: `npx tsc --noEmit` — paste. STOP.
```

### Commit
```bash
git add src/components/manufacturing/use-queue-filters.ts && git commit -m "feat(queue): add useQueueFilters hook (additive)"
```

---

# SESSION 8.6 — Wire `useQueueFilters` into the component

⚠️ **Riskiest remaining edit.** Baseline screenshots must exist.

**Model**: Opus 4.7 • **Thinking**: high • **Risk**: 🔴 Highest

### Prompt

```
TASK: Replace 7 filter useState calls in the queue component with useQueueFilters().

Target: src/components/manufacturing/manufacturing-role-queue.tsx

Step A — Locate the 7 useState calls:
  buildingFilter, installDates, completionDates, statusFilters,
  fabricTypeFilter, floorFilter, componentFilter.

Step B — Show me the EXACT lines you will remove and the EXACT line you will
add. Do not edit yet. STOP.

[after "approved"]

Step C:
  1. Add: const filters = useQueueFilters();
  2. Replace every reference to the 7 state variables and their setters
     with filters.<name> and filters.set<Name>.
  3. DELETE (do not comment) the 7 old useState lines.

Step D:
  1. `npx tsc --noEmit` — paste.
  2. `npm test` — paste.
  3. `git diff src/components/manufacturing/manufacturing-role-queue.tsx` — paste.
  4. STOP.

CONSTRAINTS — INVIOLABLE:
- Do NOT change any JSX.
- Do NOT change projectQueue call or displayRows.
- Every reference to every filter variable must be replaced. Missing one breaks the queue.
- If you're unsure about even one reference, STOP and ask.
```

### Smoke test (full)
Retake all baseline screenshots. **Diff visually.** Click every filter + sort + modal. ~45 min.

### Commit
```bash
git add -A && git commit -m "refactor(queue): replace filter useState with useQueueFilters"
```

---

# SESSIONS 8.7–8.9 — Extract sort, print, actions hooks

Repeat the **8.5 → 8.6 pattern** for each:

| Sessions | Hook | State variables |
|---|---|---|
| 8.7a + 8.7b | `useQueueSort` | sortLevels, sortModalOpen, draftSortLevels, ezSort, ezSortModalOpen |
| 8.8a + 8.8b | `useQueuePrint` | printModalOpen, printLabelMode, skipAlreadyPrinted |
| 8.9a + 8.9b | `useQueueActions` | busyWindowId + useTransition calls |

Screenshot diff + smoke test after each `b` session. One commit per pair.

---

# SESSION 8.10 — Split JSX (LATER, ≥ 14 days after 8.9)

By this point the component's render function will be substantially smaller. Plan a fresh Opus 4.7 session. Split sub-trees into dedicated components using the same one-at-a-time pattern as Phase 5.

---

# 🧯 Panic page

### tsc errors after a step
```bash
git diff <file>            # see what changed
# Tell the AI to show you the diff — do NOT let it revert for you
# Once you understand the change, decide: fix or revert manually:
git checkout -- <file>     # only if baseline git status was clean before the session
```

### Build passes, app behaves wrong
```bash
git log --oneline -10
git revert <commit-hash>   # makes a NEW commit undoing the bad one
# Do NOT use `git reset --hard`
```

### AI edited the wrong file mid-session
```bash
git diff --name-only       # see what it touched
git checkout -- <wrong-file>
# Restart the session in a fresh conversation
```

### Prod is broken, you're at the airport
On phone, GitHub web UI:
1. Open the bad PR → click "Revert" → merge the revert PR.
2. Vercel redeploys previous good version automatically.

This is why every phase is one PR.

---

# ⏱ Pacing reference

| Week | Sessions |
|---|---|
| 1 | Pre-flight, 1.1, 1.2, 2.1 |
| 2 | 3.1, 3.2, 3.3, 3.4 |
| 3 | 3.5, 3.6, 3.7, 3.8 (one per day) |
| 4 | 3.9 (cleanup), 4.1, 4.2 |
| 5 | 4.3, 4.4 + soak |
| 6 | 5.1, 5.2, 5.3 + soak |
| 7 | 5.4.1–5.4.6 (one per day) |
| 8 | 6.1, 6.2, 6.3, 6.4 + soak |
| 9 | 6.5, 6.6, 6.7, 7.1, 7.2 |
| 10 | 7.3, 7.4, 7.5 + soak |
| 11 | 8.0 (screenshots), 8.1, 8.2, 8.3 |
| 12 | 8.4, 8.5, 8.6 + soak |
| 13 | 8.7, 8.8, 8.9 + soak |

---

# 🤖 Model + thinking quick reference

| Phase | Model | Thinking |
|---|---|---|
| 1 | Haiku 4.5 | off |
| 2 | Sonnet 4.6 | medium |
| 3 | Sonnet 4.6 | high |
| 4 | Opus 4.7 | high |
| 5 | Opus 4.7 | high |
| 6 | Opus 4.7 | high |
| 7 | Opus 4.7 | high |
| 8 | Opus 4.7 | high |

Do not downgrade Opus to Sonnet for cost. A production regression costs more.
