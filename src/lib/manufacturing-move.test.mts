import { test } from "node:test";
import assert from "node:assert/strict";

import {
  isInitialAssignment,
  needsManufacturerWrite,
  planManufacturerMove,
} from "./manufacturing-move.ts";
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

// ── Routing to Station A: the write must follow the DECISION, not the id ─────
//
// `units.manufacturing_partner_id` is NOT NULL DEFAULT 'mp-internal', and
// 'mp-internal' IS Station A — so every unit already carries Station A's id from
// creation, chosen by nobody. Deciding what to write by comparing ids alone made
// "route this unit to Station A" a no-op that still returned ok: nothing stamped
// `manufacturing_assigned_at`, so the unit entered no queue (the reflow source
// requires it non-NULL) and the picker reverted on the next read. Station B and
// vendors were unaffected, which is exactly why it hid for so long.

const STATION_A = "mp-internal";
const STATION_B = "mp-station-b";
const VENDOR = "mp-a1b2c3d4";

const unrouted = (partnerId: string | null) => ({
  manufacturing_partner_id: partnerId,
  manufacturing_assigned_at: null,
});
const routed = (partnerId: string | null) => ({
  manufacturing_partner_id: partnerId,
  manufacturing_assigned_at: "2026-08-01T00:00:00Z",
});

test("THE BUG: routing a never-routed unit to Station A needs a write", () => {
  // The ids match — and that is precisely the case that must still write, because
  // the matching id is the default, not a decision.
  assert.equal(needsManufacturerWrite(unrouted(STATION_A), STATION_A), true);
});

test("a never-routed unit always needs a write, wherever it is going", () => {
  for (const destination of [STATION_A, STATION_B, VENDOR]) {
    for (const partnerId of [STATION_A, STATION_B, VENDOR, null]) {
      assert.equal(
        needsManufacturerWrite(unrouted(partnerId), destination),
        true,
        `unrouted ${partnerId} → ${destination} must write`
      );
    }
  }
});

test("a routed unit re-saved to the partner it already has stays a no-op", () => {
  // The original reason for the filter, and it must survive: a redundant save
  // must not reset the queue-added date the subcontractor work list orders by.
  assert.equal(needsManufacturerWrite(routed(STATION_A), STATION_A), false);
  assert.equal(needsManufacturerWrite(routed(STATION_B), STATION_B), false);
  assert.equal(needsManufacturerWrite(routed(VENDOR), VENDOR), false);
});

test("a routed unit genuinely changing partner needs a write", () => {
  assert.equal(needsManufacturerWrite(routed(STATION_A), STATION_B), true);
  assert.equal(needsManufacturerWrite(routed(STATION_B), STATION_A), true);
  assert.equal(needsManufacturerWrite(routed(STATION_A), VENDOR), true);
  assert.equal(needsManufacturerWrite(routed(VENDOR), STATION_A), true);
});

test("an absent partner id reads as Station A once a decision exists", () => {
  // The absent-reads-as-default rule from manufacturing-partners.ts, which only
  // applies on the routed side — an unrouted unit writes regardless (above).
  assert.equal(needsManufacturerWrite(routed(null), STATION_A), false);
  assert.equal(needsManufacturerWrite(routed(null), STATION_B), true);
});

test("isInitialAssignment keys off the stamp, never the partner id", () => {
  // If this ever starts reading manufacturing_partner_id, the Station A bug is
  // back: every unit would look like an initial assignment or none would.
  assert.equal(isInitialAssignment(unrouted(STATION_A)), true);
  assert.equal(isInitialAssignment(unrouted(VENDOR)), true);
  assert.equal(isInitialAssignment(routed(STATION_A)), false);
  assert.equal(isInitialAssignment(routed(null)), false);
});
