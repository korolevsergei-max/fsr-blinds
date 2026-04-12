import test from "node:test";
import assert from "node:assert/strict";

import {
  buildManufacturingRiskNotificationBody,
  buildUnitProgressNotificationBody,
  buildWindowEscalationNotificationBody,
  formatUnitContextLine,
} from "./notification-copy.ts";

const context = {
  clientName: "Acme Client",
  buildingName: "Summerland Terrace",
  unitNumber: "403",
};

test("formatUnitContextLine includes client, building, and unit", () => {
  assert.equal(
    formatUnitContextLine(context),
    "Acme Client • Summerland Terrace • Unit 403"
  );
});

test("buildUnitProgressNotificationBody includes context and status", () => {
  const body = buildUnitProgressNotificationBody(context, "installed");
  assert.match(body, /Acme Client/);
  assert.match(body, /Summerland Terrace/);
  assert.match(body, /Unit 403/);
  assert.match(body, /now installed/);
});

test("buildWindowEscalationNotificationBody includes full escalation context", () => {
  const body = buildWindowEscalationNotificationBody(context, {
    roomName: "Living Room",
    windowLabel: "Window 1",
    riskFlag: "yellow",
  });
  assert.match(body, /Acme Client/);
  assert.match(body, /Summerland Terrace/);
  assert.match(body, /Unit 403/);
  assert.match(body, /Living Room/);
  assert.match(body, /Window 1/);
  assert.match(body, /flagged yellow/);
});

test("buildManufacturingRiskNotificationBody includes context and timing reason", () => {
  const body = buildManufacturingRiskNotificationBody(context, 2);
  assert.match(body, /Acme Client/);
  assert.match(body, /Summerland Terrace/);
  assert.match(body, /Unit 403/);
  assert.match(body, /2 day\(s\)/);
  assert.match(body, /not QC-approved yet/);
});
