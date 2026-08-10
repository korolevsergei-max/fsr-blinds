import { test } from "node:test";
import assert from "node:assert/strict";

import { INTERNAL_PARTNER_ID, isInternalFactoryWork } from "./manufacturing-partners.ts";

/**
 * MR3 queue-eligibility contract. `isInternalFactoryWork` is the single
 * predicate behind the factory-queue funnel (assembleRoleScheduleItems in
 * manufacturing-scheduler.ts) — every cutter/assembler/QC item passes through
 * it, on both the RPC fast path and the chunked fallback. These four cases ARE
 * the contract; manufacturing-partners.test.mts pins the same function at the
 * unit level, this file pins it as the queue filter.
 *
 * The dangerous case is `undefined`. A projection that forgets to select
 * manufacturing_assigned_at (an RPC rollback to the pre-20260810130000 shape,
 * a trimmed fallback select) delivers `undefined` for EVERY unit — and the
 * naive predicate `if (!unit.manufacturing_assigned_at) continue` would then
 * empty every factory queue facility-wide in one deploy. `undefined` must read
 * as ROUTED so that failure mode is "unrouted units reappear", never a blank
 * floor. Only an explicit NULL means "nobody has decided".
 */

test("undefined routing timestamp ⇒ eligible — a forgotten projection must not empty the queues", () => {
  assert.equal(
    isInternalFactoryWork({ manufacturing_partner_id: INTERNAL_PARTNER_ID }),
    true
  );
  assert.equal(
    isInternalFactoryWork({
      manufacturing_partner_id: INTERNAL_PARTNER_ID,
      manufacturing_assigned_at: undefined,
    }),
    true
  );
});

test("explicit NULL ⇒ not eligible — nobody decided, the unit must not be built in-house", () => {
  assert.equal(
    isInternalFactoryWork({
      manufacturing_partner_id: INTERNAL_PARTNER_ID,
      manufacturing_assigned_at: null,
    }),
    false
  );
});

test("routed in-house ⇒ eligible", () => {
  assert.equal(
    isInternalFactoryWork({
      manufacturing_partner_id: INTERNAL_PARTNER_ID,
      manufacturing_assigned_at: "2026-08-10T00:00:00Z",
    }),
    true
  );
});

test("subcontracted ⇒ never eligible, timestamp or not", () => {
  assert.equal(
    isInternalFactoryWork({
      manufacturing_partner_id: "mp-092d835a",
      manufacturing_assigned_at: "2026-08-10T00:00:00Z",
    }),
    false
  );
  assert.equal(
    isInternalFactoryWork({ manufacturing_partner_id: "mp-092d835a" }),
    false
  );
});
