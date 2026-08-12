# Manufacturing routing: conscious assignment, escalation, and a start-of-build lock

> ⚠️ **This is not `docs/IMPLEMENTATION_PLAN_2026H2.md`.** That document is the 16-phase performance/security roadmap whose Phases 1–3 (MF0 truncation bugfix, `/qc` middleware, A2 observability) already shipped in commit `571eef4`. This plan is separate, unshipped work on manufacturer routing. Its phases are prefixed **MR** so the two never get confused — MR3 here is unrelated to that roadmap's third phase.

## Status — execute from this file

## ✅ ALL PHASES SHIPPED TO PRODUCTION — 2026-08-10

| Phase | Status | Shipped as | Notes |
|---|---|---|---|
| *(audit)* | ✅ **Done** | — | No code needed — both-queues-at-once is provably impossible; see Context. |
| **MR1** — close the in-house leaks | ✅ **Shipped** | `5222336` | Factory process screens and unit-detail pages no longer show subcontracted work. |
| **MR2** — dashboard escalation | ✅ **Shipped** | `5222336` | Migration `20260810120000` **applied**. Bucket went 70 → **0** when MR3's backfill ran in the same push, exactly as predicted. |
| **MR3** — block unrouted + backfill | ✅ **Shipped** | `5222336` | Migration `20260810130000` **applied**. Both in-migration guards passed. Backfill stamped **447** units (963 → 516 unrouted). **Cutter queue unchanged at 70 units / 381 rows** — the critical check. External units untouched at 14. |
| **MR4a** — lock: enforcement | ✅ **Shipped** | `9a9ad2d` | Migration `20260810140000` **applied**. §4a.6 rehearsal ran against prod inside a rolled-back transaction — **all 6 probes PASS**, rollback verified clean (external count 14, probe-5 unit back to `mp-internal`, view and columns absent). `parity-manufacturing-lock.mjs` green: **460 locked** (447 internal, 13 external). |
| **MR4b** — lock: interface | ✅ **Shipped** | see below | No migration. Picker read-only with reason, owner transfer dialog with rebuild-cost line, bulk sheet splits locked from movable. 141/141 tests, perf-budget OK. |

**Post-ship state, measured:** 977 units · 963 internal / 14 external · 516 still unrouted (all empty shells with no windows — correct) · 460 locked · cutter queue 70 units.

### 2026-08-12 — the room-creation gate was REMOVED (client decision)

`src/components/units/manufacturer-gate.tsx` is deleted. Rooms, windows and measurements are
now captured with no manufacturer chosen, for every role — the client needs measuring to start
before the routing decision exists. Assignment moved entirely to the unit-detail picker and the
bulk-assign sheet, and can happen at any point.

**Nothing about the no-double-build invariant changed.** The gate was only ever a prompt; the
four enforcement layers, both guard triggers, and the reflow's
`manufacturing_assigned_at IS NOT NULL` filter are all untouched. An unrouted unit remains
invisible to the in-house queues *and* to every partner worklist — which is precisely the
behaviour the client asked for. MR3's block is doing the work the gate used to be credited with.

Two consequences to keep in mind:

1. **Unrouted is now a normal, long-lived state, not an empty-shell artefact.** The "No
   manufacturer assigned" dashboard bucket (MR2) is the sole escalation and will carry real
   volume. It fires on `windowCount > 0 && !manufacturingAssignedAt`.
2. **Routing an already-measured unit to a subcontractor locks it immediately** — the external
   lock branch is `all_measured_at IS NOT NULL`, i.e. the vendor can already see it. Under the
   old flow routing preceded measuring, so a scheduler could still correct a mis-pick; now that
   correction needs the owner's "Transfer anyway" confirmation. The lock is behaving as designed
   (§4a), but the window for a cheap fix is much shorter. Tell the schedulers.

§MR4b's note below ("`manufacturer-gate.tsx` — no change") is retained as history; the file no
longer exists.

### The rehearsal does NOT need psql

Earlier revisions of this doc said `scripts/deploy/rehearse-manufacturing-lock-trigger.sql` requires psql and a direct Postgres URI. It does not, and hunting for a connection string is wasted effort. Use the Management API path, which uses credentials the Supabase CLI already holds:

```bash
supabase db query --linked -f scripts/deploy/rehearse-manufacturing-lock-trigger-api.sql
```

`BEGIN`/`ROLLBACK` is honored over that path (verified: a table created inside a transaction was visible inside it and gone after). The `-api.sql` variant exists because `RAISE NOTICE` output does **not** come back over the Management API — its probes record into a results table that is `SELECT`ed immediately before the `ROLLBACK`, so a failing probe is visible instead of silently reading as a pass. The psql version is kept for anyone who does have a direct connection.

### Still outstanding (manual, on the live site)

Nothing in code. Two things need a human:

1. **Tell the schedulers.** The 447 backfilled units are now **owner-only for re-routing**, and 460 units are locked outright. A scheduler who picks the wrong manufacturer can no longer fix it themselves.
2. **Smoke test the installer path** — create a unit, add a room *as an installer* (which skips the room-creation gate), add and measure a window. It must appear in the "No manufacturer assigned" bucket and **not** in the cutter queue. That is the exact path the old gate exempted, and the one this work exists to close.

## Context

Building the same blind twice costs ~$100. This work started as an audit — *can a window ever sit in both the in-house and the subcontractor queue at once?* — and turned into three fixes for the ways a blind can still get built twice even though it never sits in both queues.

**Audit result: the "both queues at once" case is airtight.** Ownership is one `NOT NULL` column (`units.manufacturing_partner_id`), and both read paths derive from *that column*, not from the schedule table:

| Layer | Location | Predicate |
|---|---|---|
| Internal read (SQL) | `20260806120000_manufacturing_partners.sql:628-631`, archive arm `:638-642` | `JOIN manufacturing_partners mp … WHERE mp.is_internal` |
| Internal read (TS) | `src/lib/manufacturing-scheduler.ts:708` | `if (!isInternalPartnerId(unit.manufacturing_partner_id)) continue;` |
| External read | `20260806120000:524-529` | `WHERE u.manufacturing_partner_id = v_partner AND u.all_measured_at IS NOT NULL` |
| Write guard | `20260806120000:771-825` | `wps_guard_manufacturing_ownership` rejects each cross-boundary write |

All 9 readers of `window_manufacturing_schedule` and all 6 callers of the queue loaders were traced. There is no unfiltered path, and stale schedule rows are ignored by the internal read even if the purge fails. **No change needed there.**

**Three real double-build paths remain:**

1. **Mid-flight transfer re-shows partially built work.** Transfer is allowed at any stage. The partner's list shows every non-`qc_approved` window as open work (`src/app/subcontractor/page.tsx:9`), so blinds the in-house factory already *cut* get rebuilt. Reverse is worse: a vendor who built but hasn't marked leaves windows at `pending`, and reflow hands them to the cutter.
2. **Unrouted units are silently built in-house.** Reflow filters `manufacturing_partner_id = INTERNAL_PARTNER_ID` (`manufacturing-scheduler.ts:336`) and the column defaults to internal, so a unit nobody decided on enters the cutter queue anyway. The room-creation gate is the only prompt, and **installers are exempt entirely** (`manufacturer-gate.tsx:46`).
3. **Subcontracted units appear in the in-house Process tables with live Mark Cut buttons.** `/cutter/process` calls `loadAllManufacturingProcessRows()` with owner scope and no partner filter (`manufacturing-process-server.ts:226-245`); rows link to `/cutter/units/[id]`, whose loader also has no filter (`cutter-data.ts:80`), and the page renders a live Mark Cut button (`cutter-unit-detail.tsx:128`). The write is blocked — but only *after* the cutter clicks, which in a shop is after they've cut.

**Decisions made:** unrouted units get blocked from the in-house queue *and* escalated on the dashboard; the manufacturer locks once manufacturing starts, with an owner-only "Transfer anyway" confirmation; the external side locks as soon as the vendor can see the unit (`all_measured_at`), not only when they mark it complete.

---

## Production safety (measured against live prod, 2026-08-10)

This is a live system with real subcontracted work, so every phase was checked against production data before being written. Read-only inventory via the `.env.local` service-role key, same method as `scripts/deploy/verify-manufacturing-partners.mjs`.

**Live state:**

| Measure | Count |
|---|---|
| Units total | 977 |
| Internal (`mp-internal`) | 963 |
| External (`mp-092d835a` — Progressive Distribution) | 14 |
| Units with `manufacturing_assigned_at IS NULL` | **963** (every internal unit) |
| External units with `manufacturing_assigned_at IS NULL` | **0** |

**The subcontracted units are clean.** All 14 have zero `window_manufacturing_schedule` rows — the exclusivity invariant is holding in production, no leak into the internal queue. Only one (unit 605) has any production row at all, a single `pending` window. **No external unit has a single `cut`, `assembled`, or `qc_approved` window**, so there is no in-flight external work for any of this to disturb.

**No phase performs a destructive write.** Verified across the whole repo:

- `window_production_status` is **never deleted** by anything, anywhere — build progress cannot be lost.
- The only `windows` deletes are explicit user actions in [fsr-data/windows.ts:61](src/app/actions/fsr-data/windows.ts#L61) and [:266](src/app/actions/fsr-data/windows.ts#L266), untouched by this work.
- `reflowManufacturingSchedules` has exactly two writes: the upsert at [manufacturing-scheduler.ts:652](src/lib/manufacturing-scheduler.ts#L652) and the external purge at [:314](src/lib/manufacturing-scheduler.ts#L314). Its own comment confirms it "upserts rows only for the units it selected, so it cannot remove a row on its own" — **narrowing its source query in Phase MR3 is therefore non-destructive**; excluded units simply stop being rewritten.
- This plan adds **no** `DELETE` and no `DROP`. Its only data write is the Phase MR3 backfill, guarded by `WHERE manufacturing_assigned_at IS NULL` so it can never overwrite a decision someone already made.

**Backfill coverage, computed against live data:**

| Measure | Count |
|---|---|
| Units the backfill would stamp | 447 |
| Left unrouted afterwards | 516 |
| …of those, currently in the cutter queue | **0** ← nothing vanishes from the factory |
| …of those, with `windowCount > 0` | **0** ← day-1 dashboard bucket is empty |

Both zeros matter. The first means Phase MR3 cannot empty a queue. The second means the Phase MR2 escalation ships silent and only fires on genuinely new unrouted units — it will not dump 500 rows on the owner and train them to ignore it. The 516 left unrouted are empty shells (`status = 'not_started'`, no windows); they hit the ManufacturerGate the moment someone adds rooms.

**The backfill touches zero external units** (all 14 already have a timestamp), so the `manufacturing_partner_id <> 'mp-internal'` clause is a no-op today and exists only as a guard against SQL-inserted rows.

**Two live-impact facts to accept before shipping:**

1. **447 units become owner-only for re-routing** once stamped — schedulers can set a manufacturer that was never set, but not change one. That is the intended meaning of "someone decided", and it is a real permission change on in-flight work.
2. **Phase MR4 locks 460 units on day one** (447 internal, 13 external). Unit 9998 stays transferable because it isn't fully measured. Since no external unit has started work, the owner override covers any correction — but the lock is live from the moment the migration applies.

---

## Phasing

Order is load-bearing.

| Phase | What | Migration | Model · thinking | Why here |
|---|---|---|---|---|
| **MR1** | Close the in-house leaks | none | **Sonnet 5 · medium** | Code-only, removes visibility only. Introduces the shared eligibility helper later phases reuse. |
| **MR2** | Dashboard escalation | yes | **Sonnet 5 · medium** | **Must precede MR3.** MR3 makes unrouted units vanish from the queue; without this they vanish *silently*. Ship, work the list to zero, then block. |
| **MR3** | Block unrouted + backfill | yes | **Fable 5 · high** | The dangerous one — the only prod-data write. Ships against a near-empty backlog. |
| **MR4a** | Lock: enforcement (DB + action) | yes | **Fable 5 · high** | Depends on MR3: the lock design assumes "locked ⟹ routed", which only holds after the backfill. |
| **MR4b** | Lock: interface (UI) | none | **Sonnet 5 · medium** | Depends on MR4a for the derived `manufacturingLocked` field and the override-capable action. |

Thinking legend matches `docs/IMPLEMENTATION_PLAN_2026H2.md`: **high** = design first, adversarial self-review before writing; **medium** = mechanical work with a clear spec. That doc's model line is stale — Claude Opus 5 (`claude-opus-5`) has replaced Opus 4.8 at the same price; substitute **Opus 5 · xhigh** for Fable 5 if you'd rather not pay Fable rates, but keep Fable 5 for Phase MR3's migration.

---

## Phase MR1 — Close the in-house visibility leaks

### 1.1 Shared eligibility predicate
**`src/lib/manufacturing-partners.ts`** — new export beside `isInternalPartnerId` (`:14-16`):

```ts
export function isInternalFactoryWork(unit: {
  manufacturing_partner_id?: string | null;
  manufacturing_assigned_at?: string | null | undefined;
}): boolean {
  if (!isInternalPartnerId(unit.manufacturing_partner_id)) return false;
  return unit.manufacturing_assigned_at !== null;   // undefined passes on purpose
}
```

**The asymmetry is the whole point and must be commented:** an absent *partner* reads as internal (the existing load-bearing default); an absent *routing timestamp* (`undefined` = column not projected) must read as **routed**. Only an explicit `NULL` means "nobody decided". Inverting that empties every factory queue the moment a read path forgets the column.

In Phase MR1 the timestamp half is inert — nothing selects the column yet. Phase MR3 activates it by adding it to the projections. That makes Phase MR3 a *projection* change plus a migration, not a logic change.

**Test** (`src/lib/manufacturing-partners.test.mts`): pin `undefined ⇒ true`, `null ⇒ false`, timestamp `⇒ true`, external+timestamp `⇒ false`. Name the queue-emptying failure in the test comment.

### 1.2 Process screens
**`src/lib/manufacturing-process-server.ts`** — add `opts: { internalOnly?: boolean } = {}` to `loadUnitsForManufacturingProcess` (`:141`) and `loadAllManufacturingProcessRows` (`:182`); in the owner branch (`:144-151`) append `.eq("manufacturing_partner_id", INTERNAL_PARTNER_ID)` when set.

- `loadCutterManufacturingProcessRows` (`:226`), `loadAssembler…` (`:233`), `loadQc…` (`:240`) → `{ internalOnly: true }`
- `loadOwnerManufacturingProcessRows` (`:193`), `loadScheduler…` (`:200`), `loadInstaller…` (`:214`) → unchanged. `/management/process` keeps the whole picture.

### 1.3 Factory unit-detail pages → read-only, not `notFound()`
A cutter arriving from a bookmark or printed label who gets "Not Found" phones the office. "Manufactured by Acme Blinds — nothing to do here" explains itself, and matches the existing stance that a stale tab gets a readable message.

- **`src/lib/cutter-data.ts`** — add `manufacturing_partner_id` to the units select (`:86-88`); add `manufacturedBy: { partnerId, partnerName, isInternal }` to `CutterUnit`. Resolve the name via the existing `loadManufacturingPartners()` in `src/lib/server-data/lookups.ts`.
- **`src/lib/assembler-data.ts`** — identical change at `:80-83`. Note this loader serves **both** `/assembler/units/[id]` and `/qc/units/[id]` (`src/app/qc/units/[id]/page.tsx:1` imports `loadAssemblerUnitDetail`) — two loaders, three components.
- **`cutter-unit-detail.tsx`** (button `:128`), **`assembler-unit-detail.tsx`** (`:141`, `:167`, `:247`), **`qc-unit-detail.tsx`** (`:152`, `:160`, `:168`, `:250`) — when `!isInternal`, render an amber `Factory` banner and gate every mark button behind `isInternal`.
- **`src/app/qc/units/[id]/page.tsx`** — while here, change `return null` to `notFound()` so a bad id renders the 404 shell instead of a blank page.

The `wps_guard_manufacturing_ownership` trigger stays the actual guarantee; this is the readable-message layer.

---

## Phase MR2 — Dashboard escalation for unrouted units

### 2.1 The predicate
**`src/lib/unit-flags.ts`** — inside `computeUnitFlags`, after the `isUnitDone` early return (`:25`):

```ts
if (!unit.manufacturingAssignedAt && unit.windowCount > 0) flags.push("missing_manufacturer");
```

- `isUnitDone` already returns `[]` for `status === 'installed'` — installed units excluded for free.
- **Require `windowCount > 0`.** A unit with no windows has nothing to build; without this clause a freshly imported building dumps hundreds of rows into the bucket on day one and trains the owner to ignore it.

Also add `"missing_manufacturer"` to `UnitFlag`, `FLAG_LABELS` (`"No Manufacturer"`) and `FLAG_CLASSES` (`"bg-violet-100 text-violet-700"` — violet is unused by the existing five). Adding a union member is safe: the only exhaustive maps are those two, and typecheck catches both.

### 2.2 The issue bucket
**`src/lib/dashboard-issues.ts`** — add `"unassigned_manufacturer"` to `DashboardIssue`; place it **second in `ISSUE_ORDER`**, after `past_scheduled`; add label `"No manufacturer assigned"` and matching violet classes; in `getUnitIssues` push it when the flag is present.

Keep it **out of** the existing `"missing"` bucket (`:48-54`) — folding it in changes the meaning of a bucket that already has a stable SQL mirror and makes the drill-down ambiguous.

**No edits needed** to `management-dashboard.tsx:433-487`, `scheduler-dashboard.tsx:351-405`, or `scoped-results-panel.tsx` — all three iterate `ISSUE_ORDER` / render every flag from `computeUnitFlags`, so the bucket and chip appear everywhere automatically. That is the argument for adding the `UnitFlag` and not just the `DashboardIssue`.

### 2.3 The two TS count mirrors — **this is where the trap is**
- **`src/lib/owner-dashboard-counts.ts`** — add `unassigned_manufacturer: 0` to `EMPTY_OWNER_DASHBOARD_COUNTS.issueCounts`.
- **`src/lib/server-data/owner.ts:44-49`** — `normalizeOwnerDashboardCounts` has a **hardcoded four-key** `issueCounts` object. Add `unassigned_manufacturer: readCount(raw.issue_counts, "unassigned_manufacturer")`.

**Miss that second file and the bug looks like flakiness:** `ownerIssueCountsToMap` (`management-dashboard.tsx:178-186`) drops any zero count, and `issueCounts` uses `initialCounts` only when `!hasScopeFilters && selectedStage === null` (`:183-185`) — so the bucket is invisible on the default owner dashboard and appears the moment any filter is touched.

`hasScopeFilters` needs **no** change: this adds an issue bucket, not a filter. The scheduler dashboard needs **no** SQL at all — it computes counts purely client-side (`scheduler-dashboard.tsx:134-138`), no `initialCounts`, no pre-agg.

### 2.4 SQL pre-aggregation
**New `supabase/migrations/20260810120000_dashboard_unassigned_manufacturer.sql`** — `CREATE OR REPLACE FUNCTION get_owner_dashboard_counts(date)` copied verbatim from `20260805130000_unit_current_stage.sql:324-425` with three edits:

- `unit_scope` CTE (`:339-360`): add `u.manufacturing_assigned_at,` and `u.window_count,`
- `flagged` CTE: `status <> 'installed' AND manufacturing_assigned_at IS NULL AND COALESCE(window_count, 0) > 0 AS has_unassigned_manufacturer,`
- `issue_counts` CTE: `'unassigned_manufacturer', COUNT(*) FILTER (WHERE has_unassigned_manufacturer),`

Re-`REVOKE`/`GRANT` as the original does.

### 2.5 Tests
- `src/lib/owner-dashboard-counts.test.mts` — three units (`windowCount: 4` + null timestamp → counted; `windowCount: 0` → not; `status: "installed"` → not). Existing cases stay green because `makeUnit` defaults `windowCount: 0`.
- New `src/lib/unit-flags.test.mts` (none exists) asserting the same three boundaries.

Deploy risk: near zero. One `CREATE OR REPLACE` of a counting function; the old client ignores the extra key.

---

## Phase MR3 — Block unrouted units from the in-house queue

### 3.1 Migration `20260810130000_manufacturing_conscious_assignment.sql`
One transaction, three sections, in order.

**(a1) Installed units → explicitly in-house.** All 377 installed units predate the subcontract feature (which shipped 2026-08-06) and were built in the FSR factory. They are already `mp-internal` by DB default, but state it explicitly so the record is a decision rather than a default:

```sql
UPDATE public.units u
SET manufacturing_partner_id  = 'mp-internal',
    manufacturing_assigned_at = COALESCE(u.installed_at, u.all_measured_at, u.created_at, now())
WHERE u.manufacturing_assigned_at IS NULL          -- one-time correction only
  AND (u.status = 'installed' OR u.installed_at IS NOT NULL);
```

> ⚠️ **The `manufacturing_assigned_at IS NULL` guard is what makes this safe, and it must not be dropped.** This is a *historical* correction, not a standing rule. A unit the subcontractor builds and that is later installed will already carry a timestamp, so this never touches it — writing "all installed units are internal" as a permanent rule would erase the record of who actually built them. Verified against prod: 377 installed units, **all 377 already `mp-internal`, 0 external** — so this statement changes no ownership today and exists to pin the intent.

**(a2) Backfill the rest** — stamp every other unit that already has manufacturing activity:

```sql
UPDATE public.units u
SET manufacturing_assigned_at =
      COALESCE(u.all_measured_at, u.production_entered_at, u.created_at, now())
WHERE u.manufacturing_assigned_at IS NULL
  AND (
       u.all_measured_at       IS NOT NULL
    OR u.production_entered_at IS NOT NULL
    OR u.installed_at          IS NOT NULL
    OR u.status <> 'not_started'
    OR u.manufacturing_partner_id <> 'mp-internal'
    OR EXISTS (SELECT 1 FROM public.window_manufacturing_schedule s         WHERE s.unit_id = u.id)
    OR EXISTS (SELECT 1 FROM public.window_manufacturing_schedule_archive a WHERE a.unit_id = u.id)
    OR EXISTS (SELECT 1 FROM public.window_production_status p              WHERE p.unit_id = u.id)
  );
```

Run (a2) after (a1); the installed units are already stamped by then, so its `installed_at` / `status` clauses only pick up the remainder. `status <> 'not_started'` and `installed_at` catch units whose windows were later deleted, which the three `EXISTS` clauses would miss. The partner clause is defensive against SQL-inserted external units.

Live status breakdown, for sizing: `not_started` 517 · `installed` 377 · `manufactured` 54 · `measured` 29.

**Deliberately not covered:** a unit with rooms and windows but `status = 'not_started'`, unmeasured, no schedule and no production rows. Those genuinely haven't started; staying unrouted is correct, and Phase MR2 already surfaces them.

`COALESCE(...)` rather than `now()` because for an externally-routed-but-unstamped unit, `manufacturing_assigned_at` feeds the partner worklist's oldest-first ordering (`subcontractor-data.ts:86-92`); `now()` would reshuffle a live partner's queue.

**Side effect for the runbook:** once stamped, the owner-only re-assignment rule (`management-actions.ts:928-940`) and the scheduler trigger branch (`20260806120000:212-219`) apply, so **schedulers lose the ability to route any backfilled unit**. That is the intended meaning of "someone decided", but it is a real permission change on in-flight work — tell the owner.

**(b) `get_role_schedule`** — `CREATE OR REPLACE` copied verbatim from `20260806120000:606+`, three edits:
- live arm (`:631`): `WHERE mp.is_internal AND u.manufacturing_assigned_at IS NOT NULL`
- archive arm (`:642`): `AND mp2.is_internal AND u2.manufacturing_assigned_at IS NOT NULL`
- `units` key (`:672-690`): add `'manufacturing_assigned_at', u.manufacturing_assigned_at,`

The archive predicate is safe because the backfill's archive `EXISTS` clause makes that set empty by construction; omit it if you want belt-and-braces, since queue correctness only needs the live arm.

**(c) Guard assertion** — last statement, so a bad backfill aborts the transaction instead of emptying the factory:

```sql
DO $$
DECLARE v_orphans int;
BEGIN
  SELECT count(DISTINCT s.unit_id) INTO v_orphans
  FROM public.window_manufacturing_schedule s
  JOIN public.units u ON u.id = s.unit_id
  WHERE u.manufacturing_assigned_at IS NULL;
  IF v_orphans > 0 THEN
    RAISE EXCEPTION 'Backfill incomplete: % scheduled units still unrouted — the new filter would drop them from the factory queue', v_orphans;
  END IF;
END $$;
```

### 3.2 Reflow source query
**`src/lib/manufacturing-scheduler.ts:332-338`** — append `.not("manufacturing_assigned_at", "is", null)`.

### 3.3 No purge for unrouted units — explicit decision
Unlike the external case, **do not delete schedule rows** for unrouted units:

1. **No invariant at stake.** An unrouted unit is internal-by-default, so no partner worklist can see it (`get_subcontractor_worklist` filters `= v_partner`). Zero double-build exposure; the only failure is a stall, which Phase MR2 escalates.
2. **Deletion is lossy, this state is reversible.** Schedule rows carry `is_schedule_locked`, `lock_reason`, `manual_priority`, `moved_at`, `moved_by_user_id`. "Nobody decided yet" gets answered five minutes later and the unit should return with its manual priority intact.
3. **No capacity leak.** Verified: the `cutLoad`/`assemblyLoad`/`qcLoad` maps (`manufacturing-scheduler.ts:422-425`) are seeded only from `existing?.isScheduleLocked` candidates of units the source query selected (`:487-497`). Rows belonging to excluded units are inert. This is the substantive difference from the subcontracted case, where the capacity argument does hold.

Leave `purgeExternalSchedules` (`:301-320`) untouched; extend its doc comment to record why unrouted units are deliberately excluded. Ship the assertion in 3.1(c) plus the verify-script check instead of a destructive cleaner.

### 3.4 The TS backstop and its two projections — **the riskiest edit in the plan**
The predicate at `:708` cannot simply be tightened: `UnitRow` (`:83-97`) has no `manufacturing_assigned_at`, and **neither source populates it** — `get_role_schedule`'s units key stops at `manufacturing_partner_id`, and the chunked fallback's select (`:895`) matches. Four edits, all required:

1. **`UnitRow` (`:83-97`)** — add `manufacturing_assigned_at?: string | null;` with the `undefined ⇒ routed` asymmetry comment from 1.1.
2. **Chunked fallback select (`:895`)** — append `, manufacturing_assigned_at`.
3. **RPC projection** — done in 3.1(b).
4. **`:708`** — `if (!isInternalFactoryWork(unit)) continue;`

Plus, after `const unitsById = …` (`:690`), a one-time dev warning so a projection regression is loud rather than silent:

```ts
if (units.length > 0 && units.every((u) => u.manufacturing_assigned_at === undefined)) {
  console.warn("[mfg] role schedule units carry no manufacturing_assigned_at — routing filter is inert (check the RPC projection)");
}
```

Miss any one of the four and the filter is either inert or — if written naively as `if (!unit.manufacturing_assigned_at) continue` — **empties every factory queue facility-wide.**

**Test:** new `src/lib/manufacturing-eligibility.test.mts` pinning the four `isInternalFactoryWork` cases, with the `undefined` case commented as guarding the queue-emptying failure.

### 3.5 Process screens inherit
**`manufacturing-process-server.ts`** — in the `internalOnly` branch from 1.2, append `.not("manufacturing_assigned_at", "is", null)`.

### 3.6 Deploy — the one phase with a prod-data write

**Migration first, then code.** The migration is backward compatible with live code (extra key ignored; tightened filter returns a subset).

**Step 1 — re-run the inventory and gate on it.** The numbers in *Production safety* above were taken on 2026-08-10; re-take them immediately before applying and **abort if either zero has moved**:

```sql
-- (a) MUST BE 0 — units the backfill misses that are in the cutter queue.
--     Non-zero means the predicate has a hole and the queue would lose units.
SELECT count(DISTINCT s.unit_id)
FROM window_manufacturing_schedule s JOIN units u ON u.id = s.unit_id
WHERE u.manufacturing_assigned_at IS NULL
  AND NOT (u.all_measured_at IS NOT NULL OR u.production_entered_at IS NOT NULL
        OR u.installed_at IS NOT NULL OR u.status <> 'not_started');

-- (b) Expected 0 — external units are already stamped; the backfill must not touch them.
SELECT count(*) FROM units
WHERE manufacturing_partner_id <> 'mp-internal' AND manufacturing_assigned_at IS NULL;

-- (b2) Expected 0 — no installed unit is currently subcontracted. If this is ever
--      non-zero, step (a1) must NOT be run as written: those units were genuinely
--      built by a partner and forcing them to in-house would falsify the record.
SELECT count(*) FROM units
WHERE (status = 'installed' OR installed_at IS NOT NULL)
  AND manufacturing_partner_id <> 'mp-internal';

-- (c) Record for the runbook: rows the backfill will touch (expected ~447 of 963 NULL).
SELECT count(*) FILTER (WHERE manufacturing_assigned_at IS NULL) AS null_assigned,
       count(*) FILTER (WHERE manufacturing_partner_id <> 'mp-internal') AS external
FROM units;
```

**Step 2 — dry-run the backfill.** Run the `UPDATE`'s predicate as a `SELECT id, unit_number, status` first and eyeball the row count against (c). Only then apply.

**Step 3 — post-assertions inside the same transaction.** The migration already aborts on orphaned scheduled units (3.1c). Add a second guard so a mis-written predicate cannot silently move ownership:

```sql
DO $$
DECLARE v_ext int;
BEGIN
  SELECT count(*) INTO v_ext FROM public.units
   WHERE manufacturing_partner_id <> 'mp-internal';
  IF v_ext <> 14 THEN   -- update this literal from step (c) before applying
    RAISE EXCEPTION 'External unit count changed during migration (now %) — aborting', v_ext;
  END IF;
END $$;
```

**Step 4 — after applying**, confirm `/cutter/queue`'s unit count matches the pre-deploy number **exactly**, and that all 14 external units still appear in the subcontractor portal.

**Rollback:** the stamps are not reversible (you can't tell backfilled from deliberate afterwards) and are harmless to leave — they only mean "someone decided", which is true. Real rollback = re-apply the `get_role_schedule` body from `20260806120000` and revert the code. **No data is destroyed by rolling back or forward.**

---

## Phase MR4 — Lock the manufacturer once manufacturing has started

Split into two shippable halves so the risky database work and the routine interface work don't share a session.

**The protective value all lands in 4a.** After 4a, the lock is enforced in the server action and the DB trigger — a locked unit cannot change manufacturer no matter what the browser does. The picker will still *look* editable and will fail with a readable message when used. That's ugly for the days between, not unsafe. **4b makes it pleasant**: the control goes read-only with a reason, and the owner gets the "Transfer anyway" dialog. If 4b slips, nothing is exposed.

---

# Phase MR4a — Enforcement (DB + server action) · **Fable 5 · high**

### 4a.1 Override mechanism — an override stamp on `units`
Two columns, written **in the same UPDATE** as the partner change:

```sql
ALTER TABLE public.units
  ADD COLUMN IF NOT EXISTS manufacturing_transfer_override_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS manufacturing_transfer_override_by TEXT;
```

The `BEFORE UPDATE` trigger sees both on `NEW` and unlocks only when the stamp is **fresh in this statement** (`NEW.x IS NOT NULL AND NEW.x IS DISTINCT FROM OLD.x`) **and** `get_user_role() = 'owner'`. That freshness test is what stops a once-overridden unit becoming permanently transferable.

Rejected alternatives: a transaction-local GUC set by a separate helper doesn't work — PostgREST runs each supabase-js call in its own transaction, so a local `set_config` is rolled back before the UPDATE and a non-local one leaks across the pooled connection. A dedicated `transfer_unit_manufacturer` RPC is more airtight but adds a second routing write path, which is exactly the property the feature doc treats as hard-won.

**Trade-off accepted:** the stamp keeps one write path, works with PostgREST's transaction model, and leaves a permanently queryable audit trail on the row. It gives up atomicity of the activity-log write (stays in `after()`, like all existing logging) and can't enforce the typed unit number in SQL. Both fine — the typed confirmation is an anti-fat-finger guard on an already-authorised owner; the security boundary is `v_role = 'owner'` in the trigger.

### 4a.2 Migration `20260810140000_manufacturing_lock.sql`

**One lock predicate, in SQL:**

```sql
CREATE OR REPLACE FUNCTION public.is_manufacturing_locked(
  p_unit_id text, p_partner_id text,
  p_production_entered_at timestamptz, p_all_measured_at timestamptz
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN COALESCE((SELECT mp.is_internal FROM public.manufacturing_partners mp
                    WHERE mp.id = p_partner_id), true) THEN
      -- INTERNAL: cutter pulled it onto the floor, or a blind has moved.
      p_production_entered_at IS NOT NULL
      OR EXISTS (SELECT 1 FROM public.window_production_status w
                  WHERE w.unit_id = p_unit_id AND w.status <> 'pending')
    ELSE
      -- EXTERNAL: the vendor can see it (their worklist predicate), or finished a blind.
      p_all_measured_at IS NOT NULL
      OR EXISTS (SELECT 1 FROM public.window_production_status w
                  WHERE w.unit_id = p_unit_id AND w.status = 'qc_approved')
  END;
$$;
```

Both `EXISTS` probes ride `idx_window_production_status_unit_status (unit_id, status)` from `20260627120000`.

**View `unit_manufacturing_locks`** — same shape and privilege posture as `unit_current_stages` (`REVOKE` from `PUBLIC`/`anon`/`authenticated`; it's a building block for the SECURITY DEFINER RPCs only). Calls the function so there is literally one predicate, and adds the two counts the dialog needs:

- `qc_count` — finished blinds; survive a transfer
- `in_flight_count` = `started_count - qc_count` — part-built blinds that **get rebuilt, ~$100 each**

**Restructure `units_guard_ownership_columns`** (`CREATE OR REPLACE` from `20260806120000:188-230`). The owner short-circuit at `:203` currently precedes everything, so the lock check must move above it:

```plpgsql
IF COALESCE(auth.jwt() ->> 'role', '') = 'service_role' THEN RETURN NEW; END IF;

v_role    := public.get_user_role();
v_changed := NEW.manufacturing_partner_id IS DISTINCT FROM OLD.manufacturing_partner_id;

-- Only the owner may ever stamp the override columns.
IF v_role <> 'owner' AND (
     NEW.manufacturing_transfer_override_at IS DISTINCT FROM OLD.manufacturing_transfer_override_at
  OR NEW.manufacturing_transfer_override_by IS DISTINCT FROM OLD.manufacturing_transfer_override_by) THEN
  RAISE EXCEPTION 'Only the owner may record a manufacturing transfer override' USING ERRCODE = '42501';
END IF;

-- LOCK. Evaluated from OLD state (the lock depends on which side currently owns the
-- unit) and only on a partner change, so recomputeUnitStatus and the subcontractor's
-- own units.status writes never reach it.
IF v_changed THEN
  v_locked := public.is_manufacturing_locked(
    OLD.id, OLD.manufacturing_partner_id, OLD.production_entered_at, OLD.all_measured_at);
  IF v_locked AND NOT (v_role = 'owner'
       AND NEW.manufacturing_transfer_override_at IS NOT NULL
       AND NEW.manufacturing_transfer_override_at IS DISTINCT FROM OLD.manufacturing_transfer_override_at) THEN
    RAISE EXCEPTION 'Manufacturing has already started on this unit — only the owner may transfer it, with confirmation'
      USING ERRCODE = '42501';
  END IF;
END IF;

IF v_role = 'owner' THEN RETURN NEW; END IF;
-- ... scheduler branch (:212-219) and catch-all (:221-227) copied verbatim,
--     with the two override columns added to the immutability list.
```

**Dataset projections** — all three need the derived boolean:
- `get_owner_dataset` — `LEFT JOIN unit_manufacturing_locks uml` beside the existing `unit_current_stages` join (`20260806120000:446`) and one key `'manufacturing_locked', COALESCE(uml.manufacturing_locked, false)`.
- `get_scheduler_dataset` (`20260805130000:211+`) and `get_full_dataset` — extend the existing `row_to_json(su.*)::jsonb || jsonb_build_object('current_stage', …)` merge. `row_to_json` gets columns free but not a *derived* value, so the explicit merge is still needed.

Comment that the safe default here is the **opposite** of the partner default: absent `manufacturing_locked` must read `false`, so an old RPC shape leaves the picker usable rather than freezing every unit. The server action and trigger are the real enforcement.

### 4a.3 TS mirror
**New `src/lib/manufacturing-lock.ts`** — `computeManufacturingLock({ partnerId, productionEnteredAt, allMeasuredAt, startedCount, qcApprovedCount })` mirroring the SQL, plus `manufacturingLockReason(partnerName, isInternal, counts)` for UI copy.

**`src/lib/types.ts`** — `Unit` gains `manufacturingLocked?: boolean`.
**`src/lib/dataset-mappers.ts`** — `UnitRow` (`~:95-100`) gains `manufacturing_locked?: boolean | null`; `mapUnit` (`~:248-249`) gains `manufacturingLocked: r.manufacturing_locked ?? false`.

**Why server-derived rather than client-computed:** `get_owner_dataset` ships `rooms: '[]'` and `windows: '[]'` (`20260806120000:449-452`), so per-window statuses aren't on the client at all, and `production_entered_at` isn't in the explicit projection. There is no way to compute the lock client-side on `/management/units`, where the bulk sheet lives.

**The unit-detail pages take a cheaper route.** `loadUnitDetail` (`src/lib/server-data/lookups.ts:69`) and `loadSchedulerUnitDetail` (`:157`) already do `units.select("*")`, so they have the partner, `production_entered_at` and `all_measured_at`. Add **one** query each — `window_production_status.select("status").eq("unit_id", unitId)` — fold to counts, call `computeManufacturingLock` before `mapUnit`. This avoids granting `authenticated` direct `SELECT` on the view (PG views default to `security_invoker = off`, so a direct client read would bypass `units` RLS and leak lock state across scope).

> Per the scoped-provider gotcha: these nested providers **shadow** the global dataset, so any new `Unit` field must be added here or it silently arrives empty on unit-detail routes.

### 4a.4 Server action
**`src/app/actions/management-actions.ts:873-997`** — signature gains `override?: { unitId: string; confirmUnitNumber: string }`.

1. Extend the targets select (`:913-915`) with `production_entered_at, all_measured_at`.
2. One batched read of `window_production_status.select("unit_id, status").in("unit_id", scopedUnitIds)`; fold to per-unit `{started, qcApproved}`.
3. Compute `locked` per target — **against the unit's current, pre-move partner**, matching the trigger.
4. Override valid only if **all four**: `actor.role === "owner"`, `unitIds.length === 1`, `unitIds[0] === override.unitId`, and the trimmed case-insensitive unit number matches. No override path exists for any other role.
5. Locked targets without a valid override → reject the **whole batch** with unit names, mirroring the existing scheduler rejection (`:928-940`) and its rationale about silent partial writes.
6. In the UPDATE (`:948-954`), on the override path add both override columns **in the same statement** — that is what makes the trigger's freshness test pass. Normal path leaves them alone.
7. Keep the synchronous purge (`:962-975`) exactly as is.
8. In `after()` (`:979-987`), on the override path log `manufacturer_transfer_override` with `{ from, to, unitNumber, blindsQcApproved, blindsInFlight, estimatedRebuildCostUsd: inFlight * 100 }`.

### 4a.5 Tests
- New `src/lib/manufacturing-lock.test.mts` — full truth table: internal × (production_entered / any non-pending / neither), external × (all_measured / any qc_approved / neither), plus `partnerId: null ⇒ internal`.
- New `scripts/deploy/parity-manufacturing-lock.mjs`, modelled on `parity-unit-current-stage.mjs`: TS mirror vs `unit_manufacturing_locks.manufacturing_locked` across every unit.
- `src/lib/dataset-mappers.test.mts` — absent `manufacturing_locked` ⇒ `false`.

### 4a.6 Deploy risk
The trigger restructure moves the owner short-circuit *after* a new check, so a bug there breaks owner writes to `units` broadly — and `units` is written on nearly every user action. Mitigations:

- The lock check is gated on `v_changed` (partner actually changing), so the overwhelming majority of `units` updates never reach it. The override-column check compares `NEW` to `OLD`, and untouched columns carry `OLD`'s value in a `BEFORE UPDATE` trigger, so ordinary writes don't trip it either.
- `ADD COLUMN ... TIMESTAMPTZ` with no default and no `NOT NULL` is a metadata-only change — no table rewrite, no lock beyond a brief `ACCESS EXCLUSIVE`.
- **Rehearse the trigger in a transaction before committing it:** apply the `CREATE OR REPLACE`, run the three probes below as `UPDATE`s, then `ROLLBACK`. Only re-apply for real once all three pass.

**Smoke-test all three trigger paths after deploy** — every one of them writes `units` and must still succeed: (1) owner edits an installation date, (2) installer marks a window measured (drives `recomputeUnitStatus`), (3) subcontractor marks a blind complete (writes `units.status` as the subcontractor role).

**Day-one impact, measured:** 460 units lock immediately (447 internal, 13 external). None of the external units have started work, so nothing in flight is stranded, and the owner's "Transfer anyway" path covers any mis-routing that surfaces later. Announce the lock to the schedulers before shipping — from that moment they can set a manufacturer but not change one.

**Done when:** the three trigger probes pass, `parity-manufacturing-lock.mjs` is green, and a locked unit rejects a manufacturer change from the server action with a readable message. The picker still looks editable at this point — that's 4b.

---

# Phase MR4b — Interface (UI) · **Sonnet 5 · medium**

No migration, no server-side change. Purely presenting the state 4a already enforces.

### 4b.1 Components
- **`src/components/units/unit-manufacturer-picker.tsx`** — new props `locked`, `lockCounts`. Extend `canEdit` (`:48`) to `(role === "owner" || !assignedAt) && !locked`. Read-only branch (`:49-60`) shows `manufacturingLockReason(...)` ("In production — 6 blinds cut or assembled" / "With Progressive Distribution since 3 Aug"). When `locked && role === "owner"`, a small "Transfer anyway" text button. Wire both call sites (`management-unit-detail.tsx:437`, `scheduler-unit-detail.tsx:361`).
- **New `src/components/units/manufacturer-transfer-dialog.tsx`** — destination picker, both counts spelled out ("4 finished blinds stay finished. 6 are part-built and will be rebuilt — about $600."), a text input requiring the exact unit number, destructive confirm. Calls the action's `override` argument from 4a.4.
- **`src/components/units/bulk-assign-manufacturer-sheet.tsx`** — prop changes from `unitIds: string[]` to `units: Unit[]`; split on `manufacturingLocked`; submit only movable ids; muted line "N units skipped — manufacturing already started. Open them individually to transfer."; disable when nothing is movable. Update the call site (`units-list.tsx:857-863`).
- **`manufacturer-gate.tsx`** — **no change.** Locked-internal implies the unit was in the factory queue, which after the block phase implies routed; locked-external implies an external partner, which implies routed. So locked ⟹ assigned ⟹ `needsChoice` false ⟹ the gate never renders on a locked unit. *This is why the lock must follow the backfill* — before it, that implication doesn't hold.

### 4b.2 Verify
`npm run perf-budget` matters here specifically — the transfer dialog is new client code in the management and scheduler bundles; confirm the shared base is still ~168 kB and first load stays ≤300 kB.

**Done when:** on an in-production internal unit the picker is read-only with a reason for both scheduler and owner; owner clicks "Transfer anyway", a wrong unit number is rejected and the right one transfers, with the override row in `unit_activity_log` and the stamp set; a mixed bulk selection reports the skipped count and moves only the rest.

---

## Verification

### Extend `scripts/deploy/verify-manufacturing-partners.mjs`
**After Phase MR3:**
- `no scheduled unit is unrouted` — must be 0. Direct analogue of the existing "the partner filter drops nothing" check; catches a queue-emptying regression.
- `get_role_schedule drops exactly the unrouted ∪ external set` — extend the block at `:74-101` to compute `excludedUnitIds` and assert `rows === rawCount - excludedRows`, printing both numbers.
- `every externally-routed unit has a routing timestamp` — must be 0 (the invariant letting `get_subcontractor_worklist` skip the predicate).
- `the RPC projects manufacturing_assigned_at` — assert the key exists on `schedule.units[0]`. Cheap, and it is the exact regression that silently disables the TS backstop.

**After Phase MR4:**
- `locked ⟹ routed` — any row with `manufacturing_locked AND manufacturing_assigned_at IS NULL` is a contradiction.
- Census of override stamps (informational — this is the audit surface) and of locked vs transferable units.

### Local gate, every phase
```bash
npm run typecheck && npm run lint && npm test && npm run perf-budget
```
`perf-budget` matters in Phase MR4 — the transfer dialog is new client code in the management/scheduler bundles.

### Prod, after each migration
```bash
node scripts/deploy/verify-manufacturing-partners.mjs
node scripts/deploy/parity-b2-role-schedule.mjs       # RPC ↔ chunked; catches a Phase MR3 half-edit
node scripts/deploy/parity-unit-current-stage.mjs
node scripts/deploy/parity-manufacturing-lock.mjs     # new, Phase MR4
```

### Manual smoke, in order
- **Phase MR1:** cutter logs in → `/cutter/process` lists no subcontracted unit; paste a subcontracted `/cutter/units/<id>` → read-only banner, no Mark Cut. Owner's `/management/process` still shows everything.
- **Phase MR2:** owner dashboard shows "No manufacturer assigned" with a plausible count; drill-down lists them with a violet chip; **apply any filter and confirm the count doesn't jump from 0 to N** — that jump is the `normalizeOwnerDashboardCounts` miss. Scheduler dashboard shows the same bucket, scoped.
- **Phase MR3:** `/cutter/queue` unit count matches the pre-deploy number **exactly** — the critical check. Then create a unit, add a room *as an installer* (skips the gate), add and measure a window: it must appear in the new dashboard bucket and **not** in the cutter queue. Route it in-house → appears within one reflow.
- **MR4a:** the three trigger regression probes from 4a.6 (owner edits a date, installer marks measured, subcontractor marks complete — all must still succeed), then confirm a locked unit's manufacturer change is rejected by the server action.
- **MR4b:** on an in-production internal unit the picker is read-only for scheduler and owner; owner clicks "Transfer anyway", wrong unit number → rejected; right one → transfers, activity log has the override row, stamp is set. Bulk-select a mix → sheet reports skipped count, moves the rest.

### Docs to update
- `docs/SUBCONTRACT_MANUFACTURING.md` — §3 gains a routing layer row; §4 lifecycle gains the "unrouted ⇒ no queue" branch; §5 table gains a "Change it after manufacturing started" row; §8 gains the `undefined ⇒ routed` asymmetry as a numbered gotcha; §9 gains the new parity script.
- `docs/security/ACTION_AUTHZ_MATRIX.md` — new rows for the lock trigger and override stamp.
- New `docs/DEPLOY_RUNBOOK_MANUFACTURING_LOCK_2026-08-10.md` — four phases, pre-flight queries, the backfill's scheduler-permission side effect, the "stamps are not reversible" rollback note.
