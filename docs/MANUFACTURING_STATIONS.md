# Manufacturing stations (Station A / Station B)

**Shipped:** 2026-08-14, migration `20260814120000_manufacturing_stations.sql`.
**Read `SUBCONTRACT_MANUFACTURING.md` first** — this builds directly on it and
does not repeat its exclusivity argument.

---

## 1. What changed, in one paragraph

In-house manufacturing used to be one undifferentiated floor: every cutter,
assembler and QC account could see and act on every internal unit, and a unique
index enforced that exactly **one** `manufacturing_partners` row was internal.
FSR opened a second station whose staff must not be able to read the first
station's work. So a **station is now a `manufacturing_partners` row with
`is_internal = true`**: Station A is the pre-existing `mp-internal` row, renamed;
Station B is a new internal row. `units.manufacturing_partner_id` — one column,
already `NOT NULL`, indexed and FK'd — keeps being the single answer to "who
builds this", now three-way: Station A, Station B, or a subcontractor.

```
manufacturing_partners
  mp-internal    Station A                  is_internal = true
  mp-station-b   Station B                  is_internal = true
  mp-a1b2c3d4    Progressive Distribution   is_internal = false

units.manufacturing_partner_id      → exactly ONE of the above
cutters/assemblers/qcs.station_id   → exactly one INTERNAL one
```

No new role, no new portal, no new pipeline stage, no new
`window_production_status` value. The three existing manufacturing roles gained a
station; that is the whole conceptual change. Because `mp-internal` kept its id,
all 963 existing internal units and every existing staff account stayed exactly
where they were, with **zero backfill** — the `NOT NULL DEFAULT` on `station_id`
*is* the backfill, the same trick `units.manufacturing_partner_id` used.

---

## 2. The three rules

These are what keep a unit from being built twice or vanishing. Everything else
follows from them, and any future change here must be checked against them.

### Rule 1 — the station lives in exactly one column, and nowhere else

Never denormalise `station_id` onto `windows`, `window_production_status`, or
`window_manufacturing_schedule`. Every read path and every write guard derives the
station by joining to `units.manufacturing_partner_id`. **The moment the station
exists in two places, the gap between updating them is the double-build window.**
This is the same lesson §8 of the subcontracting migration records: the danger was
never the data model, it was two read paths using different predicates.

### Rule 2 — an internal→internal move must never DELETE a schedule row

Queue membership is *"has `window_manufacturing_schedule` rows **and** the unit's
partner is mine."* Delete the rows and the unit disappears from every queue with
**no error raised anywhere** — nobody builds it, and nothing reports it missing.
That is the worst failure this feature can produce, because it is silent.

Two pre-existing lines would have done exactly this to Station B on day one, both
because they asked *"is it the constant?"* instead of *"is it in the internal
set?"*:

- `purgeExternalSchedules` — was `.neq("manufacturing_partner_id", INTERNAL_PARTNER_ID)`
- `assignUnitsToManufacturingPartner` — was `if (partnerId !== INTERNAL_PARTNER_ID) { purge }`

Both now resolve the internal set from the database. The rule is encoded as a
tested predicate in [`src/lib/manufacturing-move.ts`](../src/lib/manufacturing-move.ts)
(`planManufacturerMove`), whose truth table `manufacturing-move.test.mts` pins:
`deletesScheduleRows` is keyed off the **destination alone** and is never true for
a relocation.

### Rule 3 — never rewrite attribution on a move

`window_production_status.cut_by_cutter_id` keeps pointing at whoever cut it;
their station is recoverable via `cutters.station_id`. That is the honest
historical record, and it is what makes *"did work disappear?"* answerable after
the fact.

**Consequence to accept:** a future "how many blinds did Station B produce?"
report must count via `cut_by_cutter_id → cutters.station_id`, **not** the unit's
current station, because moved units carry their attribution. No such report
exists today; the data needed to build one correctly is preserved.

---

## 3. Relocation vs transfer

One column write, two very different operations. This distinction is the reason
part-built units can move at all.

| | **Relocation** (in-house → in-house) | **Transfer** (crosses in-house ↔ vendor) |
|---|---|---|
| What physically happens | The blinds walk down the hall | The unit is rebuilt by someone else |
| Cost | Nothing is rebuilt | ~$100 per blind |
| Manufacturing lock | **Skipped** | Binds; owner-only with typed confirmation |
| `window_production_status` | Travels untouched | Travels untouched (vendor rebuilds anyway) |
| Schedule rows | **Kept** (Rule 2) | Deleted when leaving in-house |
| Manual pins | Cleared by `UPDATE` | n/a |
| Override columns stamped | No | Yes (`manufacturing_transfer_override_*`) |
| Audit action | `station_relocated` (+ progress snapshot) | `manufacturer_assigned` |

The lock's job is to price a cross-**company** double build. A relocation rebuilds
nothing, so the lock does not apply — `units_guard_ownership_columns` computes
`v_relocation` and skips the lock check when both sides are internal.
`planManufacturerMove` is the app-side mirror; the DB trigger is the real guard.

### What a move carries

| | Carried | Why |
|---|---|---|
| `window_production_status` (cut/assembled/QC'd, by whom, when, notes, issues) | **Yes, untouched** | The work is real. A blind cut at A is a cut blind; B's assembler assembles it. |
| `window_manufacturing_schedule` rows | **Yes, kept** | Deleting them is how a unit disappears (Rule 2). |
| `target_ready_date` | Yes | Derived from the installation date — station-independent. |
| `scheduled_cut/assembly/qc_date` | Re-planned | A *plan* against A's capacity; B's reflow rewrites them. |
| `is_schedule_locked`, `manual_priority`, `over_capacity_override`, `lock_reason` | **Cleared** | Pins made against A's day buckets; a pinned date can jam B's packing. Cleared by `UPDATE`, never `DELETE`. |

### Why a station move is safe

A move is one `UPDATE units SET manufacturing_partner_id = …`. Work-in-progress
and queue position are per-window and reference no station, so they are untouched.
Because the queue read (`get_role_schedule`'s `src` CTE), the RLS predicate
(`can_access_unit`) and the write guard (`wps_guard_manufacturing_ownership`) all
join through that same column, the unit leaves A and enters B at the instant the
UPDATE commits. **There is no interval in which both stations see it.**

**Concurrency.** If a Station A cutter clicks "mark cut" while the move commits,
either the trigger reads the pre-move partner and allows the write (the work is
real and travels with the unit — correct), or it reads the post-move partner and
rejects with *"This unit is now built at Station B"* (correct). Neither ordering
loses a write or produces a double build.

**Partial failure.** If the `units` UPDATE commits but the reflow fails, the unit
still appears in Station B's queue — membership depends on the rows existing, not
on the reflow succeeding — just with dates planned against A's capacity until the
next reflow. Degraded, never lost.

---

## 4. How the wall is built

| Layer | Mechanism |
|---|---|
| Read (RLS) | `can_access_unit()` — the cutter/assembler/qc branches went from unconditional `true` to `manufacturing_partner_id = auth_station_id()`. `rooms`, `windows`, `window_production_status` and `window_manufacturing_escalations` all route their SELECT through it, so **the entire subtree scopes for free**. |
| Read (queue) | `get_role_schedule` applies a station predicate to `src`, the CTE every other key derives from. cutter/assembler/qc are pinned to `auth_station_id()`; `p_station_id` is **ignored** for them, so a crafted argument cannot widen scope. |
| Read (TS backstop) | `assembleRoleScheduleItems` drops units failing `isStationWork(unit, stationId)` — the single funnel the chunked fallback also passes through. |
| Write | `wps_guard_manufacturing_ownership` gained a third rejection: an in-house role writing **another station's** unit, naming the owning station so a stale tab produces a readable message. |
| Accounts | `station_id` on `cutters`/`assemblers`/`qcs`, `NOT NULL` and FK'd, with a trigger asserting the referenced partner is internal — a cutter can never be attached to a vendor. |

`auth_station_id()` mirrors `auth_partner_id()` exactly. Because `station_id` is
`NOT NULL`, it returns NULL only for a non-station user, so the fail-closed
direction (a real cutter seeing nothing) is unreachable.

### Capacity is per-station; the calendar is not

Only the three `*_daily_capacity` columns are per-station — a station is its own
people and its own throughput. `apply_ontario_holidays` and
`manufacturing_calendar_overrides` describe the **building** and stay
facility-wide, which is why `recomputeManufacturingRiskFlags` (whose only use of
settings is `addWorkingDays`) needs no station awareness. `reflowStation` builds
its `cutLoad`/`assemblyLoad`/`qcLoad` maps per call, so the two stations' day
buckets are genuinely separate rather than a shared pool.

### An incidental security fix

`get_role_schedule` had **no role gate at all**: `SECURITY DEFINER`, granted to
`authenticated`, so any signed-in user — an installer, a subcontractor — could
call it directly and read the whole factory schedule. Survivable when the in-house
floor was one undifferentiated set; fatal to the station wall. Closed in §10 of the
migration, verified against every call site (cutter/assembler/QC portals and
`/management/schedule` only).

---

## 5. Owner surfaces

The owner has **no station of their own**, so anything that reads a station's
queue or capacity must be told which one:

- `/management/schedule` and `/management/settings` read a `?station=` param,
  default to the first internal station, and show a switcher when more than one
  station exists. `loadPersistedRoleSchedule` **requires** an explicit
  `stationId` for the owner — merging two stations' day buckets would report a
  capacity neither of them has.
- `/management/settings` remounts on switch (`key={stationId}`) so the capacity
  inputs reset to the selected station's numbers instead of showing the previous
  station's.
- Accounts are grouped into per-station sections, each with its own Add button.
  The station is **fixed at creation** and never edited — there is no
  `updateCutterStation` action. Moving a person between stations means a new
  login.
- Dashboard and units-list manufacturer filter chips needed no work: they render
  from the partner list, so stations appear automatically.

---

## 6. Files that matter

| Concern | File |
|---|---|
| Schema, RLS, triggers, RPC | `supabase/migrations/20260814120000_manufacturing_stations.sql` |
| Relocation vs transfer (tested predicate) | `src/lib/manufacturing-move.ts` |
| `isInternalPartner`, `isStationWork`, `internalPartnerIds` | `src/lib/manufacturing-partners.ts` |
| Lock parity with SQL (`isInternal`, not a partner id) | `src/lib/manufacturing-lock.ts` |
| Per-station reflow, capacity, purge | `src/lib/manufacturing-scheduler.ts` |
| `auth_station_id` / `requireStationId` (TS side) | `src/lib/auth.ts` |
| Move action | `src/app/actions/management-actions.ts` → `assignUnitsToManufacturingPartner` |
| Account creation with station | `src/app/actions/auth/{cutter,assembler,qc}.ts`, `auth/helpers.ts` → `assertStationIsInternal` |
| Move UI | `src/components/units/station-move-dialog.tsx`, `unit-manufacturer-picker.tsx` |

---

## 7. Verification

```bash
npm run typecheck && npm run lint && npm test && npm run perf-budget

# Before the migration — applies it in a transaction against prod, moves a real
# part-built unit A→B, asserts nothing was lost, then ROLLS BACK.
supabase db query --linked --file scripts/deploy/rehearse-station-move.sql

# After the migration.
node scripts/deploy/verify-manufacturing-stations.mjs   # the two invariants
node scripts/deploy/verify-manufacturing-partners.mjs   # exclusivity layers
node scripts/deploy/parity-manufacturing-lock.mjs       # TS ↔ SQL lock parity
node scripts/deploy/parity-b2-role-schedule.mjs         # RPC ↔ chunked agreement
```

`verify-manufacturing-stations.mjs` is the one that matters. It asserts, over live
data: every staff account sits on an internal station; every internal station has
a capacity row; **every routed in-zone unit has schedule rows for all its windows**
(nothing disappeared); **the per-station queue sets are pairwise disjoint**
(nothing built twice), computed from the real per-station membership rather than
assumed; and that in-zone windows account for exactly stations + vendors +
unrouted. It pages past PostgREST's 1,000-row cap, because a truncated read would
make "nothing disappeared" trivially true.

**Manual, two browsers.** Sign in as a Station A cutter and a Station B cutter
side by side. Confirm each sees only their own units; that a Station A cutter gets
a 404 on a Station B unit URL; that moving a part-built unit A→B removes it from
A's queue and lands it in B's with its cut blinds still marked cut; and that A's
stale tab, on clicking "mark cut", is rejected with a message naming Station B.

### Rollout order

Migration → verify script → account creation for Station B staff → route the first
units. **Station B has no accounts and no units until you create them, so every
step before the last is inert in production.**

---

## 8. Known-deferred

- **Rehearsal probe 3b** (an installer being refused by the new `get_role_schedule`
  role gate) **skipped on prod** — there is no installer user in the database to
  impersonate. The gate itself is four lines with a fail-closed
  `COALESCE(…, false)`, and probe 3a confirms the signature resolves, but the
  refusal path has not been executed against a real installer JWT.
- `purgeExternalSchedules` reads external unit ids with an unpaginated select. A
  truncated read means *fewer* deletes — stale rows survive, which is inert
  (`get_role_schedule` filters on `mp.is_internal` anyway) rather than a
  disappearance. Worth paginating if the vendor unit count approaches 1,000.
- Station B's capacities start as a copy of Station A's, not measured numbers.
  Tune in `/management/settings` once the line's real throughput is known.
