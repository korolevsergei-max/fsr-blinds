# Security Remediation Plan

Derived from the full security & stability audit (2026-07-13). Findings are referenced
by their audit IDs (C1, C2, H1, H2, M1–M4, L1–L3).

**Core problem being fixed:** authorization currently lives almost entirely in the app
layer (middleware + server-action role checks). The database is wide open — core-table
RLS is `USING (true)` for any logged-in user, some tables are reachable by unauthenticated
clients, and the "get everything" RPCs are granted to every role. Because the Supabase URL
and publishable key ship in the browser bundle, anyone can talk to PostgREST directly and
bypass every app-layer check. The plan moves enforcement **into the database** while
keeping legitimate per-role visibility byte-identical.

## ⚠️ Execution status & correction (updated 2026-07-13)

Phases were run out of order: **Phase 1 was executed first on `claude-sonnet-5`, then
Phase 0 was run afterward to catch up.** This needs a correction pass before continuing —
not because Phase 1's changes corrupt the Phase 0 baseline (they don't; see below), but
because a high-risk phase ran on the weaker model, and the baseline was captured against a
state that phase produced.

**Does the 0↔1 swap invalidate the baseline?** No, *if* Phase 1 was done correctly. The
Phase 0 golden set measures **authenticated per-role visibility of core tables** (used to
validate Phase 2). Phase 1 only removed **anon** access and **storage write/delete** — it
must not change what a logged-in owner/installer/scheduler sees on
`clients/units/rooms/windows/schedule`. So a baseline captured after a *correct* Phase 1 ==
a baseline captured before it.

**The real risk:** Phase 1 ran on Sonnet and has one genuine trap — the `fsr-media` bucket
is `public = true` and images are served by public URL, so access must be narrowed to
**read-only public, write/delete denied**. If Sonnet over-tightened (broke authenticated
image reads) or under-tightened (left anon/public write or delete open), then Phase 0
recorded a *broken or still-vulnerable* state as "golden," and Phase 2 would faithfully
reproduce it.

**Correction path (do these before Phase 2):**
1. **Run Phase 1-R** (below) on `claude-fable-5` — re-verify and, if needed, correct what
   Sonnet shipped.
2. **Re-validate the Phase 0 baseline** against the corrected state (Phase 0's "re-validate"
   note). Only then is the golden set trustworthy for Phase 2.
3. Proceed to Phase 2 as originally planned.

Phases 3–8 are unaffected by the swap.

## How to read the model / thinking column

Each phase names a **model** and a **thinking level**. Rationale:

- **Model** — RLS and multi-role data-visibility work is the highest-stakes, most
  error-prone part of this codebase (a wrong policy silently locks out real users or
  silently leaves a hole). Those phases get the strongest model. Mechanical or
  well-bounded work (dependency bumps, config, gitignore) gets a cheaper model.
- **Thinking level** — uses Claude Code's escalating budgets: `think` < `think hard` <
  `think harder` < `ultrathink`. Phases where a mistake is invisible until exploited get
  the deepest budget; phases with an obvious pass/fail signal get less.

Set the model per phase with `/model`. If running phases as subagents, pass the model
explicitly. **Do not batch Phase 1 and Phase 2 into one session** — each needs a clean
verification pass before the next.

---

## Phase 0 — Baseline & safety net

| | |
|---|---|
| **Model** | `claude-sonnet-5` |
| **Thinking** | `think` |
| **Fixes** | none (prep) |
| **Risk** | low |
| **Status** | ✅ baseline re-validated 2026-07-13 by Phase 1-R (`pg_policies` capture identical to confirmed-correct live state) — golden set trustworthy for Phase 2 (see `PHASE1R_REPORT.md`) |

> **Was meant to run first.** It ran after Phase 1, so the golden set was captured against
> the state Sonnet's Phase 1 produced. That's acceptable *only once Phase 1-R confirms that
> state is correct* — otherwise the baseline encodes whatever Sonnet got wrong. After
> Phase 1-R, re-run the parity capture (or diff the existing capture against the corrected
> state) before trusting it for Phase 2.

**Goal:** be able to prove, before and after, exactly which rows each role can see — so
the RLS rewrite can be validated instead of guessed.

- Take a fresh off-site DB snapshot (the nightly `pg_dump` + rclone job / manual snapshot
  script). Confirm rollback works before touching policies.
- Do the RLS work on a **Supabase branch / staging project**, never prod first.
- Write a throwaway parity script (the team has done this before — see
  `docs/refactor/PERF_BASELINE.md` "service-role parity diff"): for each role, capture the
  exact set of `clients / buildings / units / rooms / windows / schedule_entries` rows the
  app returns **today**. This is the golden set every later phase must reproduce.
- Enumerate every distinct `anon` and `authenticated ... USING (true)` policy and every
  `SECURITY DEFINER` function `GRANT`ed to `authenticated` (audit already lists them; verify
  against the live DB in case prod drifted from migrations).

**Done when:** you have a reproducible per-role row-count/row-set baseline and a verified
restore path.

---

## Phase 1 — Emergency lockdown: remove unauthenticated access (C1)

| | |
|---|---|
| **Model** | `claude-fable-5` (originally executed on `claude-sonnet-5` — see Phase 1-R) |
| **Thinking** | `think harder` |
| **Fixes** | **C1** (anon RLS on `media_uploads`, `notifications`, `notification_reads`, `unit_activity_log`; `public` write/delete on `fsr-media` storage) |
| **Risk** | high — this is the widest-open door; also the one most likely to break image display if done carelessly |
| **Status** | ✅ verified correct by Phase 1-R on Fable 2026-07-13 — no correction needed; guard check (was missing) added and applied live (see `PHASE1R_REPORT.md`) |

**Why first:** C1 is exploitable by anyone on the internet with zero credentials (the
publishable key is public). It is both the highest impact and the most self-contained fix.

**Work:**
- New migration that `DROP`s every `dev_anon_all_*` policy and the
  `fsr_media_objects_all ... FOR ALL TO public` policy.
- Recreate needed access scoped `TO authenticated`.
- **The one trap:** the `fsr-media` bucket is `public = true` and images are served by
  public URL. Removing `TO public` entirely will break `<img>` rendering. Keep a
  **read-only** public path (public bucket read is fine) but remove anon/`public`
  `INSERT/UPDATE/DELETE`. Verify a logged-out browser can still *view* an image URL but a
  `curl` `DELETE`/`POST` with only the anon key now 401/403s.
- Add a guard migration/CI check asserting **no `anon` policies exist on any `public`
  table**.

**Verify (must all hold):**
- Logged-out `curl` to `/rest/v1/notifications`, `/unit_activity_log`, `/media_uploads`
  with only `apikey` → empty/denied, not data.
- Logged-out attempt to `DELETE` a `fsr-media` object → denied.
- App still renders photos; notifications/activity log still work when logged in.

---

## Phase 1-R — Re-verify Phase 1 on Fable (correction pass)

| | |
|---|---|
| **Model** | `claude-fable-5` |
| **Thinking** | `think harder` |
| **Fixes** | re-verifies **C1**; produces a fix migration only if Sonnet's Phase 1 was wrong |
| **Risk** | high — this is the trust checkpoint the swapped ordering skipped |
| **Status** | ✅ done 2026-07-13 — all checks passed except the (missing) guard check, now created, self-tested, and live; baseline re-validated; Phase 2 greenlit (see `PHASE1R_REPORT.md`) |

**Why this phase exists:** Phase 1 shipped on Sonnet, the weaker model, on a high-risk task
with a real footgun (the `fsr-media` read-vs-write split). Rather than assume it's right,
Fable audits the *actual shipped state* against Phase 1's intent, corrects it if needed, and
only then greenlights the Phase 0 baseline for Phase 2. **Audit the live/branch database
state, not just the migration file** — confirm what's actually enforced.

**Checklist (each must hold; write a fix migration for any that don't):**
- Every `dev_anon_all_*` policy is gone; **no `anon` policy remains on any `public` table**
  (`media_uploads`, `notifications`, `notification_reads`, `unit_activity_log`, and any
  other). Query `pg_policies` directly to confirm.
- `fsr_media_objects_all ... FOR ALL TO public` is gone. Storage access on `fsr-media` is
  **read-only for public/anon; INSERT/UPDATE/DELETE denied** to anyone not authenticated.
- **Not over-tightened:** an authenticated user can still upload/read photos through the app,
  and logged-out `<img>` rendering of a known public URL still works. (Over-tightening here
  is the silent-breakage risk — a Sonnet pass could have removed public read too.)
- The guard check (no anon policies on `public`) actually exists, not just intended.
- Adversarial: logged-out `curl` with only `apikey` to `notifications` / `unit_activity_log`
  / `media_uploads` → denied; logged-out `DELETE` of a `fsr-media` object → denied.

**Done when:** all checks pass (or a correction migration makes them pass), **then**
re-validate the Phase 0 baseline against this confirmed-correct state. Only after that is
the golden set trustworthy for Phase 2.

---

## Phase 2 — Scope authenticated access & the dataset RPCs (C2)

| | |
|---|---|
| **Model** | `claude-fable-5` |
| **Thinking** | `ultrathink` |
| **Fixes** | **C2** (`authenticated_all_* USING (true)`; `get_full_dataset` / `get_owner_dataset` / `get_scheduler_dataset` / `get_installer_dataset` granted to all authenticated with no caller check) |
| **Risk** | highest — a wrong policy silently locks out a real installer/scheduler OR silently leaves PII readable; failures are invisible without the Phase 0 baseline |
| **Status** | ✅ done 2026-07-13 on Fable — 26 blanket policies replaced with per-role scoped policies, 5 dataset RPCs caller-gated + anon EXECUTE revoked, anon table grants dropped, reflow moved to service-role client, `units` ownership-column trigger added. Verified: 117/117 live per-user session checks + 16/16 RLS write-policy checks + golden-set parity byte-identical. Two bugs found & fixed by the probes (fail-open NULL gate; cutter column-immutability). See `PHASE2_REPORT.md`; rollback `PHASE2_ROLLBACK.sql`. |

**Why the strongest model + deepest thinking:** this is the crux finding and the hardest to
get right. The new policies must reproduce **exactly** the per-role visibility the app
relies on today (owner = all; installer = units where `assigned_installer_id` = their linked
id + those units' buildings/clients/rooms/windows/schedule; scheduler = assigned units +
team-installer units; cutter/assembler/qc = the manufacturing scope they actually use). Too
tight → legitimate users get empty screens. Too loose → the leak remains. Both layers
(table RLS **and** the SECURITY DEFINER RPCs) must move together, or scoping one while the
other stays open fixes nothing.

**Work — two layers, same migration set:**
1. **Table RLS:** replace `authenticated_all_* USING (true)` on `clients`, `buildings`,
   `units`, `rooms`, `windows`, `schedule_entries`, `media_uploads`, and the manufacturing
   tables with role/ownership-scoped policies, reusing the existing `public.get_user_role()`
   helper (and linked-account lookups) rather than trusting client input.
2. **RPC caller checks:** inside each `SECURITY DEFINER` function, resolve the caller from
   `auth.uid()`:
   - `get_full_dataset()` / `get_owner_dataset()` → require owner.
   - `get_installer_dataset(p_installer_id)` → require the caller's own linked installer id
     (or owner); reject an arbitrary `p_installer_id`.
   - `get_scheduler_dataset(p_scheduler_id)` → same, caller's own scheduler id or owner.
   - Server actions call these via the user-context server client, so `auth.uid()` is
     correct — confirm none rely on the admin/service-role client to call them.

**Verify against the Phase 0 golden set:** for every role, the app's returned row sets are
**identical** to baseline. Then, adversarially: a logged-in cutter calling
`rpc('get_full_dataset')` or `from('clients').select('*')` directly → denied/empty;
`get_installer_dataset('someone-elses-id')` → denied/empty.

**Rollback note:** keep the migration reversible; the audit notes `get_full_dataset` was
kept as a rollback path — preserve that discipline here.

---

## Phase 3 — Upgrade Next.js past the middleware-bypass advisories (H1)

| | |
|---|---|
| **Model** | `claude-sonnet-5` |
| **Thinking** | `think` |
| **Fixes** | **H1** (Next.js 16.2.1 → patched 16.2.x) |
| **Risk** | medium — mechanical bump, but middleware is the app's route gate, so regression-test auth flows |

- Bump `next` to the patched release `npm audit` names (`16.2.10`) and `eslint-config-next`
  to match.
- Full typecheck + build (note: the committed `vercel_deploy_log.txt` shows a past build
  failing on a real type error — expect to actually run `npm run build`, not assume green).
- Manually retest: login, each role's portal redirect, the invalid-refresh-token purge path,
  and a deep link into a portal segment while logged out.
- Deploy to a Vercel preview before promoting.

**Sequencing:** independent of Phases 1–2; can run in parallel by a separate session if
desired. Best done after Phase 2 so auth regression testing happens against the new policies.

---

## Phase 4 — Close the server-action authorization gaps (H2, M1, L1)

| | |
|---|---|
| **Model** | `claude-fable-5` |
| **Thinking** | `think hard` |
| **Fixes** | **H2** (`createClient_`, `updateClient`, `createBuilding`, `updateUnit` missing `requireOwner`), **M1** (notification actions trust client-supplied identity), **L1** (`markLabelsPrinted` / `markCutListPrinted` unauthenticated) |
| **Risk** | medium — small diffs, but easy to under-scope (which role should each action allow?) |
| **Status** | ✅ done 2026-07-17 on Fable — H2: `requireOwner` added to the four actions (matching sibling delete/bulk guards); M1: `markNotificationRead` / `markAllNotificationsRead` now derive role + linked scheduler/installer id from the session (client-supplied params removed, caller updated); L1: `requireCutterOrOwner` promoted to `src/lib/auth.ts` and applied to both label-print actions (cutter-production-actions deduped to use it). Sweep result: all `src/app/actions/auth/**` account actions guarded via `assertOwnerForAccountActions`; manufacturing actions guarded via `requireManufacturingUser` / explicit role checks; remaining field actions (rooms/windows/photos) run on the user-context client and are scoped by the Phase 2 RLS write policies (justified: multi-role by design, DB backstops). Typecheck + build green. |

- **H2:** add `await requireOwner()` (or `requireOwnerOrScheduler()` where the sibling
  actions use it) to the four unguarded actions in `src/app/actions/management-actions.ts`,
  matching the guarded delete/bulk actions beside them.
- **M1:** in `src/app/actions/fsr-data/notifications.ts`, derive `userRole`/`userId` from
  `getCurrentUser()` inside the action; delete the client-supplied parameters and update
  callers.
- **L1:** add `requireCutterOrOwner()` to the two label-print actions.
- Sweep the rest of `src/app/actions/**` while here: every exported action should either
  require a role or justify why it's callable by any authenticated user. The Phase 2 DB
  policies now backstop these, but keep the app layer honest too (defense in depth).

**Verify:** a non-owner session calling each newly-guarded action → rejected; owner/intended
role → still works.

---

## Phase 5 — Security headers (M2)

| | |
|---|---|
| **Model** | `claude-sonnet-5` |
| **Thinking** | `think hard` |
| **Fixes** | **M2** (no CSP / X-Frame-Options / HSTS / X-Content-Type-Options) |
| **Risk** | medium — the CSP is the only fiddly part; a too-strict policy breaks the app, a too-loose one is pointless |

- Add `async headers()` in `next.config.ts`:
  - `Content-Security-Policy` — allow `self` plus the only external origins the app uses:
    the Supabase project origin (`fbjjqfmsroryfgfushmb.supabase.co`, incl. `wss:` for
    realtime) and `api.dicebear.com` for avatars. Account for Next.js inline/hydration needs
    (nonce or the framework's guidance). **Ship `Content-Security-Policy-Report-Only`
    first**, watch for violations, then flip to enforcing.
  - `X-Frame-Options: DENY` (+ CSP `frame-ancestors 'none'`).
  - `X-Content-Type-Options: nosniff`.
  - `Referrer-Policy: strict-origin-when-cross-origin`.
  - `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`.
- The thinking budget is for getting the CSP allowlist right against the real asset/network
  graph, not for the other (static) headers.

**Verify:** app loads with no CSP console violations in each portal; realtime WebSocket
still connects; avatars still render.

---

## Phase 6 — Dependency hygiene (M3)

| | |
|---|---|
| **Model** | `claude-haiku-4-5` |
| **Thinking** | `think` (none needed beyond confirming nothing breaks) |
| **Fixes** | **M3** (`ws` high-severity advisories, transitive) |
| **Risk** | low — non-breaking `npm audit fix` |

- Run `npm audit fix` (updates `ws` within range; the second copy is dev-only via
  `webpack-bundle-analyzer`).
- Re-run `npm audit`; confirm the `ws` highs clear and nothing new breaks the build.
- Note real-world exposure is low (realtime is browser-only, native WebSocket), so this is
  hygiene, not urgent — but it's free.

---

## Phase 7 — Rate limiting on expensive authenticated endpoints (M4)

| | |
|---|---|
| **Model** | `claude-fable-5` |
| **Thinking** | `think hard` |
| **Fixes** | **M4** (`refreshDataset` and unit-detail refetch actions are unthrottled full-dataset aggregations) |
| **Risk** | medium — design work; must not throttle legitimate realtime-driven refreshes |

- Gate `refreshDataset('full' | 'scheduler' | 'installer')` on the matching role (today only
  the installer branch checks) — this also composes with the Phase 2 RPC caller checks.
- Add lightweight per-user rate limiting to the expensive refresh/refetch server actions
  (the realtime bridge legitimately fires these on reconnect, so tune the window against the
  120ms debounce in `use-realtime-sync.ts` — don't starve normal use).
- Confirm the already-fixed bounded fan-out (`selectInChunks`, concurrency 4) stays intact.

**Verify:** a loop hammering `refreshDataset` is throttled; normal tab-focus / reconnect
refresh still feels instant.

---

## Phase 8 — Repo & trigger cleanup (L2, L3)

| | |
|---|---|
| **Model** | `claude-haiku-4-5` |
| **Thinking** | `think` |
| **Fixes** | **L2** (committed `tmp/*.json` business data), **L3** (`handle_new_user` trusts signup `raw_user_meta_data.role`) |
| **Risk** | low |

- **L2:** add `tmp/` to `.gitignore` and `git rm --cached tmp/*.json`. No secrets, but
  production data doesn't belong in the repo.
- **L3:** change the `handle_new_user` trigger to ignore `raw_user_meta_data` for role
  (read only `raw_app_meta_data`, or drop role-from-metadata entirely). Not currently
  exploitable (the app sets roles via the service-role `app_metadata` path and middleware
  ignores `user_metadata`), but it becomes a self-serve `owner` escalation the moment public
  signup is ever enabled. Fix now while it's cheap.

---

## Suggested execution order & parallelism

**Originally planned:** 0 → 1 → 2 → (3 in parallel) → 4 → (5,6,7,8 as time allows).

**Actual + corrected path from here** (Phase 1 ran on Sonnet, Phase 0 ran after it):

1. **Phase 1-R** on `claude-fable-5` — re-verify/correct the shipped Phase 1 (the trust
   checkpoint the swap skipped). Blocking.
2. **Re-validate the Phase 0 baseline** against the confirmed-correct state (Phase 0 note).
   Blocking — Phase 2 depends on a trustworthy golden set.
3. **Phase 2** → verify against baseline. Do not start until steps 1–2 pass.
4. **Phase 3** can run in parallel now (separate session, cheaper model) but regression-test
   after Phase 2 lands.
5. **Phase 4** after Phase 2 (DB now backstops it).
6. **Phases 5, 6, 7, 8** are independent of each other; schedule by available time.

**Highest urgency = Phase 1-R then Phase 2.** Phase 1 is already deployed but unverified on
the intended model; Phase 2 is the other open door. Together they close unauthenticated
access and "any logged-in user reads everything" — reachable today with nothing but the
site's public page source.
