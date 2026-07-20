# Deep Code Assessment — 2026-07-17

**Produced by executing [DEEP_ASSESSMENT_PROMPT_2026.md](DEEP_ASSESSMENT_PROMPT_2026.md)** against `main` @ c6c0475.
**Scope:** performance · security · best-practice code quality → one unified phased plan with model/thinking per phase.
**Prior art:** [WORLD_CLASS_ROADMAP_2026H2.md](refactor/WORLD_CLASS_ROADMAP_2026H2.md) (perf, 2026-07-13, still fully current) and [SECURITY_REMEDIATION_PLAN.md](security/SECURITY_REMEDIATION_PLAN.md) (Phase 4 closed earlier today, `c6c0475`). This doc does **not** duplicate their findings; it verifies their status, adds what they missed, and merges both into one sequence.

---

## 1. Verified current state (code is truth, docs were not)

| Claim in prior docs | Verified reality (2026-07-17) |
|---|---|
| Security Phases 0–3 done (C1, C2, H1) | ✅ Confirmed (migrations `20260713*` present; Next 16.2.10 in package.json) |
| Security Phase 4 (H2, M1, L1) | ✅ **Shipped earlier today** (`c6c0475`; plan status note updated in the same commit). Independently re-verified in code: `requireOwner()` in the four management actions ([management-actions.ts:131,161,338,497](../src/app/actions/management-actions.ts#L131)); notifications derive recipient from session ([notifications.ts:16-30](../src/app/actions/fsr-data/notifications.ts#L16-L30)); label-print uses `requireCutterOrOwner()` ([label-print-actions.ts:15](../src/app/actions/label-print-actions.ts#L15)). The memory index still said "Phase 4 next up" — that was the stale artifact, now corrected. |
| Security Phases 5–8 (M2, M3, M4, L2, L3) open | ✅ Confirmed open: no security headers anywhere (next.config.ts, vercel.json, middleware all clean of them); `npm audit` = 1 high + 3 moderate; no rate limiting; `tmp/*.json` business data still git-tracked; `handle_new_user` trigger unchanged |
| Perf roadmap Phases 0–9 pending | ✅ Confirmed **zero shipped**: `removeConsole` excludes only `error`, no `scripts/perf-budget.mjs`, no `get_role_schedule` migration, latest migration is `20260713180000` |
| 85/85 tests green, pure-logic only | ✅ 17 test files, all in `src/lib`, none cover loaders/actions/RPC parity |

---

## 2. Findings

### 2.1 Security (new findings this assessment — beyond the existing plan)

| # | Finding | Score | Evidence |
|---|---|:---:|---|
| S1 | **`revalidation.ts` exports 5 unauthenticated server actions.** Every exported `"use server"` function is a POST endpoint; these take no guard at all. `revalidateAllPortalData()` invalidates every portal layout — combined with the 5 s queue read and 509 KB owner dataset, an anonymous caller has a cheap cache-bust/DoS lever. | **6.5** | [revalidation.ts:1-30](../src/app/actions/revalidation.ts#L1-L30) — zero auth imports |
| S2 | `fsr-data/rooms.ts` (and windows/photos) mutations carry no explicit role guard — but the Phase 4 sweep **already considered and justified this**: they run on the user-context client and Phase 2 RLS write policies scope them (multi-role by design). Downgraded to a convention note: the justification lives in a prose status note; S1's authz-matrix artifact should record it durably so the next sweep doesn't re-flag it. | **2.5** | [rooms.ts:8-25](../src/app/actions/fsr-data/rooms.ts#L8-L25); security plan Phase 4 status note (2026-07-17) |
| S3 | Dependency advisories: **@babel/core ≤7.29.0 (high, arbitrary file read — build-time only)**, brace-expansion / dompurify / js-yaml (moderate). All fixable via `npm audit fix`; none are runtime-exploitable in the deployed app, so this is hygiene, not fire. | **4** | `npm audit` this session |
| S4 | `/qc` missing from middleware `PORTAL_REQUIRED_ROLE` — unauthenticated hits reach the layout before bouncing (defense-in-depth gap + wasted render; also perf finding 6.5). | **3** | [middleware.ts:36-42](../src/lib/supabase/middleware.ts#L36-L42) |

Inherited-and-still-open from the security plan: **M2** headers, **M4** rate limiting, **L2** tracked `tmp/*.json`, **L3** signup trigger. Their write-ups in [SECURITY_REMEDIATION_PLAN.md](security/SECURITY_REMEDIATION_PLAN.md) remain valid — reuse them.

### 2.2 Performance

The four-day-old [WORLD_CLASS_ROADMAP_2026H2.md](refactor/WORLD_CLASS_ROADMAP_2026H2.md) findings table (§2, axes 1–7) was spot-verified and stands unchanged — nothing has shipped since it was written and the data has only grown. Headlines, for orientation only: 5.17 s manufacturing queue read on every factory-role view (finding 3.1, score 9.5); function region 4,000 km from the DB (5.1, score 8.5); zero optimistic UI (1.1–1.2, score 9); N+1 risk-flag scan on every dashboard view (3.3, score 8); zero prod timing instrumentation (7.1, score 7.5). **Do not re-derive these — the roadmap's §2 is the performance findings table of this assessment.**

### 2.3 Best-practice code quality

| # | Finding | Score | Evidence |
|---|---|:---:|---|
| Q1 | **No runtime validation at any network trust boundary.** RPC payloads are `as`-cast (roadmap 6.2); server-action inputs are trusted TypeScript shapes. A migration-side column rename fails at render, not at the boundary. | **5.5** | [datasets.ts:40-54](../src/lib/server-data/datasets.ts#L40-L54) |
| Q2 | **No timeouts/AbortSignal on any Supabase call** — hung fetch = skeleton forever / action hangs (roadmap 6.3). | **5** | `grep -rn abortSignal src/lib` = 0 |
| Q3 | **Test coverage stops at pure logic; no CI enforces anything.** 17 test files, all `src/lib/*.test.mts`; no `.github/workflows/` in the repo at all — lint/typecheck/test/perf-budget run only when a human remembers. | **5.5** | `ls .github/workflows` = absent; `find src -name "*.test.*"` |
| Q4 | **11 files exceed 750 lines** (management-actions.ts 988, photos.ts 905, window-form.tsx 863 …). Not urgent — but every one is a merge-conflict magnet and an agent-context tax; split opportunistically when a phase touches them, not as a dedicated rewrite. | **3.5** | `wc -l` sweep this session |
| Q5 | **Otherwise the baseline is genuinely strong** — `strict: true`, 1 `as any` in src, 0 `@ts-ignore`, 0 TODO/FIXME, 6 `eslint-disable`, consistent action/guard conventions. Recorded so nobody "fixes" what isn't broken. | — | sweeps this session |

---

## 3. Unified phased plan

**Sequencing rationale.** Stage A is a week of small, near-zero-risk closures: it retires the entire open security tail (whose items are all cheap) and lands the two perf multipliers (observability, function region) that make every later phase measurable and faster. Stage B is the felt-latency core — the roadmap's centerpiece phases. Stage C is data-model durability. Stage D is the quality floor and QA debt. Within a stage, order is dependency-driven; across stages, don't start B until A is fully shipped (A's Phase 1 changes every measurement B relies on).

**After every phase:** `npm run lint && npm run typecheck && npm run build && npm test` (+ `perf-budget` once A2 lands), re-measure the phase's stated metric, one revertible commit, append a status note here.

| Phase | What | Source | Model · thinking | Effort |
|---|---|---|---|:---:|
| **A1** | Hygiene sweep: ~~`npm audit fix` (S3/M3)~~ ✅ `f8c9a59` · ~~`.gitignore` + `git rm --cached tmp/*.json` (L2)~~ ✅ `2fb40a6` · **remaining: add `/qc` to middleware map (S4)** | new + sec P6/P8 | **Haiku 4.5 · low** — fully checklist-specified | ¼ session left |
| **MF0** | **Manufacturing correctness hotfix (ship immediately):** unit-detail loaders fetch ALL facility windows unfiltered, truncated at 1,000 rows — 369/393 units show missing windows today (17 in-zone). Filter by the unit's room ids; delete the dead truncated loaders. See [MANUFACTURING_PERF_ASSESSMENT_2026-07-19.md](MANUFACTURING_PERF_ASSESSMENT_2026-07-19.md) M1/M8 | mfg assessment | **Sonnet 5 · medium** — mechanical but verify against the affected-units probe | ½ session |
| **A2** | Perf observability floor: `[perf]` logs surviving prod builds, `perf-budget.mjs` + baseline JSON, RUM ritual | roadmap **Phase 0** (use its prompt verbatim) | **Sonnet 5 · medium** | 1 session |
| **A3** | Function region → `pdx1`, before/after measurement | roadmap **Phase 1** (prompt verbatim) | any · low (config + measurement) | ½ session |
| **A4** | Residual authz closure: guard or un-export `revalidation.ts` actions (S1 — the one export family the Phase 4 sweep missed — **re-verified still open 2026-07-19**); commit the traced authz matrix of every `"use server"` export as `docs/security/ACTION_AUTHZ_MATRIX.md`, recording the RLS-backstop justifications durably (S2); ~~harden `handle_new_user` (L3)~~ ✅ `2fb40a6` (+ owner self-signup closed, `2acd458`) | new + sec P8 | **Opus 4.8 · high** — auth correctness; a wrong guard locks out a legitimate role | 1 session |
| **A5** | ~~Security headers~~ ✅ `67ea9fd` — HSTS/XFO/XCTO/Referrer-Policy live; **remaining: CSP Report-Only → enforce flip after a clean soak** | sec **Phase 5** (M2) | escalate CSP-enforce decision to **Opus 4.8 · high** if reports show violations | flip pending |
| **B1** | Instant queue actions: optimistic everywhere, coalesced refresh. **Amended 2026-07-19:** (1) do NOT delete the filter-refresh effects yet — they are the factory screens' only in-place freshness (no realtime/polling exists there); that deletion moves to MF2. (2) Extend the same treatment to pushback/undo actions + completed-screen/unit-detail handlers: move their five inline `reflowManufacturingSchedules` awaits into `after()`, shrink the 6-path `revalidateManufacturingPaths()`. See mfg assessment M2/M5 | roadmap **Phase 2** (prompt + amendments) | **Opus 4.8 · high** — UX/realtime interaction semantics | 1–2 sessions |
| **MF2** | Factory-portal freshness: scoped realtime subscription (or 60 s visibility-gated poll fallback) feeding B1's coalesced refresh, so idle bench tablets see stage handoffs; THEN delete the 400 ms filter-refresh effects (B1's deferred part). See mfg assessment M2 | mfg assessment | **Opus 4.8 · high** — a missed status update on a factory tablet is a correctness bug | 1 session |
| **B2** | `get_role_schedule` RPC — queue read ~3–5 s → <500 ms, one round-trip. **Amended 2026-07-19:** RPC returns actionable items full-fidelity + `allItems` as the ~8-field projection the client actually uses (measured payload today: ~2.5 MB/view, 97% history) targeting ≤ ~300 KB; fold the completed-view redundant escalation re-fetch (M4) and the process-screen count aggregation (M6) into the same migration | roadmap **Phase 3** (prompt + amendments) | **Fable 5 · high** — SQL/TS contract parity (M6 execution: Sonnet 5 · medium) | 1–2 sessions |
| **B3** | ~~Rate limiting~~ ✅ `6e3b424` (shipped early, before B2 — per-user token bucket on dataset-query actions; `src/lib/rate-limit.ts`). Constraint for MF2/B2: coalesced refreshes must stay under its rules | sec **Phase 7** | — | done |
| **C1** | Archive completed schedule rows — bounded reads forever | roadmap **Phase 4** (prompt verbatim) | **Fable 5 · high** — data-model change + byte-parity gate | 2 sessions |
| **C2** | Risk flags → mutation-triggered + daily cron, set-based SQL | roadmap **Phase 5** (prompt verbatim) | **Opus 4.8 · high** — notification idempotence | 1 session |
| **C3** | Auth trim (claims fast-path), static `/login`, revalidation scope diet | roadmap **Phase 6** (prompt verbatim; its sub-part D already done in A1 — skip it) | **Opus 4.8 · high** — trust model must hold | 1–2 sessions |
| **C4** | `windows.unit_id` + server-side realtime scoping | roadmap **Phase 7** (prompt verbatim) | **Fable 5 · high** — missed-event risk (DELETE caveat) | 1–2 sessions |
| **D1** | Owner payload diet (projection first) | roadmap **Phase 8** (prompt verbatim) | **Fable 5 · high** (design/field audit) → hand execution to **Sonnet 5 · medium** | 1–3 sessions |
| **D2** | Quality floor: (a) lightweight runtime assertion helpers at the RPC/action boundary (Q1 — hand-rolled narrow checks, not a zod dependency: bundle + Hobby cold-start cost); (b) AbortSignal timeout wrapper on Supabase calls (Q2); (c) GitHub Actions CI running lint/typecheck/test/perf-budget on PR (Q3) | new | design **Fable 5 · high** (a,b are API-shape decisions every future file inherits); execute **Sonnet 5 · medium** (c is pure Sonnet) | 1–2 sessions |
| **D3** | Slow-4G walkthrough + concurrency probe; record §1 targets "after" column | roadmap **Phase 9** | any · low + manual | 1 session |

**Thinking-effort legend:** high = extended thinking, generous budget, adversarial self-review before writing; medium = standard reasoning; low = direct execution. Run the *assessment refresh* itself (re-executing the prompt next cycle) with **Fable 5 · high**.

---

## 4. Constraints & rejected ideas

**Hard constraints** — inherited verbatim from the roadmap §6 (live prod, revertible commits, no reflow-math changes, `app_metadata`-only trust, realtime > perf, Hobby limits, RLS + offline-upload preserved). One addition: **A4's authz matrix becomes a maintained artifact** — any new server action lands with a matrix row, enforced by review convention (and by D2c's CI grep if desired).

**Rejected in this assessment** (in addition to the roadmap §5 table, which stands):

| Idea | Verdict | Why |
|---|---|---|
| Adopting zod/valibot for boundary validation | Rejected for now | Two RPC families and a handful of action inputs don't justify a schema-library dependency; hand-rolled assertions (D2a) cover the drift-detection need at zero bundle cost. Revisit if boundary count triples. |
| Dedicated "split the 988-line files" refactor phase | Rejected | Pure churn risk with no behavior win; Q4 is handled opportunistically inside phases that already touch those files. |
| Separate security vs perf tracks run in parallel | Rejected | Same files, same reviewers, same deploy pipe; interleaving (Stage A security-heavy → B/C perf-heavy) avoids merge conflicts and lets A3's region move re-baseline everything once. |
| Web Application Firewall / Vercel WAF rules for S1 | Rejected | Guarding the actions (A4) is the correct fix; WAF is Pro-plan and treats the symptom. |

---

## 5. Status log

| Date | Phase | Result |
|---|---|---|
| 2026-07-17 | Assessment | This doc. Verified security Phase 4 shipped same day (`c6c0475`); memory index corrected; S1 (`revalidation.ts` unauthenticated actions) is the main new security finding. |
| 2026-07-17/18 | A1 (partial), A4 (partial), A5, B3 | Shipped via the security-plan track: headers `67ea9fd` (CSP Report-Only), `npm audit fix` `f8c9a59`, rate limiting `6e3b424`, repo/trigger cleanup incl. L3 `2fb40a6`, owner self-signup close `2acd458`. Still open from Stage A: S4 (`/qc` middleware), S1 + authz matrix (A4), CSP enforce flip (A5). Stage table struck through accordingly (2026-07-19). |
| 2026-07-19 | Manufacturing assessment | [MANUFACTURING_PERF_ASSESSMENT_2026-07-19.md](MANUFACTURING_PERF_ASSESSMENT_2026-07-19.md): found live correctness defect MF0 (unit-detail loaders truncate at 1,000 unfiltered windows — 369/393 units missing windows, 17 in-zone; ship fix immediately); added MF2 (factory-portal freshness — factory portals have zero realtime/polling); amended B1 (don't delete filter-refresh until MF2; cover pushback/undo path) and B2 (payload projection: measured 2.5 MB/view → target ≤ 300 KB; fold M4/M6). Fresh baselines: queue replica 2,957 ms / ~101 queries at 2,047 schedule rows (+41/day growth). |
| 2026-07-19 | **A4 — Residual authz closure (DONE)** | S1 closed: removed `"use server"` from `revalidation.ts` (5 helpers were anonymous cache-bust/DoS endpoints) — now internal-only, all callers server-side. Second unguarded export found and gated: `computeAndUpdateManufacturingRisk` (anonymous risk-flag write + notification N+1) now no-ops for non-manufacturing callers; C2 removes it from the surface. S2 recorded durably: [docs/security/ACTION_AUTHZ_MATRIX.md](security/ACTION_AUTHZ_MATRIX.md) traces the authz backstop (guard / RLS-backstop / not-an-endpoint) of **every** `"use server"` export; maintenance rule = one matrix row per new action. Gate: typecheck ✓, build ✓; the pre-existing `room-windows-view.tsx` React-Compiler lint error and the 1 pre-existing failing `manufacturing-process.test.mts` are unrelated (present on clean `main`). |
