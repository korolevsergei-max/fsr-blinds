/**
 * TS mirror of `public.is_manufacturing_locked` (migration 20260810140000).
 * Keep the two in lockstep; scripts/deploy/parity-manufacturing-lock.mjs
 * asserts they agree across the whole prod table.
 *
 * A locked unit's manufacturer can only be changed by the owner with the
 * "Transfer anyway" confirmation — the DB trigger enforces it, the server
 * action pre-checks it for a readable message, and this function is how both
 * the action and the unit-detail loaders compute it without reading the
 * (deliberately unexposed) unit_manufacturing_locks view.
 *
 * NOTE what the lock does NOT cover since stations landed (20260814120000):
 * moving a unit between two IN-HOUSE stations is a relocation, not a transfer —
 * the blinds walk down the hall and every window_production_status row travels
 * untouched — so `units_guard_ownership_columns` skips the lock entirely when
 * both sides are internal. This function still answers "is this unit locked
 * against a change of COMPANY", which is what its callers ask.
 */
export interface ManufacturingLockInput {
  /**
   * Is the unit's CURRENT partner one of our own stations? For a transfer, the
   * pre-move side.
   *
   * ⚠️ A boolean, not a partner id, on purpose. This used to be `partnerId`
   * compared against the INTERNAL_PARTNER_ID constant — which, once a second
   * internal station existed, classified every Station B unit as EXTERNAL and
   * diverged from the SQL predicate (which reads `is_internal` from the table).
   * parity-manufacturing-lock.mjs compares the two across all of prod.
   */
  isInternal: boolean;
  productionEnteredAt: string | null | undefined;
  allMeasuredAt: string | null | undefined;
  /** Windows whose window_production_status is anything but 'pending'. */
  startedCount: number;
  /** Windows at 'qc_approved'. */
  qcApprovedCount: number;
}

export function computeManufacturingLock(input: ManufacturingLockInput): boolean {
  if (input.isInternal) {
    // IN-HOUSE: the cutter pulled it onto the floor, or a blind has moved.
    return input.productionEnteredAt != null || input.startedCount > 0;
  }
  // EXTERNAL: the vendor can see it (all_measured_at is their worklist
  // predicate), or they finished a blind. Partial cut/assembled progress does
  // NOT lock an external unit — only visibility or finished work does.
  return input.allMeasuredAt != null || input.qcApprovedCount > 0;
}

/**
 * Folds a `window_production_status.select("status")` result into the two
 * counts the lock predicate reads. "Started" uses the same or-later roll-up as
 * the SQL: qc_approved windows are also started.
 */
export function countProductionStatuses(
  rows: ReadonlyArray<{ status: string }>
): { startedCount: number; qcApprovedCount: number } {
  let startedCount = 0;
  let qcApprovedCount = 0;
  for (const row of rows) {
    if (row.status !== "pending") startedCount += 1;
    if (row.status === "qc_approved") qcApprovedCount += 1;
  }
  return { startedCount, qcApprovedCount };
}

/**
 * Why this unit's manufacturer control is read-only — the copy the MR4b picker
 * and transfer dialog show beside the lock.
 */
export function manufacturingLockReason(
  partnerName: string,
  isInternal: boolean,
  counts: { startedCount: number; qcApprovedCount: number }
): string {
  if (isInternal) {
    if (counts.startedCount > 0) {
      const blinds = counts.startedCount === 1 ? "blind" : "blinds";
      return `In production — ${counts.startedCount} ${blinds} cut or assembled`;
    }
    return "In production";
  }
  if (counts.qcApprovedCount > 0) {
    const blinds = counts.qcApprovedCount === 1 ? "blind" : "blinds";
    return `With ${partnerName} — ${counts.qcApprovedCount} ${blinds} finished`;
  }
  return `With ${partnerName}`;
}
