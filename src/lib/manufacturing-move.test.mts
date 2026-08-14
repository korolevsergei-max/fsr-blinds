import { test } from "node:test";
import assert from "node:assert/strict";

import { planManufacturerMove } from "./manufacturing-move.ts";
import { computeManufacturingLock } from "./manufacturing-lock.ts";

/**
 * The four moves that exist. `planManufacturerMove` is what
 * assignUnitsToManufacturingPartner actually branches on, so these are the real
 * consequences, not a restatement of them.
 */
const IN = true;
const OUT = false;

// ── Rule 2: a station move must never delete a schedule row ─────────────────
//
// This is the "a unit disappears" failure. Queue membership is "has
// window_manufacturing_schedule rows AND the unit's partner is mine". Delete the
// rows on an in-house→in-house move and the unit drops out of every queue with
// no error raised anywhere — nobody builds it, and nothing reports it missing.

test("RULE 2: a relocation never deletes schedule rows", () => {
  const plan = planManufacturerMove(IN, IN);
  assert.equal(plan.kind, "relocation");
  assert.equal(plan.deletesScheduleRows, false);
});

test("RULE 2 holds across the whole truth table: delete only when leaving in-house", () => {
  for (const source of [IN, OUT]) {
    for (const target of [IN, OUT]) {
      const plan = planManufacturerMove(source, target);
      if (plan.kind === "relocation") {
        assert.equal(
          plan.deletesScheduleRows,
          false,
          `relocation (${source}→${target}) must keep its rows`
        );
      }
      // The rows exist to keep a unit visible to the in-house floor. They are
      // dropped exactly when the unit ends up off that floor — never otherwise.
      assert.equal(
        plan.deletesScheduleRows,
        !target,
        `delete should track the DESTINATION only (${source}→${target})`
      );
    }
  }
});

test("deleting rows and clearing pins are mutually exclusive", () => {
  // The action runs these as two independent statements; if a plan ever asked
  // for both, it would clear pins on rows it had just deleted.
  for (const source of [IN, OUT]) {
    for (const target of [IN, OUT]) {
      const plan = planManufacturerMove(source, target);
      assert.ok(
        !(plan.deletesScheduleRows && plan.clearsManualPins),
        `${source}→${target} asked for both delete and pin-clear`
      );
    }
  }
});

// ── The lock binds on transfers, and only on transfers ──────────────────────

test("a relocation does not evaluate the lock — that is what lets part-built work move", () => {
  const plan = planManufacturerMove(IN, IN);
  assert.equal(plan.evaluatesLock, false);
});

test("every boundary crossing still evaluates the lock", () => {
  assert.equal(planManufacturerMove(IN, OUT).evaluatesLock, true); // in-house → vendor
  assert.equal(planManufacturerMove(OUT, IN).evaluatesLock, true); // vendor → in-house
  assert.equal(planManufacturerMove(OUT, OUT).evaluatesLock, true); // vendor → vendor
});

test("only in-house → in-house is a relocation; everything else is a transfer", () => {
  assert.equal(planManufacturerMove(IN, IN).kind, "relocation");
  assert.equal(planManufacturerMove(IN, OUT).kind, "transfer");
  assert.equal(planManufacturerMove(OUT, IN).kind, "transfer");
  assert.equal(planManufacturerMove(OUT, OUT).kind, "transfer");
});

test("manual pins are cleared on a relocation and nowhere else", () => {
  assert.equal(planManufacturerMove(IN, IN).clearsManualPins, true);
  assert.equal(planManufacturerMove(IN, OUT).clearsManualPins, false);
  assert.equal(planManufacturerMove(OUT, IN).clearsManualPins, false);
  assert.equal(planManufacturerMove(OUT, OUT).clearsManualPins, false);
});

// ── Composition with the lock: the case the whole feature exists for ────────

test("a part-built unit can move between stations but not out to a vendor", () => {
  // 3 of 8 blinds cut at Station A. Internally, that locks the unit.
  const partBuilt = {
    isInternal: true,
    productionEnteredAt: "2026-08-01T00:00:00Z",
    allMeasuredAt: "2026-07-30T00:00:00Z",
    startedCount: 3,
    qcApprovedCount: 0,
  };
  assert.equal(computeManufacturingLock(partBuilt), true);

  // → Station B: the plan never consults that lock, so the move is allowed and
  // the three cut blinds travel with it.
  const toStationB = planManufacturerMove(IN, IN);
  assert.equal(toStationB.evaluatesLock, false);
  assert.equal(toStationB.deletesScheduleRows, false);

  // → a vendor: the lock is consulted and the unit is locked, so this needs the
  // owner's typed confirmation. Same unit, same progress, different rule.
  const toVendor = planManufacturerMove(IN, OUT);
  assert.equal(toVendor.evaluatesLock, true);
  assert.equal(computeManufacturingLock(partBuilt) && toVendor.evaluatesLock, true);
});

test("Station B units take the internal lock branch, not the vendor one", () => {
  // The stations regression: before 20260814120000 this input was a partnerId
  // compared to a constant, so Station B read as EXTERNAL and `all_measured_at`
  // alone would have frozen every measured Station B unit.
  const measuredOnly = {
    isInternal: true,
    productionEnteredAt: null,
    allMeasuredAt: "2026-08-01T00:00:00Z",
    startedCount: 0,
    qcApprovedCount: 0,
  };
  assert.equal(computeManufacturingLock(measuredOnly), false);
  assert.equal(computeManufacturingLock({ ...measuredOnly, isInternal: false }), true);
});
