import assert from "node:assert/strict";
import test from "node:test";
import type { AppDataset } from "./app-dataset";
import { canUploadInstallationPhotos } from "./unit-install-guard.ts";
import {
  deriveUnitStatusFromCounts,
  getUnitCoverageFromDataset,
  reconcileUnitDerivedState,
} from "./unit-status-helpers.ts";

/**
 * Minimal fixture focused on unit/room/window aggregation behavior.
 * We keep it small so each test can override only the fields it cares about.
 */
function createDataset(): AppDataset {
  return {
    clients: [],
    buildings: [],
    installers: [],
    schedule: [],
    cutters: [],
    schedulers: [],
    manufacturingEscalations: [],
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
        roomCount: 2,
        windowCount: 2,
        photosUploaded: 2,
        notesCount: 0,
        createdAt: null,
        assignedAt: null,
      },
      {
        id: "unit-2",
        buildingId: "building-1",
        clientId: "client-1",
        clientName: "Client One",
        buildingName: "Building One",
        unitNumber: "102",
        status: "not_started",
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
        windowCount: 1,
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
        windowCount: 1,
        completedWindows: 1,
      },
      {
        id: "room-2",
        unitId: "unit-1",
        name: "Bedroom",
        windowCount: 1,
        completedWindows: 1,
      },
      {
        id: "room-3",
        unitId: "unit-2",
        name: "Office",
        windowCount: 1,
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
        riskFlag: "green",
        width: 30,
        height: 60,
        depth: null,
        windowInstallation: "inside" as const,
        wandChain: null,
        fabricAdjustmentSide: "none" as const,
        fabricAdjustmentInches: null,
        notes: "",
        photoUrl: "https://example.com/measure-1.jpg",
        measured: true,
        bracketed: true,
        installed: true,
      },
      {
        id: "window-2",
        roomId: "room-2",
        label: "South",
        blindType: "screen",
        chainSide: "right",
        riskFlag: "green",
        width: 28,
        height: 58,
        depth: null,
        windowInstallation: "inside" as const,
        wandChain: null,
        fabricAdjustmentSide: "none" as const,
        fabricAdjustmentInches: null,
        notes: "",
        photoUrl: "https://example.com/measure-2.jpg",
        measured: true,
        bracketed: true,
        installed: false,
      },
      {
        id: "window-3",
        roomId: "room-3",
        label: "East",
        blindType: "blackout",
        chainSide: "left",
        riskFlag: "green",
        width: 25,
        height: 55,
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

test("deriveUnitStatusFromCounts returns the expected milestone status", () => {
  assert.equal(
    deriveUnitStatusFromCounts({
      totalWindows: 0,
      measuredCount: 0,
      bracketedCount: 0,
      manufacturedCount: 0,
      installedCount: 0,
    }),
    "not_started"
  );

  assert.equal(
    deriveUnitStatusFromCounts({
      totalWindows: 3,
      measuredCount: 3,
      bracketedCount: 1,
      manufacturedCount: 0,
      installedCount: 0,
    }),
    "measured"
  );

  assert.equal(
    deriveUnitStatusFromCounts({
      totalWindows: 3,
      measuredCount: 1,
      bracketedCount: 3,
      manufacturedCount: 0,
      installedCount: 0,
    }),
    "bracketed"
  );

  assert.equal(
    deriveUnitStatusFromCounts({
      totalWindows: 3,
      measuredCount: 3,
      bracketedCount: 3,
      manufacturedCount: 3,
      installedCount: 0,
    }),
    "manufactured"
  );

  assert.equal(
    deriveUnitStatusFromCounts({
      totalWindows: 3,
      measuredCount: 2,
      bracketedCount: 3,
      manufacturedCount: 3,
      installedCount: 0,
    }),
    "bracketed"
  );

  assert.equal(
    deriveUnitStatusFromCounts({
      totalWindows: 3,
      measuredCount: 3,
      bracketedCount: 3,
      manufacturedCount: 3,
      installedCount: 3,
    }),
    "installed"
  );
});

test("installation upload gate only opens after manufacturing is complete", () => {
  assert.equal(canUploadInstallationPhotos("not_started"), false);
  assert.equal(canUploadInstallationPhotos("measured"), false);
  assert.equal(canUploadInstallationPhotos("bracketed"), false);
  assert.equal(canUploadInstallationPhotos("manufactured"), true);
  assert.equal(canUploadInstallationPhotos("installed"), true);
});

test("getUnitCoverageFromDataset counts only windows that belong to the target unit", () => {
  const dataset = createDataset();
  const coverage = getUnitCoverageFromDataset(dataset, "unit-1");

  assert.deepEqual(coverage, {
    totalWindows: 2,
    measuredCount: 2,
    bracketedCount: 2,
    manufacturedCount: 0,
    installedCount: 1,
    allMeasured: true,
    allBracketed: true,
    allManufactured: false,
    allInstalled: false,
  });
});

test("reconcileUnitDerivedState updates the final install immediately across room and unit aggregates", () => {
  const dataset = createDataset();
  const patched = reconcileUnitDerivedState(
    {
      ...dataset,
      windows: dataset.windows.map((windowItem) =>
        windowItem.id === "window-2"
          ? { ...windowItem, installed: true }
          : windowItem
      ),
    },
    "unit-1",
    {
      unitStatus: "installed",
      photoDelta: 1,
    }
  );

  const unit = patched.units.find((item) => item.id === "unit-1");
  const room = patched.rooms.find((item) => item.id === "room-2");

  assert.ok(unit);
  assert.ok(room);
  assert.equal(unit.status, "installed");
  assert.equal(unit.windowCount, 2);
  assert.equal(unit.roomCount, 2);
  assert.equal(unit.photosUploaded, 3);
  assert.equal(room.windowCount, 1);
  assert.equal(room.completedWindows, 1);
});

test("reconcileUnitDerivedState rolls status back when bracketed media deletion clears bracketed and installed", () => {
  const dataset = createDataset();
  const patched = reconcileUnitDerivedState(
    {
      ...dataset,
      windows: dataset.windows.map((windowItem) =>
        windowItem.id === "window-1"
          ? { ...windowItem, bracketed: false, installed: false }
          : windowItem
      ),
    },
    "unit-1",
    {
      photoDelta: -1,
    }
  );

  const unit = patched.units.find((item) => item.id === "unit-1");
  const room = patched.rooms.find((item) => item.id === "room-1");

  assert.ok(unit);
  assert.ok(room);
  assert.equal(unit.status, "measured");
  assert.equal(unit.photosUploaded, 1);
  assert.equal(room.windowCount, 1);
  assert.equal(room.completedWindows, 1);
});

test("reconcileUnitDerivedState recomputes room counts when windows are deleted", () => {
  const dataset = createDataset();
  const patched = reconcileUnitDerivedState(
    {
      ...dataset,
      windows: dataset.windows.filter((windowItem) => windowItem.id !== "window-2"),
    },
    "unit-1",
    {
      unitStatus: "installed",
      photoDelta: -1,
    }
  );

  const unit = patched.units.find((item) => item.id === "unit-1");
  const room = patched.rooms.find((item) => item.id === "room-2");

  assert.ok(unit);
  assert.ok(room);
  assert.equal(unit.windowCount, 1);
  assert.equal(unit.roomCount, 2);
  assert.equal(unit.photosUploaded, 1);
  assert.equal(room.windowCount, 0);
  assert.equal(room.completedWindows, 0);
});
