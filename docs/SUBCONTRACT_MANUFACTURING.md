# Subcontract manufacturing — orientation

**Shipped 2026-08-06** (migration `20260806120000`, commit `448bd92`).
Read this before touching anything under "Files that matter" below.

Companion docs: `DEPLOY_RUNBOOK_SUBCONTRACTOR_2026-08-06.md` (rollback),
`security/ACTION_AUTHZ_MATRIX.md` § Manufacturing exclusivity (the guarantees),
`CONTEXT.md` (domain vocabulary).

---

## 1. What changed, in one paragraph

FSR used to manufacture everything in-house through three role portals
(cutter → assembler → qc). Now a unit can instead be handed **wholesale** to an
external subcontractor who cuts, assembles, QCs and packages it and hands back
finished blinds. A new `manufacturing_partners` table holds the companies,
`units.manufacturing_partner_id` says who owns each unit, and a new
`subcontractor` role gets a desktop portal listing their work.

---

## 2. The mental model (read this bit twice)

### There is no second pipeline

A subcontracted unit moves through **the same stages as everything else**. When a
partner marks a blind complete, the app writes
`window_production_status.status = 'qc_approved'` — a state the whole system
already understood before this feature existed. Consequences:

- `recomputeUnitStatus()` moves the unit to `manufactured`, unchanged.
- The `unit_current_stages` view derives stage `qc`, unchanged.
- The owner dashboard counts it, unchanged.

**No new stage, no new status enum, no change to the stage derivation or its
TS↔SQL parity contract.** If you find yourself adding a "subcontracted" stage,
stop — that is not how this works.

### "Internal" is the default, and that is load-bearing

`units.manufacturing_partner_id` is `NOT NULL DEFAULT 'mp-internal'`. Anywhere the
column is absent (an RPC that does not project it, a pre-migration row), the code
reads it as **internal** — see `isInternalPartner()`. Inverting that default
would silently drop real units out of the factory queues with nobody building
them. There is a test pinning it (`manufacturing-partners.test.mts`).

> **Since stations (2026-08-14):** there is now more than one internal row, so
> `id === INTERNAL_PARTNER_ID` is **not** a test for in-house work — that constant
> is only the column *default*. Internality is resolved from the partner list
> (`isInternalPartner`), and the old `isInternalPartnerId()` helper was deleted
> rather than kept, precisely so this mistake cannot be made silently. See
> [`MANUFACTURING_STATIONS.md`](./MANUFACTURING_STATIONS.md).

### `manufacturing_assigned_at` is the "has anyone decided?" flag

Because the partner column defaults to in-house, the id alone cannot distinguish
*"deliberately kept internal"* from *"nobody has looked at this"*. The timestamp
does. It drives two things:

- The **room-creation gate** (prompt only when NULL).
- **Owner-only re-assignment** (a scheduler may set it, not change it).

It also doubles as the subcontractor's "Date added" column.

---

## 3. THE INVARIANT

> The same window must never be actionable by the in-house factory **and** a
> subcontractor at the same time.

Building the same blind twice is the expensive failure this feature exists to
avoid. Ownership is a single column, so the *data model* is exclusive by
construction. The risk is entirely in the **read paths disagreeing** about it and
**write paths trusting a stale page**. Four layers:

| # | Layer | Where |
|---|---|---|
| 1 | Internal read | `get_role_schedule` joins `manufacturing_partners`, keeps `is_internal` only. Every factory screen derives from that one `src` CTE. |
| 2 | Internal read, TS mirror | `assembleRoleScheduleItems()` in `manufacturing-scheduler.ts` skips non-internal units — the single funnel the chunked fallback also passes through. |
| 3 | Partner read | `get_subcontractor_worklist` filters `= auth_partner_id()`. **Same column as layer 1**, which is what makes the two sets provably disjoint. |
| 4 | Write | `wps_guard_manufacturing_ownership` — BEFORE INSERT OR UPDATE trigger on `window_production_status`. Every mark-cut/assembled/QC'd/complete path writes that table, so one trigger covers all of them *including screens that do not exist yet*. |

Plus two non-guarantees that exist for good behaviour, not correctness:
`assertUnitIsInternallyManufactured()` in `production-actions.ts` (turns a stale
tab into a readable message rather than a raw 42501), and the **synchronous**
schedule-row purge in `assignUnitsToManufacturingPartner`.

### Why the purge is synchronous

The original design deferred it to the reflow inside `after()`. That left a real
window — between the UPDATE committing and the purge landing, and *permanently* if
`after()` never ran — where the unit matched the partner's predicate **and** still
had in-house schedule rows. It was in both queues. Do not move it back into
`after()`.

### Capacity, not just visibility

`reflowManufacturingSchedules()` filters its source query to internal units
(`manufacturing-scheduler.ts` ~line 300). This is not a display concern: the
factory's day buckets are capacity-allocated, so a subcontracted unit left in the
reflow would occupy in-house cutting/assembly/QC slots and push real internal
dates out for work nobody is doing. It also self-heals — `purgeExternalSchedules()`
runs on every reflow and drops rows for units that have since moved out.

---

## 4. Lifecycle of a subcontracted unit

```
unit created (CSV import or manually)
  manufacturing_partner_id = 'mp-internal', manufacturing_assigned_at = NULL
        │
        ▼  rooms + windows added, installer measures
  units.all_measured_at set
  — all of this happens with NO manufacturer chosen, by design (2026-08-12).
    An unrouted unit is in NO queue: the reflow source query requires
    manufacturing_assigned_at, and no partner worklist can see it because the
    partner column still sits at the 'mp-internal' default. It stalls, visibly,
    in the dashboard's "No manufacturer assigned" filter.
        │
        ▼  owner/scheduler routes it, at any time, from the unit-detail picker
          or the bulk-assign sheet  → stamps partner + manufacturing_assigned_at
        │
        ├─ internal  → reflow schedules it → cutter → assembler → qc
        │
        └─ external  → NEVER enters the reflow
                       appears in /subcontractor (partner + all_measured_at)
                       partner ticks rows → status = 'qc_approved'
                       → recomputeUnitStatus → units.status = 'manufactured'
                       → dashboard stage = "Quality Checked"
                       → scheduler notified once the LAST blind lands
        │
        ▼
  installer installs → units.status = 'installed', installed_at stamped
```

**Mid-flight transfer is allowed at any stage** and preserves progress: already
`qc_approved` blinds stay complete (not rebuilt); anything else shows as "Open" to
the receiving side. Moving back in-house works the same way — the cutter queue
only surfaces `pending` windows.

---

## 5. Who can do what

| Action | owner | scheduler | installer | cutter/assembler/qc | subcontractor |
|---|:--:|:--:|:--:|:--:|:--:|
| Set manufacturer the first time | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Change** it afterwards | ✅ | ❌ | ❌ | ❌ | ❌ |
| See subcontracted units in the factory queue | — | — | — | ❌ | — |
| Mark in-house work cut/assembled/QC'd | ✅ | ❌ | ❌ | ✅ | ❌ |
| Mark subcontracted work complete | ✅ | ❌ | ❌ | ❌ | ✅ (own partner) |
| Create partners + subcontractor logins | ✅ | ❌ | ❌ | ❌ | ❌ |

**Installers are deliberately exempt from the room gate.** They add rooms on site
and cannot answer "who manufactures this" — the action requires owner/scheduler
and the DB trigger would reject the write. A unit whose rooms an installer created
stays unrouted until the office assigns it.

---

## 6. Files that matter

| Concern | File |
|---|---|
| Schema, RLS, triggers, RPCs | `supabase/migrations/20260806120000_manufacturing_partners.sql` |
| `INTERNAL_PARTNER_ID`, `isInternalPartner`, `isStationWork` | `src/lib/manufacturing-partners.ts` |
| Reflow exclusion + capacity + TS read filter | `src/lib/manufacturing-scheduler.ts` |
| Assign action (owner-only re-assign, sync purge) | `src/app/actions/management-actions.ts` → `assignUnitsToManufacturingPartner` |
| In-house write guards | `src/app/actions/production-actions.ts`, `cutter-production-actions.ts` |
| Partner write actions | `src/app/actions/subcontractor-actions.ts` |
| Partner data read | `src/lib/subcontractor-data.ts` |
| **Export column contract** | `src/lib/subcontractor-xlsx.ts` → `EXPORT_COLUMNS` |
| Decimal → fraction | `src/lib/fraction-inches.ts` |
| Portal | `src/app/subcontractor/`, `src/components/subcontractor/subcontractor-work-table.tsx` |
| Owner/scheduler UI (the only routing surfaces) | `src/components/units/bulk-assign-manufacturer-sheet.tsx`, `unit-manufacturer-picker.tsx` |
| Accounts | `src/app/actions/auth/subcontractor.ts`, `management/accounts/forms/invite-subcontractor-form.tsx` |
| Verification | `scripts/deploy/verify-manufacturing-partners.mjs` |

---

## 7. The subcontractor portal

`/subcontractor` — Production and Completed. **The only portal that is not
mobile-shaped**: every other layout wraps children in `mx-auto max-w-lg`, and this
one simply omits it. That single class is what makes the rest of the app a phone
app; no existing portal was touched to add a desktop one.

Constraints agreed with the actual subcontractor on 2026-08-06 — do not "improve"
these without asking:

- **No sort or filter controls.** Fixed oldest-first order so the whole shop reads
  the same list in the same order. Ordering is applied server-side in
  `loadSubcontractorWorklist`, not in the component.
- **Window width and height are separate columns**, rendered as mixed fractions
  (`35 1/2`, `20 11/16`) because the floor reads tape measures. Rounded to the
  nearest 1/16.
- **The other spec columns stay decimal** — explicitly confirmed. Do not convert
  Fab (mach.) / Fab (cut) / Valance / Tube / Bot. rail.
- **"Date added"** is when the unit entered *their* queue —
  `max(manufacturing_assigned_at, all_measured_at)`, not the in-house scheduled cut
  date, which does not exist for these units.
- Select rows, "select next N", Mark complete, Export CSV/Excel.

`EXPORT_COLUMNS` in `subcontractor-xlsx.ts` is the **single** column definition —
the on-screen table, the Excel export and the CSV export all read it, so they
cannot drift. Changing what the partner receives is one edit to that array.

**SheetJS is dynamically imported inside the click handler.** It is ~400 KB; a
static import would blow the ≤300 KB first-load budget `npm run perf-budget`
enforces. Same treatment jsPDF already gets. If you touch that import, re-run
`npm run perf-budget` and confirm the shared base is still ~168 kB.

---

## 8. Gotchas

1. **Adding a dashboard filter?** It must go into `hasScopeFilters`, not just the
   filter list. `stageCounts` only uses the pre-aggregated SQL counts when
   `!hasScopeFilters`; miss it and the dashboard shows unfiltered counts while the
   filter looks active. (This is also why `get_owner_dashboard_counts` needed no
   change for the Manufacturer filter.)
2. **`manufacturers` is a dead name.** The original table was renamed to `cutters`
   in `20260407130000`. Never reintroduce it. "Manufacturer" is UI copy only; the
   entity is `manufacturing_partners`.
3. **The owner dataset RPC uses an explicit projection.** A new `units` column is
   invisible to the UI until you add it to `get_owner_dataset`'s
   `jsonb_build_object` *and* to `UnitRow`/`mapUnit`. `get_full_dataset` and
   `get_scheduler_dataset` use `row_to_json` and pick it up for free.
4. **Realtime ships raw `units` columns only.** That is why the partner **id** is
   stored on the unit and the **name** is resolved client-side from the
   `manufacturingPartners` slice — a joined name would not survive a
   `postgres_changes` update.
5. **Every unit predating this feature has `manufacturing_assigned_at = NULL`**, so
   each will be prompted once when someone next adds a room. Intended. The runbook
   has the SQL to suppress it if it becomes annoying.
6. **`xlsx@0.18.5`** (npm) carries CVE-2023-30533 in its *parse* path. We only
   ever write, so there is no exposure — but it is a runtime dependency now and
   will show up in an audit.

---

## 9. How to verify it still works

```bash
npm run typecheck && npm run lint && npm test && npm run perf-budget
node scripts/deploy/verify-manufacturing-partners.mjs   # prod, read-only
node scripts/deploy/parity-b2-role-schedule.mjs         # RPC ↔ chunked agreement
node scripts/deploy/parity-unit-current-stage.mjs       # TS ↔ SQL stage parity
```

`verify-manufacturing-partners.mjs` is the one that matters after any change to
the exclusivity layers: it asserts at least one internal partner exists (it was
*exactly* one until stations lifted that index) and that `mp-internal` is still
among them, that no unit points at a missing partner, and — while everything is
in-house — that the `get_role_schedule` filter drops **nothing** (rpc row count ==
table row count). An empty factory queue is the failure mode to fear, and that
check catches it. Per-station integrity is
`verify-manufacturing-stations.mjs`'s job.

---

## 10. Known-deferred

Not built, and each is additive on top of this model:

- Returning defective work *to* a subcontractor (their equivalent of the internal
  escalation/pushback flow).
- Partner capacity and scheduling — subcontracted units have no target dates.
- A Manufacturer column or filter on `/management/process`.
- Splitting one unit across two manufacturers. The model is deliberately one
  partner per unit; per-room splitting would make the unit's pipeline stage
  ambiguous and put it in two queues at once. **This is the invariant, not an
  oversight.**
