import { test } from "node:test";
import assert from "node:assert/strict";

import {
  INTERNAL_PARTNER_ID,
  internalPartnerIds,
  isInternalPartner,
  isStationWork,
  partnerNameFor,
  sortPartners,
} from "./manufacturing-partners.ts";
import type { ManufacturingPartner } from "./types.ts";

const STATION_B = "mp-station-b";

const stationA: ManufacturingPartner = {
  id: INTERNAL_PARTNER_ID,
  name: "Station A",
  contactName: "",
  contactEmail: "",
  contactPhone: "",
  isInternal: true,
};

const stationB: ManufacturingPartner = {
  ...stationA,
  id: STATION_B,
  name: "Station B",
};

const acme: ManufacturingPartner = {
  id: "mp-acme",
  name: "Acme Blinds",
  contactName: "",
  contactEmail: "",
  contactPhone: "",
  isInternal: false,
};

const all = [stationA, stationB, acme];

/**
 * The exclusivity invariant depends on this default: a unit whose partner is
 * unknown (an RPC path that does not project the column, a pre-migration row)
 * must read as the DEFAULT STATION. Treating it as external instead would
 * silently drop real units out of the in-house queues with nobody building them.
 */
test("a missing partner id means the default station", () => {
  assert.equal(isInternalPartner(null, all), true);
  assert.equal(isInternalPartner(undefined, all), true);
  assert.equal(isInternalPartner(INTERNAL_PARTNER_ID, all), true);
});

/**
 * The regression this whole file exists to catch. Before stations, internality
 * was `id === INTERNAL_PARTNER_ID`; under that rule Station B reads as a
 * subcontractor, which would hide the in-house mark buttons from its own staff
 * and send its units down the vendor lock path.
 */
test("a second internal station is in-house, not a subcontractor", () => {
  assert.equal(isInternalPartner(STATION_B, all), true);
  assert.notEqual(STATION_B, INTERNAL_PARTNER_ID);
});

test("subcontractors and unknown ids are external", () => {
  assert.equal(isInternalPartner("mp-acme", all), false);
  assert.equal(isInternalPartner("mp-gone", all), false);
  assert.equal(isInternalPartner("", all), false);
});

test("internalPartnerIds collects every station and no vendor", () => {
  assert.deepEqual(
    [...internalPartnerIds(all)].sort(),
    [INTERNAL_PARTNER_ID, STATION_B].sort()
  );
});

/**
 * The queue-emptying guard. `manufacturing_assigned_at` is absent from any read
 * path that does not project it — the chunked schedule fallback, an older RPC
 * shape after a rollback. Those must keep reading as ROUTED, or the cutter,
 * assembler and QC screens all go blank the moment one projection is dropped.
 * Only an explicit NULL means nobody has chosen a manufacturer.
 */
test("an absent routing timestamp still counts as the station's work", () => {
  assert.equal(
    isStationWork({ manufacturing_partner_id: INTERNAL_PARTNER_ID }, INTERNAL_PARTNER_ID),
    true
  );
  assert.equal(
    isStationWork(
      { manufacturing_partner_id: INTERNAL_PARTNER_ID, manufacturing_assigned_at: undefined },
      INTERNAL_PARTNER_ID
    ),
    true
  );
  // ...and a unit with no projected columns at all, which is the same case:
  // absent partner falls back to the column default, Station A.
  assert.equal(isStationWork({}, INTERNAL_PARTNER_ID), true);
});

test("an explicit NULL routing timestamp means nobody decided — not our work", () => {
  assert.equal(
    isStationWork(
      { manufacturing_partner_id: INTERNAL_PARTNER_ID, manufacturing_assigned_at: null },
      INTERNAL_PARTNER_ID
    ),
    false
  );
});

test("a routed unit is its own station's work and nobody else's", () => {
  const at = "2026-08-01T00:00:00Z";
  assert.equal(
    isStationWork({ manufacturing_partner_id: STATION_B, manufacturing_assigned_at: at }, STATION_B),
    true
  );
  // The wall: Station A must not match Station B's unit, routed or not.
  assert.equal(
    isStationWork(
      { manufacturing_partner_id: STATION_B, manufacturing_assigned_at: at },
      INTERNAL_PARTNER_ID
    ),
    false
  );
  assert.equal(
    isStationWork({ manufacturing_partner_id: STATION_B }, INTERNAL_PARTNER_ID),
    false
  );
  // Subcontracted is nobody's station work.
  assert.equal(
    isStationWork({ manufacturing_partner_id: "mp-acme", manufacturing_assigned_at: at }, STATION_B),
    false
  );
});

/**
 * No window may be claimed by two stations at once — the double-build invariant,
 * asserted at the level the TS backstop enforces it.
 */
test("no unit is ever the work of two stations", () => {
  const units = [
    {},
    { manufacturing_partner_id: INTERNAL_PARTNER_ID },
    { manufacturing_partner_id: STATION_B, manufacturing_assigned_at: "2026-08-01T00:00:00Z" },
    { manufacturing_partner_id: "mp-acme" },
    { manufacturing_partner_id: INTERNAL_PARTNER_ID, manufacturing_assigned_at: null },
  ];
  for (const unit of units) {
    const claims = [INTERNAL_PARTNER_ID, STATION_B].filter((s) => isStationWork(unit, s));
    assert.ok(claims.length <= 1, `${JSON.stringify(unit)} claimed by ${claims.join(" and ")}`);
  }
});

test("partnerNameFor resolves through the list and falls back to the default station", () => {
  assert.equal(partnerNameFor("mp-acme", all), "Acme Blinds");
  assert.equal(partnerNameFor(null, all), "Station A");
  assert.equal(partnerNameFor(STATION_B, all), "Station B");
  assert.equal(partnerNameFor("mp-gone", all), "mp-gone");
});

test("sortPartners puts stations first by name, then external by name", () => {
  const zeta: ManufacturingPartner = { ...acme, id: "mp-zeta", name: "Zeta" };
  const sorted = sortPartners([zeta, acme, stationB, stationA]);
  assert.deepEqual(sorted.map((p) => p.id), [
    INTERNAL_PARTNER_ID,
    STATION_B,
    "mp-acme",
    "mp-zeta",
  ]);
});

test("sortPartners does not mutate its input", () => {
  const input = [acme, stationA];
  sortPartners(input);
  assert.deepEqual(input.map((p) => p.id), ["mp-acme", INTERNAL_PARTNER_ID]);
});
