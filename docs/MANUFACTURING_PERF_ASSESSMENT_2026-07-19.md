# Manufacturing Performance Assessment — 2026-07-19

**Produced by executing [MANUFACTURING_PERF_ASSESSMENT_PROMPT_2026.md](MANUFACTURING_PERF_ASSESSMENT_PROMPT_2026.md)** against `main` @ 2acd458.
**Scope:** the three shop-floor portals — `/cutter`, `/qc`, `/assembler` (packaging is the back half of the assembler flow) — read paths, write paths, print paths, realtime, and shop-floor resilience.
**Relationship to prior art:** [WORLD_CLASS_ROADMAP_2026H2.md](refactor/WORLD_CLASS_ROADMAP_2026H2.md) §2 already carries the core manufacturing findings (3.1 queue read, 1.1–1.3 refresh storm, 3.3 risk N+1); those were re-verified, not re-derived. This doc adds what the whole-app passes skimmed — including **one live correctness defect** — and amends two roadmap phases. Sequencing authority remains [DEEP_ASSESSMENT_2026H2.md](DEEP_ASSESSMENT_2026H2.md); this assessment's phases were slotted into its stage table (see §3), not into a competing roadmap.

---

## 1. Verified current state (2026-07-19)

| Claim in prior docs | Verified reality |
|---|---|
| Perf roadmap Phases 0–9: zero shipped (asserted 2026-07-17) | ✅ Still true: `removeConsole` excludes only `error` ([next.config.ts:67-69](../next.config.ts#L67-L69)); no `scripts/perf-budget.mjs`; no `get_role_schedule` migration (latest = `20260717190000`, security); functions still `iad1` (curl this session: `x-vercel-id: yul1::iad1`); 1 of 2 cron slots used |
| Security Phases 5–8 open (asserted in DEEP_ASSESSMENT §1, 2026-07-17) | ❌ **Stale — all shipped since:** headers `67ea9fd` (CSP Report-Only soaking), `npm audit fix` `f8c9a59`, rate limiting `6e3b424` (dataset-queries only), repo/trigger cleanup `2fb40a6`, owner self-signup close `2acd458`. DEEP_ASSESSMENT stage table + status log updated accordingly this session. Still open from Stage A: **S1** (`revalidation.ts` exports remain unguarded — re-verified) and **S4** (`/qc` still missing from middleware `PORTAL_REQUIRED_ROLE`, [middleware.ts:36-42](../src/lib/supabase/middleware.ts#L36-L42)) |
| `window_manufacturing_schedule` = 1,800 rows (2026-07-13) | **2,047 rows** today — +247 in 6 days (~+41/day, faster than the roadmap's ~+115/week estimate). Archive (roadmap Phase 4) is getting more urgent, not less |

### Fresh baselines (this session; service-role replicas against prod, same methodology as the roadmap — dev-machine → us-west-2, so cross-region numbers are comparable to the 2026-07-13 measurements, not to what iad1 functions pay)

| Path | Measured | Detail |
|---|---|---|
| Queue read replica (`loadPersistedRoleSchedule("cutter")`) | **2,957 ms, ~101 queries** | scan 1,251 ms (2,047 rows, 3 pages) + fan-out 1,414 ms (units 343 / windows 2,047 / production 1,978 / escalations ×2 over a 10-row table) + rooms 292 ms (904 ids). Prior replica: 5,170 ms at 1,800 rows — day-to-day network variance; shape (O(all-time), ~100 queries) unchanged |
| Client-bound queue payload | **~2.5 MB per view** | `allItems` = 2,047 mapped items = **2,412 KB** JSON serialized into the RSC stream on every dashboard/queue/production view; the cutter's actionable `items` = **69 pending (74 KB)**. ~97% of the payload is all-time history. For scale: the owner dataset already flagged as oversized is 509 KB |
| Unit-detail read (`loadCutterUnitDetail` / `loadAssemblerUnitDetail`) | **313 KB / 1,000 rows fetched for an 8-window unit** | the windows query has **no filter** and returns the PostgREST-capped first 1,000 of 2,466 facility windows; correct filtered query ≈ 266 ms and 8 rows (see M1) |
| Process screen (`loadAllManufacturingProcessRows`) | **1,062 ms, ~22 queries** | 423 units + 1,080 rooms + 2,397 production rows + 2,179 installed-window rows fetched to compute per-unit counts a SQL aggregate could return directly |
| Full production-status scan (`loadAssemblerDataset`) | 175 ms, silently capped at 1,000 of 2,397 rows | dead code — no callers (M8) |
| Table counts | — | schedule 2,047 · production_status 2,397 · windows 2,466 · rooms 1,088 · units 465 · escalations 10 |

Not re-measured: per-route bundle (Turbopack build prints no size table; roadmap's 2026-07-13 numbers — `/cutter/queue` 223.4 kB gz first-load, base 168.2 kB — stand until A2's `perf-budget.mjs` lands; no client-heavy dependency changes shipped since, and jspdf/html2canvas are confirmed lazy, print-route-only).

---

## 2. Findings

Score = felt impact × confidence (/10). Roadmap findings are cited, not duplicated.

### M1 — Unit-detail loaders fetch every window in the facility, truncated at 1,000 rows: **live correctness defect** — score **9.5**

[cutter-data.ts:135-140](../src/lib/cutter-data.ts#L135-L140) and [assembler-data.ts:165-170](../src/lib/assembler-data.ts#L165-L170) (the latter serves **both** `/assembler/units/[id]` and `/qc/units/[id]`) query `windows` with **no filter** — `.select(...).order("label")` — then filter to the unit's rooms in JS ([cutter-data.ts:176-177](../src/lib/cutter-data.ts#L176-L177)). PostgREST caps unfiltered selects at 1,000 rows; the facility has 2,466 windows. Measured against prod this session: **369 of 393 units are missing at least one window on their detail pages; 142 units show zero windows; 17 of the 55 units currently in the manufacturing zone are affected.** RLS does not save this: `can_access_unit`/`can_access_room` return `true` for cutter/assembler/qc ([phase2 migration:57-61](../supabase/migrations/20260713170000_phase2_scope_authenticated_access.sql#L57-L61)), so factory users see the same capped 1,000-by-label set. A QC operator opening an affected unit sees a partial window list and can believe a unit is fully inspected when it is not. This has been broken since the windows table crossed 1,000 rows, and silently worsens with growth. Perf side effect: every unit-detail view (and every post-approve `router.refresh()` — QC approves fire one per tap, [qc-unit-detail.tsx:59](../src/app/qc/units/[id]/qc-unit-detail.tsx#L59)) re-ships 313 KB of mostly foreign windows. **Fix is trivial:** fetch rooms first (or join), then `.in("room_id", roomIds)` — measured equivalent: 8 rows, ~266 ms.

### M2 — Factory portals have no realtime, no polling, no focus refresh: an idle tablet never updates — score **7.5**

`grep` across `src/app/{cutter,qc,assembler}` and `src/components/manufacturing`: zero realtime subscriptions, zero `setInterval`/`visibilitychange` handlers. Freshness arrives only via (a) navigation after a mutation's `revalidatePath`, or (b) the 400 ms filter-change `router.refresh()` effects ([cutter-queue.tsx:131](../src/components/manufacturing/cutter-queue.tsx#L131), [manufacturing-role-queue.tsx:170](../src/components/manufacturing/manufacturing-role-queue.tsx#L170), [cutter-production.tsx:184](../src/components/manufacturing/cutter-production.tsx#L184)). Consequences: (1) cutter→assembler→QC stage handoffs propagate only when the downstream operator happens to navigate — unbounded staleness on a bench tablet left on the queue screen; (2) **roadmap Phase 2 task 3 ("delete the filter-refresh effects") is unsafe as written** — those effects are accidentally the only in-place freshness mechanism the factory screens have. Amendment recorded in §3: land replacement freshness (scoped realtime or visibility-aware poll) in the same phase, or keep the effects until it ships.

### M3 — Every factory view serializes ~2.5 MB of all-time history to the tablet — score **8.5**

The `ManufacturingRoleSchedule` prop carries `allItems` (2,047 × ~45 fields = 2,412 KB) into the RSC stream of every dashboard, queue, and production view, plus the role's `items` again. The client does consume `allItems` — but only for unit grouping, filter option lists, and counts ([cutter-queue.tsx:163-299](../src/components/manufacturing/cutter-queue.tsx#L163-L299), [manufacturing-role-pipeline-dashboard.tsx:223-228](../src/components/manufacturing/manufacturing-role-pipeline-dashboard.tsx#L223-L228)) — a projection of ~8 fields per item (or server-computed aggregates) would serve identically. This compounds roadmap 3.1 (server cost) with a client cost the roadmap didn't measure: parse + hydrate of 2.5 MB on mid-tier tablets on every view and every post-burst coalesced refresh, growing with all-time history until the archive (roadmap Phase 4) lands. Fold the projection into roadmap Phase 3's RPC design (amendment in §3) rather than as a separate phase.

### M4 — Completed views pay the full queue read plus a redundant second escalation scan — score **6**

`loadManufacturingCompletedRoleData` ([manufacturing-scheduler.ts:811-826](../src/lib/manufacturing-scheduler.ts#L811-L826)) runs the entire `loadPersistedRoleSchedule` (which already fan-out-loads escalation history onto every item, [manufacturing-scheduler.ts:662](../src/lib/manufacturing-scheduler.ts#L662)) and then **re-fetches the identical escalation history** over all 2,047 window ids a second time ([:817](../src/lib/manufacturing-scheduler.ts#L817)) — ~21 redundant chunk queries per completed view to re-attach data the items already carry. Deletion-level fix; fold into roadmap Phase 3.

### M5 — Pushback/undo actions run the facility reflow synchronously and invalidate six layouts; the QC rejection is the slowest interaction in the pipeline — score **7.5**

`returnWindowToCutter` / `returnWindowToAssembler` / `undoWindow*` / `markWindowManufacturingIssue` all `await reflowManufacturingSchedules(...)` **inside the action body** ([manufacturing-actions.ts:511](../src/app/actions/manufacturing-actions.ts#L511), [:583](../src/app/actions/manufacturing-actions.ts#L583), [:613](../src/app/actions/manufacturing-actions.ts#L613), [:643](../src/app/actions/manufacturing-actions.ts#L643), [:673](../src/app/actions/manufacturing-actions.ts#L673)) after 3–6 sequential round-trips of guards/escalation/notifications, then call `revalidateManufacturingPaths()` — **six** `revalidatePath` calls, four layout-scoped ([manufacturing-actions.ts:29-36](../src/app/actions/manufacturing-actions.ts#L29-L36)). The completed-screen handlers then fire `router.refresh()` ([manufacturing-role-completed-screen.tsx:332-355](../src/components/manufacturing/manufacturing-role-completed-screen.tsx#L332-L355)) → the M4 read. Net: a QC operator rejecting a blind waits on ~10+ cross-region round-trips + a facility reflow + a multi-second refetch, with no optimistic path (`refreshOnSuccess: true` at [manufacturing-role-queue.tsx:245](../src/components/manufacturing/manufacturing-role-queue.tsx#L245)). Contrast: `markWindowCut`'s reflow correctly runs in `after()` ([production-actions.ts:43-57](../src/app/actions/production-actions.ts#L43-L57)). Extends roadmap 1.1 — the mark path was covered; the reject/undo path was not.

### M6 — Process screens load the whole facility to compute per-unit counts — score **5.5**

`loadAllManufacturingProcessRows` (cutter/assembler/qc variants, [manufacturing-process-server.ts:147-205](../src/lib/manufacturing-process-server.ts#L147-L205)) fetches 423 units, 1,080 rooms, 2,397 production rows, and 2,179 installed-window rows (~22 queries, 1,062 ms measured) to derive counts per unit. One `GROUP BY unit_id` SQL aggregate (or two) returns the same rows in one round-trip. Low risk: `buildManufacturingProcessRows` is pure TS with tests.

### M7 — Risk-flag N+1 still fires on every dashboard view (roadmap 3.3, re-verified) — score **8 (inherited)**

[production-actions.ts:322-416](../src/app/actions/production-actions.ts#L322-L416) unchanged: serial per-unit select+select+update (+notify) loop in `after()` on all three dashboards ([cutter/page.tsx:19-22](../src/app/cutter/page.tsx#L19-L22) + assembler/qc identical), each followed by a layout `revalidatePath` that forces the next view to re-render. At today's 55 in-zone units ≈ 170–230 queries per dashboard open. Roadmap Phase 5 is the fix; nothing new to add except updated scale numbers.

### M8 — Dead loaders, both silently truncated — score **2**

`loadCutterDataset` and `loadAssemblerDataset` have no callers (grep this session) and both read unfiltered tables capped at 1,000 rows. Delete them with M1's commit so nobody wires a truncated loader back in.

### Recorded as healthy (do not "fix")

- **Print paths.** `loadWindowsForPrint` is scoped to the selected window ids ([manufacturing-print-data.ts:66-97](../src/lib/manufacturing-print-data.ts#L66-L97)); jspdf + html2canvas-pro are dynamically imported on the print route only ([label-pdf-client.tsx:26-29](../src/app/cutter/queue/print/label-pdf-client.tsx#L26-L29)); `markLabelsPrinted` is batched (3 queries for N windows) with page-scoped revalidation. Per-sheet scale-3 canvas rasterization is main-thread-heavy but runs in a dedicated tab with a spinner — acceptable; revisit only if operators report multi-minute label jobs.
- **Double-tap safety.** `markWindowCut`/`markLabelsPrinted` upsert on `window_id` conflict — repeat taps are idempotent on the write.
- **Chunk concurrency cap** (`selectInChunks`, 100 × 4) — the 2026-06-23 outage guard; keep it in every fallback path.

---

## 3. Plan — slotted into DEEP_ASSESSMENT_2026H2 §3 (no competing roadmap)

The stage table in [DEEP_ASSESSMENT_2026H2.md](DEEP_ASSESSMENT_2026H2.md) was updated this session with the rows and amendments below. Sequencing rationale: MF0 is a production correctness bug — it ships first, alone. The rest lands where the deep assessment already ordered the work; the two roadmap-phase amendments change *content*, not order.

| Phase (new/amended) | What | Slot | Model · thinking | Verification / rollback |
|---|---|---|---|---|
| **MF0 (new — ship immediately)** | Fix M1: in both unit-detail loaders, resolve the unit's room ids first, then fetch windows with `.in("room_id", roomIds)` (drop the JS filter); handle >100 rooms via `selectInChunks` for consistency. Delete dead `loadCutterDataset`/`loadAssemblerDataset` (M8). No shape changes — same return types. | Before/alongside anything else in Stage A; independent single commit | **Sonnet 5 · medium** (mechanical, fully specified) — but treat as a bugfix, not perf: verify against the affected-units list | Re-run the truncation probe (this session's script): 0 units missing windows; detail page for a known-affected in-zone unit shows all windows. Rollback: revert commit |
| **A1 remainder** | `/qc` middleware entry (S4) — still open; M3/L2 parts of A1 shipped via security P6/P8 | unchanged | Haiku 4.5 · low | as in deep assessment |
| **A2** | Observability floor (roadmap Phase 0 prompt verbatim) — the `[perf]` line on `loadPersistedRoleSchedule` is already in its spec; add one to `loadAllManufacturingProcessRows` while there | unchanged | Sonnet 5 · medium | as written |
| **A3** | Function region → `pdx1` (roadmap Phase 1). Verified still `iad1` this session — remains the cheapest multiplier for every finding above (every sequential round-trip in M5's chain sheds ~60 ms) | unchanged | any · low | as written |
| **B1 (amended)** | Instant queue actions (roadmap Phase 2 prompt) **with two amendments:** (1) task 3 (delete filter-refresh effects) is **deferred to MF2** — those effects are currently the only in-place freshness the factory screens have (M2); (2) extend the optimistic + coalesced + `after()`-reflow treatment to the pushback/undo family and the completed-screen + unit-detail handlers (M5): move the five inline `reflowManufacturingSchedules` awaits into `after()`, shrink `revalidateManufacturingPaths()` to the paths the mutation actually changes, make pushback dialogs close optimistically with rollback+toast | Stage B, first (as before) | **Opus 4.8 · high** | roadmap Phase 2 gates + reject-a-blind tap-to-feedback < 100 ms; reflow parity: schedule rows identical before/after moving reflow into `after()` (it already runs post-response on the mark path — same semantics) |
| **MF2 (new)** | Factory-portal freshness: give idle tablets an update path. Preferred: one scoped realtime subscription per factory session on `window_production_status` (+ `window_manufacturing_schedule` UPDATEs) feeding the existing coalesced refresh — events at this scale are low-volume (2,397 rows, ~10 mutations/hr measured table growth); fallback if event volume surprises: 60 s visibility-gated poll. THEN delete the 400 ms filter-refresh effects (B1's deferred task 3). Decision + volume numbers recorded here | Stage B, immediately after B1 (needs B1's coalesced-refresh hook) | **Opus 4.8 · high** (realtime correctness: a missed status update on a factory tablet is a correctness bug) | two-browser test: mark in cutter appears on idle QC queue ≤ coalesce window; unplug-network test: reconnect triggers refresh; no refetch storm under a 10-mark burst (one coalesced refresh) |
| **B2 (amended)** | `get_role_schedule` RPC (roadmap Phase 3 prompt) **plus payload projection (M3) and the M4 dedupe:** the RPC returns (a) the role's actionable items full-fidelity, (b) `allItems` as the ~8-field projection the client actually uses for grouping/filters/counts — or server-computed aggregates if the field audit allows, (c) escalations folded in one pass (already in its spec). Rewrite `loadManufacturingCompletedRoleData` to stop re-fetching escalation history (M4). Fold the process-screen count aggregation (M6) into the same migration as a second small RPC, executed Sonnet-mechanically after the Fable design | Stage B, after MF2 | **Fable 5 · high** (SQL/TS contract), execution of M6 part **Sonnet 5 · medium** | roadmap Phase 3 parity gates + client payload for `/cutter/queue` ≤ ~300 KB (measure the RSC stream before/after); completed-view item sets byte-identical; process-screen rows byte-identical |
| **C1** | Archive completed schedule rows (roadmap Phase 4). Urgency note: growth re-measured at ~+41 rows/day (2,047 total) — schedule before the table doubles (~fall) | unchanged | Fable 5 · high | as written |
| **C2** | Risk flags set-based + cron (roadmap Phase 5; M7 scale numbers updated: ~170–230 queries per dashboard view today) | unchanged | Opus 4.8 · high | as written |

Everything else in the deep assessment's stages (A4/A5 remainders, C3, C4, D1–D3) is untouched by this assessment.

---

## 4. Constraints & rejected ideas

**Constraints** — inherited verbatim from DEEP_ASSESSMENT §4 / roadmap §6 (live prod, one revertible commit per phase, no `reflowManufacturingSchedules` math changes — B1's amendment moves *when* reflow runs on the pushback path, never what it computes, and carries a schedule-parity check; realtime correctness > perf; `app_metadata`-only trust; RLS + installer offline-upload preserved; Hobby limits: the risk cron takes the last free slot). New: **MF2's freshness mechanism must not bypass RLS** (subscriptions run as the authenticated user; factory roles legitimately see facility-wide events) and must not re-introduce per-event full refetches (coalesce, always).

**Rejected in this assessment** (roadmap §5 and DEEP_ASSESSMENT §4 tables stand):

| Idea | Verdict | Why |
|---|---|---|
| Web-worker or server-side PDF generation for labels | Rejected | Print is healthy (§2): scoped data, lazy libs, dedicated tab. Complexity for a path nobody has complained about |
| Paginating the factory queue/production screens | Rejected | Operators scan the full day's work; B2's projection + C1's archive bound the payload without changing interaction; pagination on a bench tablet adds taps to the highest-frequency workflow |
| A dedicated packaging portal/role split | Out of scope | Packaging is deliberately the back half of the assembler flow (one operator, one station today); revisit only on an org change |
| Client-store-first rewrite for factory portals (roadmap C3 redux) | Rejected (re-affirmed) | B1+MF2+B2 deliver the felt-latency targets at a fraction of the risk; the roadmap's C3 verdict stands |
| Skipping MF0 in favor of "it'll be fixed by B2's RPC anyway" | Rejected | MF0 is a shipped-today correctness bug with a one-session fix; B2 is multi-session and only covers the queue read, not unit detail |

---

## 5. Status log

| Date | Phase | Result |
|---|---|---|
| 2026-07-19 | Assessment | This doc. Fresh baselines (§1); M1 truncation defect found and quantified (369/393 units affected, 17 in-zone); DEEP_ASSESSMENT stage table updated (security P5–P8 marked shipped, MF0/MF2 added, B1/B2 amended); measurement scripts were session-scratch (methodology recorded in §1) |
