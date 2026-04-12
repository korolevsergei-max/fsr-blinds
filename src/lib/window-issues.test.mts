import test from "node:test";
import assert from "node:assert/strict";

import { getHighestEscalationRiskFlag, getRoomEscalationRiskFlag } from "./window-issues.ts";

test("getHighestEscalationRiskFlag returns green when all flags are non-escalated", () => {
  assert.equal(getHighestEscalationRiskFlag(["green"]), "green");
  assert.equal(getHighestEscalationRiskFlag(["complete", "green"]), "green");
  assert.equal(getHighestEscalationRiskFlag([]), "green");
});

test("getHighestEscalationRiskFlag returns yellow when yellow exists without red", () => {
  assert.equal(getHighestEscalationRiskFlag(["green", "yellow"]), "yellow");
  assert.equal(getHighestEscalationRiskFlag(["yellow", "complete"]), "yellow");
});

test("getHighestEscalationRiskFlag returns red when any red flag exists", () => {
  assert.equal(getHighestEscalationRiskFlag(["red"]), "red");
  assert.equal(getHighestEscalationRiskFlag(["yellow", "red", "green"]), "red");
});

test("getRoomEscalationRiskFlag uses room window flags with red precedence", () => {
  assert.equal(
    getRoomEscalationRiskFlag([{ riskFlag: "green" }, { riskFlag: "yellow" }]),
    "yellow"
  );
  assert.equal(
    getRoomEscalationRiskFlag([{ riskFlag: "yellow" }, { riskFlag: "red" }]),
    "red"
  );
});
