import assert from "node:assert/strict";
import test from "node:test";
import { computeUnitFlags } from "./unit-flags.ts";
import type { Unit } from "./types.ts";

function makeUnit(overrides: Partial<Unit>): Unit {
  return {
    id: "u",
    buildingId: "b",
    clientId: "c",
    clientName: "Client",
    buildingName: "Building",
    unitNumber: "1",
    status: "not_started",
    assignedInstallerId: "i1",
    assignedInstallerName: "Installer",
    measurementDate: "2026-06-01",
    bracketingDate: "2026-06-10",
    installationDate: "2026-06-20",
    earliestBracketingDate: null,
    roomCount: 0,
    windowCount: 0,
    photosUploaded: 0,
    notesCount: 0,
    createdAt: null,
    hasOpenPostInstallIssue: false,
    ...overrides,
  } as Unit;
}

const TODAY = "2026-06-27";

/**
 * `missing_manufacturer` is the client-side mirror of the
 * `has_unassigned_manufacturer` flag in
 * 20260810120000_dashboard_unassigned_manufacturer.sql. The two must agree, or
 * the owner dashboard's pre-aggregated count disagrees with its own drill-down.
 *
 * The signal is the TIMESTAMP, never the partner id: `manufacturing_partner_id`
 * defaults to the in-house partner, so the id cannot distinguish a deliberate
 * choice from a unit nobody was ever asked about.
 */
test("missing_manufacturer fires when nobody chose and there is work to build", () => {
  const flags = computeUnitFlags(
    makeUnit({ windowCount: 4, manufacturingAssignedAt: null }),
    TODAY
  );
  assert.ok(flags.includes("missing_manufacturer"));
});

test("missing_manufacturer stays quiet until the unit has windows", () => {
  const flags = computeUnitFlags(
    makeUnit({ windowCount: 0, manufacturingAssignedAt: null }),
    TODAY
  );
  assert.ok(!flags.includes("missing_manufacturer"));
});

test("missing_manufacturer stays quiet once someone has chosen", () => {
  // Even choosing the in-house factory counts as a decision.
  const flags = computeUnitFlags(
    makeUnit({ windowCount: 4, manufacturingAssignedAt: "2026-08-01T00:00:00Z" }),
    TODAY
  );
  assert.ok(!flags.includes("missing_manufacturer"));
});

test("installed units carry no flags at all, manufacturer included", () => {
  const flags = computeUnitFlags(
    makeUnit({
      status: "installed",
      windowCount: 4,
      manufacturingAssignedAt: null,
      assignedInstallerId: null,
    }),
    TODAY
  );
  assert.deepEqual(flags, []);
});
