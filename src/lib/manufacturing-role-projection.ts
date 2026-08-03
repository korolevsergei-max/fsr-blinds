import type {
  ManufacturingDayBucket,
  ManufacturingRoleSchedule,
  ManufacturingWindowItem,
} from "./manufacturing-queue-core.ts";

/**
 * The slice of ManufacturingRoleSchedule the factory *screens* actually read.
 *
 * `loadPersistedRoleSchedule` returns the whole all-time manufacturing graph:
 * `allItems` is every schedule row ever written (2,110 items ≈ 2.4 MB), plus
 * `buckets`, `settings` and six count fields. The cutter dashboard, queue and
 * production screens read exactly two of those — `allItems` and
 * `currentWorkDate` — and can only ever act on the handful of windows in their
 * own production status (24 of 2,110 at the time of writing). Everything else
 * is serialized into the RSC stream, parsed and hydrated on a bench tablet on
 * every view and every realtime-triggered router.refresh(), to render nothing.
 *
 * This is the M3 finding, reopened as a ROW filter rather than the field
 * projection that was originally deferred. Row count is where the weight is:
 * the fields that look expensive (`escalationHistory`, `latestEscalation`) are
 * backed by a 10-row table, so dropping fields buys ~30% where dropping rows
 * buys ~95%.
 *
 * Deliberately NOT applied to:
 *   - the completed views (`loadManufacturingCompletedRoleData`), which filter
 *     `allItems` server-side to completed work and need the full history;
 *   - the assembler/qc *queues* (`manufacturing-role-queue.tsx`), which read
 *     `schedule.buckets`;
 *   - `/management/schedule`, which reads `buckets` for all three roles.
 */
export interface FactoryScheduleView {
  currentWorkDate: string;
  allItems: ManufacturingWindowItem[];
}

/** The production status each role can actually act on. */
const ACTIONABLE_STATUS = {
  cutter: "pending",
  assembler: "cut",
  qc: "assembled",
} as const;

/**
 * Narrow a role schedule to the units the role has live work on.
 *
 * Predicate is unit-level, not window-level: a unit is kept WHOLE if any one of
 * its windows sits in the role's actionable status. Keeping the unit whole is
 * load-bearing, not incidental — two screens derive state from a unit's
 * *non*-actionable windows:
 *
 *   - `cutter-queue.tsx` builds `unitsWithStartedCutting` from items whose
 *     status is NOT pending, to hide units where cutting has already begun. A
 *     window-level filter would strip exactly those items and the unit would
 *     wrongly reappear in the queue.
 *   - `cutter-production.tsx` groups by `productionEnteredAt` and renders the
 *     already-cut windows with a "Cut" badge plus an Undo affordance.
 *
 * Units with no actionable window are dropped entirely: every consumer gates on
 * `isVisibleForManufacturingRole` (schedule-view-model.ts), which is purely a
 * productionStatus check, so those units cannot render on any of these screens.
 * That includes the "returned" escalation category, which is only reachable
 * after the same visibility gate passes.
 */
export function selectFactoryScheduleView(
  role: "cutter" | "assembler" | "qc",
  schedule: Pick<ManufacturingRoleSchedule, "allItems" | "currentWorkDate">,
): FactoryScheduleView {
  const actionable = ACTIONABLE_STATUS[role];

  const liveUnitIds = new Set<string>();
  for (const item of schedule.allItems) {
    if (item.productionStatus === actionable) liveUnitIds.add(item.unitId);
  }

  const allItems = schedule.allItems.filter((item) => liveUnitIds.has(item.unitId));

  return { currentWorkDate: schedule.currentWorkDate, allItems };
}

/**
 * What the assembler/qc queue screen (`manufacturing-role-queue.tsx`) reads.
 *
 * That screen touches `schedule.buckets` and nothing else — `allItems` is
 * serialized to the tablet on every view and never read, so the entire
 * all-time history is pure waste there. `buckets` already holds only the
 * role's actionable windows (built by buildRoleScheduleOutput), so this is a
 * strictly smaller payload with no filtering decision to get wrong.
 *
 * The cutter queue is a different component (`cutter-queue.tsx`) that works off
 * `allItems`; it uses selectFactoryScheduleView above instead.
 */
export interface RoleQueueView {
  currentWorkDate: string;
  buckets: ManufacturingDayBucket[];
}

export function selectRoleQueueView(
  schedule: Pick<ManufacturingRoleSchedule, "buckets" | "currentWorkDate">,
): RoleQueueView {
  return {
    currentWorkDate: schedule.currentWorkDate,
    buckets: schedule.buckets,
  };
}

/**
 * Serialized size of what actually crosses the RSC → client boundary.
 *
 * `npm run perf-budget` measures first-load JS, not the RSC stream, so this is
 * the only check on the ≤300 KB payload target. `next.config.ts` keeps
 * console.warn in production, so this lands in the Vercel logs.
 */
export function logFactoryPayload(
  role: "cutter" | "assembler" | "qc",
  view: FactoryScheduleView,
  totalItems: number,
): void {
  const bytes = JSON.stringify(view).length;
  console.warn(
    `[perf][factory-payload] role=${role} items=${view.allItems.length}/${totalItems} bytes=${bytes}`,
  );
}
