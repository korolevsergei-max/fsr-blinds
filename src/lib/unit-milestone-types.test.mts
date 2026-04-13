import assert from "node:assert/strict";
import test from "node:test";
import { deriveManufacturingMilestoneState } from "./unit-milestone-types.ts";

test("deriveManufacturingMilestoneState uses QC approvals when all windows are approved", () => {
  const result = deriveManufacturingMilestoneState({
    totalWindows: 3,
    qcApprovedCount: 3,
    installedCount: 1,
    qcCompletedAt: "2026-04-12T10:00:00.000Z",
    installedCompletedAt: null,
  });

  assert.deepEqual(result, {
    manufacturedCount: 3,
    allManufactured: true,
    manufacturedCompletedAt: "2026-04-12T10:00:00.000Z",
    manufacturedByLegacyInstalledFallback: false,
  });
});

test("deriveManufacturingMilestoneState treats fully installed legacy units as manufactured complete", () => {
  const result = deriveManufacturingMilestoneState({
    totalWindows: 3,
    qcApprovedCount: 0,
    installedCount: 3,
    qcCompletedAt: null,
    installedCompletedAt: "2026-04-12T15:30:00.000Z",
  });

  assert.deepEqual(result, {
    manufacturedCount: 3,
    allManufactured: true,
    manufacturedCompletedAt: "2026-04-12T15:30:00.000Z",
    manufacturedByLegacyInstalledFallback: true,
  });
});

test("deriveManufacturingMilestoneState does not mark partial installs as manufactured complete", () => {
  const result = deriveManufacturingMilestoneState({
    totalWindows: 3,
    qcApprovedCount: 1,
    installedCount: 2,
    qcCompletedAt: null,
    installedCompletedAt: null,
  });

  assert.deepEqual(result, {
    manufacturedCount: 1,
    allManufactured: false,
    manufacturedCompletedAt: null,
    manufacturedByLegacyInstalledFallback: false,
  });
});
