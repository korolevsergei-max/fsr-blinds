import assert from "node:assert/strict";
import test from "node:test";

import {
  computeManufacturingLock,
  countProductionStatuses,
  manufacturingLockReason,
} from "./manufacturing-lock.ts";


function lock(overrides: Partial<Parameters<typeof computeManufacturingLock>[0]> = {}) {
  return computeManufacturingLock({
    isInternal: true,
    productionEnteredAt: null,
    allMeasuredAt: null,
    startedCount: 0,
    qcApprovedCount: 0,
    ...overrides,
  });
}

// ── Full truth table, mirroring public.is_manufacturing_locked ──────────────
// Keep in lockstep with migration 20260810140000;
// scripts/deploy/parity-manufacturing-lock.mjs asserts the two agree on prod.

test("internal: production_entered_at alone locks (cutter pulled it onto the floor)", () => {
  assert.equal(lock({ productionEnteredAt: "2026-08-01T00:00:00Z" }), true);
});

test("internal: any non-pending blind locks, even without production_entered_at", () => {
  assert.equal(lock({ startedCount: 1 }), true);
});

test("internal: measured-but-untouched unit is NOT locked — the scheduler can still route it", () => {
  assert.equal(lock({ allMeasuredAt: "2026-08-01T00:00:00Z" }), false);
});

test("internal: nothing started ⇒ transferable", () => {
  assert.equal(lock(), false);
});

test("external: all_measured_at locks — the vendor can already SEE the unit in their worklist", () => {
  assert.equal(lock({ isInternal: false, allMeasuredAt: "2026-08-01T00:00:00Z" }), true);
});

test("external: a finished (qc_approved) blind locks even if somehow unmeasured", () => {
  assert.equal(lock({ isInternal: false, qcApprovedCount: 1, startedCount: 1 }), true);
});

test("external: internal-style partial progress does NOT lock — only visibility or finished work", () => {
  // startedCount > 0 with no qc_approved is the internal trigger, not the external one.
  assert.equal(lock({ isInternal: false, startedCount: 3 }), false);
  assert.equal(lock({ isInternal: false, productionEnteredAt: "2026-08-01T00:00:00Z" }), false);
});

test("external: unmeasured, nothing finished ⇒ transferable (the unit-9998 case)", () => {
  assert.equal(lock({ isInternal: false }), false);
});

/**
 * The stations regression (20260814120000). This input used to be a partnerId
 * compared against the INTERNAL_PARTNER_ID constant, so a Station B unit — an
 * `is_internal = true` row with a different id — silently took the EXTERNAL
 * branch: `all_measured_at` would lock it the moment it was measured, while the
 * SQL predicate (which reads is_internal from the table) said it was not locked.
 * parity-manufacturing-lock.mjs compares the two across all of prod.
 */
test("a second in-house station takes the internal branch, not the vendor one", () => {
  // Measured but untouched: internal ⇒ still transferable. Getting this wrong
  // freezes every measured Station B unit.
  assert.equal(lock({ isInternal: true, allMeasuredAt: "2026-08-01T00:00:00Z" }), false);
  // Partial progress: internal ⇒ locked against a change of COMPANY.
  assert.equal(lock({ isInternal: true, startedCount: 3 }), true);
});

// ── countProductionStatuses: the or-later roll-up feeding the counts ────────

test("countProductionStatuses: qc_approved counts as started too, pending counts as neither", () => {
  const counts = countProductionStatuses([
    { status: "pending" },
    { status: "cut" },
    { status: "assembled" },
    { status: "qc_approved" },
  ]);
  assert.deepEqual(counts, { startedCount: 3, qcApprovedCount: 1 });
});

// ── manufacturingLockReason: the copy the MR4b picker shows ─────────────────

test("manufacturingLockReason: internal names the in-flight work, external names the partner", () => {
  assert.equal(
    manufacturingLockReason("FSR Internal", true, { startedCount: 6, qcApprovedCount: 2 }),
    "In production — 6 blinds cut or assembled"
  );
  assert.equal(
    manufacturingLockReason("FSR Internal", true, { startedCount: 0, qcApprovedCount: 0 }),
    "In production"
  );
  assert.equal(
    manufacturingLockReason("Progressive Distribution", false, { startedCount: 0, qcApprovedCount: 0 }),
    "With Progressive Distribution"
  );
  assert.equal(
    manufacturingLockReason("Progressive Distribution", false, { startedCount: 4, qcApprovedCount: 4 }),
    "With Progressive Distribution — 4 blinds finished"
  );
});
