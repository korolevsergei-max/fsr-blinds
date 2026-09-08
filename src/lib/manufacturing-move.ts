/**
 * What a change of `units.manufacturing_partner_id` implies — the one place the
 * relocation-vs-transfer rules are written down on the TS side.
 *
 * There are two very different moves behind that one column write:
 *
 *  - RELOCATION (in-house → in-house). The blinds walk down the hall. Every
 *    window_production_status row travels untouched, nothing is rebuilt, and the
 *    manufacturing lock — which exists to price a cross-company double build —
 *    does not apply. Only the *plan* (dates, pins) is stale, because it was made
 *    against the old station's day buckets.
 *
 *  - TRANSFER (anything crossing the in-house↔vendor boundary). Keeps every
 *    MR4a/MR4b rule: the lock binds, and the owner needs a typed confirmation
 *    because a part-built unit really does cost ~$100/blind to rebuild.
 *
 * This mirrors `v_relocation` in `units_guard_ownership_columns` (migration
 * 20260814120000 §9). The DB is the real guard; keeping the app's copy in one
 * tested function is what stops the two drifting.
 *
 * ⚠️ RULE 2 (docs/MANUFACTURING_STATIONS.md): `deletesScheduleRows` must NEVER be
 * true for a relocation. Queue membership is "has window_manufacturing_schedule
 * rows AND the unit's partner is mine" — delete the rows on a station move and
 * the unit silently vanishes from every queue with no error anywhere.
 * `manufacturing-move.test.mts` pins that across the whole truth table.
 */
import { INTERNAL_PARTNER_ID } from "./manufacturing-partners.ts";

export type ManufacturerMoveKind = "relocation" | "transfer";

export interface ManufacturerMovePlan {
  kind: ManufacturerMoveKind;
  /**
   * Does the manufacturing lock bind? Only a transfer can be blocked by
   * in-flight work; a relocation carries that work with it.
   */
  evaluatesLock: boolean;
  /**
   * DELETE the unit's `window_manufacturing_schedule` rows? True only when the
   * unit is leaving in-house entirely, where the rows would otherwise keep it
   * visible in a factory queue a vendor is also building.
   */
  deletesScheduleRows: boolean;
  /**
   * Clear `is_schedule_locked` / `lock_reason` / `manual_priority` /
   * `over_capacity_override` — by UPDATE, never DELETE. A date pinned against
   * one station's capacity can jam another's packing.
   */
  clearsManualPins: boolean;
}

export function planManufacturerMove(
  sourceIsInternal: boolean,
  targetIsInternal: boolean
): ManufacturerMovePlan {
  const relocation = sourceIsInternal && targetIsInternal;
  return {
    kind: relocation ? "relocation" : "transfer",
    evaluatesLock: !relocation,
    // Keyed off the DESTINATION alone: rows are dropped when, and only when, the
    // unit ends up outside the in-house floor.
    deletesScheduleRows: !targetIsInternal,
    clearsManualPins: relocation,
  };
}

/**
 * Has anybody actually decided who builds this unit?
 *
 * `manufacturing_assigned_at` is the ONLY answer, because
 * `manufacturing_partner_id` is `NOT NULL DEFAULT 'mp-internal'` — every unit
 * carries Station A's id from the moment it is created, chosen by nobody.
 */
export function isInitialAssignment(unit: {
  manufacturing_assigned_at: string | null;
}): boolean {
  return unit.manufacturing_assigned_at === null;
}

/**
 * Does routing this unit to `partnerId` require a write?
 *
 * A never-routed unit ALWAYS does, even when `manufacturing_partner_id` already
 * equals the destination — which for Station A is EVERY unit, per the column
 * default above. Comparing ids alone made "route this to Station A" a no-op that
 * still returned ok: `manufacturing_assigned_at` was never stamped, so the unit
 * entered no queue (the reflow source requires it non-NULL) and the picker
 * silently reverted on the next read. The stamp IS the routing decision; the
 * partner id is only where it points.
 *
 * The id comparison still holds for a unit that HAS been routed — re-saving it
 * to the partner it already has must stay a no-op, so a redundant save does not
 * reset the queue-added date the subcontractor work list orders by.
 */
export function needsManufacturerWrite(
  unit: {
    manufacturing_partner_id: string | null;
    manufacturing_assigned_at: string | null;
  },
  partnerId: string
): boolean {
  if (isInitialAssignment(unit)) return true;
  return (unit.manufacturing_partner_id ?? INTERNAL_PARTNER_ID) !== partnerId;
}
