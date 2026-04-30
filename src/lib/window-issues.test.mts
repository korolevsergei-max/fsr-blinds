import test from "node:test";
import assert from "node:assert/strict";

import type { AppDataset } from "./app-dataset";
import {
  getOpenPostInstallIssueTargets,
  getHighestEscalationRiskFlag,
  getRoomEscalationRiskFlag,
  getUnitEscalations,
} from "./window-issues.ts";

function createDataset(): AppDataset {
  return {
    clients: [],
    buildings: [],
    installers: [],
    schedule: [],
    cutters: [],
    schedulers: [],
    postInstallIssues: [],
    manufacturingEscalations: [
      {
        id: "esc-1",
        windowId: "window-2",
        unitId: "unit-1",
        sourceRole: "assembler",
        targetRole: "cutter",
        escalationType: "pushback",
        status: "open",
        reason: "Fabric defect",
        notes: "Left panel needs to be recut.",
        openedByUserId: "user-1",
        openedAt: "2026-04-12T10:00:00.000Z",
        resolvedByUserId: null,
        resolvedAt: null,
        createdAt: "2026-04-12T10:00:00.000Z",
      },
    ],
    units: [
      {
        id: "unit-1",
        buildingId: "building-1",
        clientId: "client-1",
        clientName: "Client One",
        buildingName: "Building One",
        unitNumber: "101",
        status: "bracketed",
        assignedInstallerId: null,
        assignedInstallerName: null,
        assignedSchedulerId: null,
        assignedSchedulerName: null,
        measurementDate: null,
        bracketingDate: null,
        installationDate: null,
        earliestBracketingDate: null,
        earliestInstallationDate: null,
        completeByDate: null,
        roomCount: 1,
        windowCount: 2,
        photosUploaded: 0,
        notesCount: 0,
        createdAt: null,
        assignedAt: null,
      },
    ],
    rooms: [
      {
        id: "room-1",
        unitId: "unit-1",
        name: "Living",
        windowCount: 2,
        completedWindows: 0,
      },
    ],
    windows: [
      {
        id: "window-1",
        roomId: "room-1",
        label: "North",
        blindType: "screen",
        chainSide: "left",
        riskFlag: "yellow",
        width: null,
        height: null,
        depth: null,
        windowInstallation: "inside" as const,
        wandChain: null,
        fabricAdjustmentSide: "none" as const,
        fabricAdjustmentInches: null,
        notes: "Bracket misalignment.",
        photoUrl: null,
        measured: false,
        bracketed: false,
        installed: false,
      },
      {
        id: "window-2",
        roomId: "room-1",
        label: "South",
        blindType: "screen",
        chainSide: "right",
        riskFlag: "green",
        width: null,
        height: null,
        depth: null,
        windowInstallation: "inside" as const,
        wandChain: null,
        fabricAdjustmentSide: "none" as const,
        fabricAdjustmentInches: null,
        notes: "",
        photoUrl: null,
        measured: false,
        bracketed: false,
        installed: false,
      },
    ],
  };
}

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

test("getUnitEscalations includes open manufacturing pushbacks alongside field escalations", () => {
  const escalations = getUnitEscalations(createDataset(), "unit-1");

  assert.equal(escalations.length, 2);
  assert.equal(escalations[0]?.issueType, "manufacturing_pushback");
  assert.equal(escalations[0]?.sourceRole, "assembler");
  assert.equal(escalations[0]?.targetRole, "cutter");
  assert.equal(escalations[0]?.reason, "Fabric defect");
  assert.equal(escalations[0]?.note, "Left panel needs to be recut.");
  assert.equal(escalations[1]?.issueType, "manufacturing");
  assert.equal(escalations[1]?.note, "Bracket misalignment.");
});

test("getOpenPostInstallIssueTargets returns sorted room and window labels for open issues only", () => {
  const data = createDataset();
  data.rooms.push({
    id: "room-2",
    unitId: "unit-1",
    name: "Bedroom",
    windowCount: 1,
    completedWindows: 0,
  });
  data.windows.push({
    id: "window-3",
    roomId: "room-2",
    label: "Window 3",
    blindType: "screen",
    chainSide: "left",
    riskFlag: "green",
    width: null,
    height: null,
    depth: null,
    windowInstallation: "inside" as const,
    wandChain: null,
    fabricAdjustmentSide: "none" as const,
    fabricAdjustmentInches: null,
    notes: "",
    photoUrl: null,
    measured: false,
    bracketed: false,
    installed: true,
  });
  data.postInstallIssues = [
    {
      id: "issue-resolved",
      windowId: "window-1",
      unitId: "unit-1",
      openedByUserId: "user-1",
      openedByRole: "scheduler",
      openedByName: "Scheduler One",
      openedAt: "2026-04-14T10:00:00.000Z",
      resolvedByUserId: "user-2",
      resolvedByName: "Owner One",
      resolvedAt: "2026-04-15T10:00:00.000Z",
      status: "resolved",
      createdAt: "2026-04-14T10:00:00.000Z",
      notes: [],
    },
    {
      id: "issue-bedroom",
      windowId: "window-3",
      unitId: "unit-1",
      openedByUserId: "user-1",
      openedByRole: "scheduler",
      openedByName: "Scheduler One",
      openedAt: "2026-04-16T10:00:00.000Z",
      resolvedByUserId: null,
      resolvedByName: null,
      resolvedAt: null,
      status: "open",
      createdAt: "2026-04-16T10:00:00.000Z",
      notes: [],
    },
    {
      id: "issue-living",
      windowId: "window-2",
      unitId: "unit-1",
      openedByUserId: "user-1",
      openedByRole: "owner",
      openedByName: "Owner One",
      openedAt: "2026-04-13T10:00:00.000Z",
      resolvedByUserId: null,
      resolvedByName: null,
      resolvedAt: null,
      status: "open",
      createdAt: "2026-04-13T10:00:00.000Z",
      notes: [],
    },
  ];

  const targets = getOpenPostInstallIssueTargets(data, "unit-1");

  assert.deepEqual(
    targets.map((target) => `${target.roomName} - ${target.windowLabel}`),
    ["Bedroom - Window 3", "Living - South"]
  );
  assert.deepEqual(
    targets.map((target) => target.issueId),
    ["issue-bedroom", "issue-living"]
  );
});
