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

test("getUnitCurrentStage fallback makes post-install issue visible when currentStage is missing", () => {
  assert.equal(
    getUnitCurrentStage({
      status: "installed",
      hasOpenPostInstallIssue: true,
    }),
    "post_install_issue"
  );
});
