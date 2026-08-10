import assert from "node:assert/strict";
import test from "node:test";
import { computeOwnerDashboardCounts } from "./owner-dashboard-counts.ts";
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

// Guards the Phase 4 bug: an open post-install issue must outrank the status-derived
// stage. The SQL get_owner_dashboard_counts CASE must mirror this bucketing — if it
// drifts, this test and the RPC will disagree (as they did before the fix).
test("owner stage counts: an open post-install issue beats the status-derived stage", () => {
  const units = [
    makeUnit({ id: "a", status: "installed", hasOpenPostInstallIssue: true }),
    makeUnit({ id: "b", status: "installed" }),
    makeUnit({ id: "c", status: "manufactured" }),
    makeUnit({ id: "d", status: "bracketed" }),
    makeUnit({ id: "e", status: "measured" }),
    makeUnit({ id: "f", status: "not_started" }),
  ];

  const { stageCounts, totalUnits } = computeOwnerDashboardCounts(
    units,
    TODAY,
    new Set()
  );

  assert.equal(totalUnits, 6);
  assert.equal(stageCounts.post_install_issue, 1);
  assert.equal(stageCounts.installation, 1); // only the installed unit without an issue
  assert.equal(stageCounts.qc, 1);
  assert.equal(stageCounts.bracketing, 1);
  assert.equal(stageCounts.measurement, 1);
  assert.equal(stageCounts.not_started, 1);
  assert.equal(stageCounts.cutting, 0);
  assert.equal(stageCounts.assembling, 0);
});

// Guards the 2026-08-05 bug: the Cut/Assembled buckets were structurally always 0
// because both the TS bucketing and the SQL CASE derived the stage from `units.status`,
// which stays `measured` all the way through manufacturing. The stage now arrives as
// `currentStage` (unit_current_stages view → mapUnit); the SQL
// get_owner_dashboard_counts must bucket by the same value.
test("owner stage counts: cutting/assembling units are counted by their derived stage", () => {
  const units = [
    makeUnit({ id: "a", status: "measured", currentStage: "cutting" }),
    makeUnit({ id: "b", status: "measured", currentStage: "cutting" }),
    makeUnit({ id: "c", status: "measured", currentStage: "assembling" }),
    makeUnit({ id: "d", status: "measured", currentStage: "measurement" }),
  ];

  const { stageCounts } = computeOwnerDashboardCounts(units, TODAY, new Set());

  assert.equal(stageCounts.cutting, 2);
  assert.equal(stageCounts.assembling, 1);
  assert.equal(stageCounts.measurement, 1);
});

test("owner issue counts: missing installation date is flagged; escalations come from the id set", () => {
  const units = [makeUnit({ id: "m", status: "measured", installationDate: null })];

  const { issueCounts } = computeOwnerDashboardCounts(units, TODAY, new Set(["m"]));

  assert.equal(issueCounts.missing, 1);
  assert.equal(issueCounts.escalations, 1);
  assert.equal(issueCounts.past_scheduled, 0);
  assert.equal(issueCounts.at_risk, 0);
});

/**
 * Mirrors the `has_unassigned_manufacturer` flag in
 * 20260810120000_dashboard_unassigned_manufacturer.sql. Three boundaries, and
 * each one is load-bearing:
 *
 *  - windowCount > 0 keeps units with nothing to build out of the bucket. Every
 *    unit in prod predating the routing decision has a NULL timestamp, so
 *    without this clause a freshly imported building buries the real ones.
 *  - installed units are excluded (computeUnitFlags returns early for them);
 *    their manufacturer is history, not a decision anyone still needs to make.
 *  - a stamped timestamp means someone chose, even if they chose in-house.
 */
test("owner issue counts: unassigned manufacturer needs windows and an un-installed unit", () => {
  const units = [
    // Counted: real work, nobody decided.
    makeUnit({ id: "needs-answer", windowCount: 4, manufacturingAssignedAt: null }),
    // Not counted: nothing to build yet.
    makeUnit({ id: "no-windows", windowCount: 0, manufacturingAssignedAt: null }),
    // Not counted: already installed.
    makeUnit({
      id: "done",
      status: "installed",
      windowCount: 4,
      manufacturingAssignedAt: null,
    }),
    // Not counted: someone explicitly chose.
    makeUnit({
      id: "routed",
      windowCount: 4,
      manufacturingAssignedAt: "2026-08-01T00:00:00Z",
    }),
  ];

  const { issueCounts } = computeOwnerDashboardCounts(units, TODAY, new Set());

  assert.equal(issueCounts.unassigned_manufacturer, 1);
});
