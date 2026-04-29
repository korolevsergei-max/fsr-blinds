import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPrintableLabelItems,
  packPrintableLabelItems,
  parseLabelMode,
} from "./cut-labels.ts";
import type { ManufacturingWindowItem } from "./manufacturing-scheduler.ts";

function createItem(windowId: string): ManufacturingWindowItem {
  return {
    windowId,
    unitId: `unit-${windowId}`,
    buildingId: "building-1",
    clientId: "client-1",
    unitNumber: "101",
    buildingName: "Building One",
    clientName: "Client One",
    installationDate: "2026-05-01",
    completeByDate: "2026-05-01",
    targetReadyDate: "2026-04-28",
    roomName: "Living",
    label: windowId.toUpperCase(),
    blindType: "screen",
    width: 30,
    height: 60,
    depth: null,
    notes: "",
    productionStatus: "pending",
    issueStatus: "none",
    issueReason: "",
    issueNotes: "",
    escalation: null,
    latestEscalation: null,
    escalationHistory: [],
    wasReworkInCycle: false,
    cutAt: null,
    assembledAt: null,
    qcApprovedAt: null,
    manufacturingLabelPrintedAt: null,
    packagingLabelPrintedAt: null,
    scheduledCutDate: "2026-04-23",
    scheduledAssemblyDate: null,
    scheduledQcDate: null,
    isScheduleLocked: false,
    overCapacityOverride: false,
    windowInstallation: "inside",
    wandChain: null,
    fabricAdjustmentSide: "none",
    fabricAdjustmentInches: null,
    chainSide: "left",
  };
}

test("parseLabelMode defaults unknown values to manufacturing", () => {
  assert.equal(parseLabelMode(undefined), "manufacturing");
  assert.equal(parseLabelMode("weird"), "manufacturing");
  assert.equal(parseLabelMode("packaging"), "packaging");
});

test("buildPrintableLabelItems creates one label per item for single modes", () => {
  const labels = buildPrintableLabelItems([createItem("a"), createItem("b")], "packaging");

  assert.deepEqual(
    labels.map((label) => [label.key, label.kind]),
    [
      ["a:packaging", "packaging"],
      ["b:packaging", "packaging"],
    ]
  );
});

test("buildPrintableLabelItems creates manufacturing then packaging for both mode", () => {
  const labels = buildPrintableLabelItems([createItem("a"), createItem("b")], "both");

  assert.deepEqual(
    labels.map((label) => [label.key, label.kind]),
    [
      ["a:manufacturing", "manufacturing"],
      ["a:packaging", "packaging"],
      ["b:manufacturing", "manufacturing"],
      ["b:packaging", "packaging"],
    ]
  );
});

test("packPrintableLabelItems groups labels into pages of three", () => {
  const labels = buildPrintableLabelItems(
    [createItem("a"), createItem("b"), createItem("c"), createItem("d")],
    "manufacturing"
  );

  const pages = packPrintableLabelItems(labels);

  assert.deepEqual(
    pages.map((page) => page.map((label) => label.key)),
    [["a:manufacturing", "b:manufacturing", "c:manufacturing"], ["d:manufacturing"]]
  );
});
