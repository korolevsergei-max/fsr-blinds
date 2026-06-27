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

test("owner issue counts: missing installation date is flagged; escalations come from the id set", () => {
  const units = [makeUnit({ id: "m", status: "measured", installationDate: null })];

  const { issueCounts } = computeOwnerDashboardCounts(units, TODAY, new Set(["m"]));

  assert.equal(issueCounts.missing, 1);
  assert.equal(issueCounts.escalations, 1);
  assert.equal(issueCounts.past_scheduled, 0);
  assert.equal(issueCounts.at_risk, 0);
});
