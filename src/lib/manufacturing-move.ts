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
