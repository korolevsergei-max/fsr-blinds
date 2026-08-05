import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveCurrentStageFromCounts,
  getUnitCurrentStage,
} from "./current-stage.ts";

test("deriveCurrentStageFromCounts keeps installed units in installation when there is no open post-install issue", () => {
  assert.equal(
    deriveCurrentStageFromCounts({
      totalWindows: 2,
      measuredCount: 2,
      bracketedCount: 2,
      cutCount: 2,
      assembledCount: 2,
      qcCount: 2,
      installedCount: 2,
      hasOpenPostInstallIssue: false,
    }),
    "installation"
  );
});

test("deriveCurrentStageFromCounts moves open post-install issues into the final issue stage", () => {
  assert.equal(
    deriveCurrentStageFromCounts({
      totalWindows: 2,
      measuredCount: 2,
      bracketedCount: 2,
      cutCount: 2,
      assembledCount: 2,
      qcCount: 2,
      installedCount: 2,
      hasOpenPostInstallIssue: true,
    }),
    "post_install_issue"
  );
});

test("deriveCurrentStageFromCounts returns the normal stage after a post-install issue is resolved", () => {
  assert.equal(
    deriveCurrentStageFromCounts({
      totalWindows: 2,
      measuredCount: 2,
      bracketedCount: 2,
      cutCount: 2,
      assembledCount: 2,
      qcCount: 2,
      installedCount: 2,
    }),
    "installation"
  );
});

// The dashboard bug (2026-08-05): units whose windows were cut/assembled were counted
// as Measured because the global paths had no currentStage and `units.status` has no
// cutting/assembling member. These pin the derivation the `unit_current_stages` view
// mirrors — a unit in the cutter/assembly queue must never read as measurement.
test("deriveCurrentStageFromCounts reports cutting once any window is cut", () => {
  assert.equal(
    deriveCurrentStageFromCounts({
      totalWindows: 8,
      measuredCount: 8,
      bracketedCount: 0,
      cutCount: 8,
      assembledCount: 0,
      qcCount: 0,
      installedCount: 0,
    }),
    "cutting"
  );
});

test("deriveCurrentStageFromCounts reports assembling once any window is assembled", () => {
  assert.equal(
    deriveCurrentStageFromCounts({
      totalWindows: 7,
      measuredCount: 7,
      bracketedCount: 0,
      // 4 qc_approved windows roll up into cut + assembled, 3 are only cut
      cutCount: 7,
      assembledCount: 4,
      qcCount: 4,
      installedCount: 0,
    }),
    "assembling"
  );
});

test("getUnitCurrentStage prefers the derived stage over the status mapping", () => {
  assert.equal(
    getUnitCurrentStage({ currentStage: "cutting", status: "measured" }),
    "cutting"
  );
});

test("getUnitCurrentStage fallback makes post-install issue visible when currentStage is missing", () => {
  assert.equal(
    getUnitCurrentStage({
      status: "installed",
      hasOpenPostInstallIssue: true,
    }),
    "post_install_issue"
  );
});
