import { test } from "node:test";
import assert from "node:assert/strict";

import { INTERNAL_PARTNER_ID, isStationWork } from "./manufacturing-partners.ts";

const STATION_B = "mp-station-b";

/**
 * MR3 queue-eligibility contract, now station-scoped (20260814120000).
 * `isStationWork` is the single predicate behind the factory-queue funnel
 * (assembleRoleScheduleItems in manufacturing-scheduler.ts) — every
 * cutter/assembler/QC item passes through it, on both the RPC fast path and the
 * chunked fallback. These cases ARE the contract; manufacturing-partners.test.mts
 * pins the same function at the unit level, this file pins it as the queue filter.
 *
 * The dangerous case is `undefined`. A projection that forgets to select
 * manufacturing_assigned_at (an RPC rollback to the pre-20260810130000 shape,
 * a trimmed fallback select) delivers `undefined` for EVERY unit — and the
 * naive predicate `if (!unit.manufacturing_assigned_at) continue` would then
 * empty every factory queue in one deploy. `undefined` must read as ROUTED so
 * that failure mode is "unrouted units reappear", never a blank floor. Only an
 * explicit NULL means "nobody has decided".
 */

test("undefined routing timestamp ⇒ eligible — a forgotten projection must not empty the queues", () => {
  assert.equal(
    isStationWork({ manufacturing_partner_id: INTERNAL_PARTNER_ID }, INTERNAL_PARTNER_ID),
    true
  );
  assert.equal(
    isStationWork(
      {
        manufacturing_partner_id: INTERNAL_PARTNER_ID,
        manufacturing_assigned_at: undefined,
      },
      INTERNAL_PARTNER_ID
    ),
    true
  );
});

test("explicit NULL ⇒ not eligible — nobody decided, the unit must not be built in-house", () => {
  assert.equal(
    isStationWork(
      {
        manufacturing_partner_id: INTERNAL_PARTNER_ID,
        manufacturing_assigned_at: null,
      },
      INTERNAL_PARTNER_ID
    ),
    false
  );
});

test("routed to this station ⇒ eligible", () => {
  assert.equal(
    isStationWork(
      {
        manufacturing_partner_id: INTERNAL_PARTNER_ID,
        manufacturing_assigned_at: "2026-08-10T00:00:00Z",
      },
      INTERNAL_PARTNER_ID
    ),
    true
  );
  assert.equal(
    isStationWork(
      {
        manufacturing_partner_id: STATION_B,
        manufacturing_assigned_at: "2026-08-10T00:00:00Z",
      },
      STATION_B
    ),
    true
  );
});

/**
 * The station wall, at the queue-filter level. The other station's unit is not
 * eligible here even though it is perfectly good in-house work — that is the
 * whole point, and the `undefined` variant matters because it is the case the
 * routing filter alone would wave through.
 */
test("another station's unit ⇒ never eligible here, timestamp or not", () => {
  assert.equal(
    isStationWork(
      {
        manufacturing_partner_id: STATION_B,
        manufacturing_assigned_at: "2026-08-10T00:00:00Z",
      },
      INTERNAL_PARTNER_ID
    ),
    false
  );
  assert.equal(
    isStationWork({ manufacturing_partner_id: STATION_B }, INTERNAL_PARTNER_ID),
    false
  );
});

test("subcontracted ⇒ never eligible at any station, timestamp or not", () => {
  for (const station of [INTERNAL_PARTNER_ID, STATION_B]) {
    assert.equal(
      isStationWork(
        {
          manufacturing_partner_id: "mp-092d835a",
          manufacturing_assigned_at: "2026-08-10T00:00:00Z",
        },
        station
      ),
      false
    );
    assert.equal(
      isStationWork({ manufacturing_partner_id: "mp-092d835a" }, station),
      false
    );
  }
});
