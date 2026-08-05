import assert from "node:assert/strict";
import test from "node:test";

import { mapUnit, normalizeScheduleEntries, type UnitRow } from "./dataset-mappers.ts";
import type { ScheduleEntry, Unit } from "./types";

function createUnit(overrides: Partial<Unit> = {}): Unit {
  return {
    id: "unit-1",
    buildingId: "building-1",
    clientId: "client-1",
    clientName: "Client One",
    buildingName: "Building One",
    unitNumber: "101",
    status: "installed",
    assignedInstallerId: null,
    assignedInstallerName: null,
    assignedSchedulerId: null,
    assignedSchedulerName: null,
    measurementDate: "2026-04-10",
    bracketingDate: "2026-04-11",
    installationDate: "2026-04-12",
    earliestBracketingDate: null,
    earliestInstallationDate: null,
    completeByDate: null,
    roomCount: 1,
    windowCount: 1,
    photosUploaded: 3,
    notesCount: 0,
    createdAt: null,
    assignedAt: null,
    ...overrides,
  };
}

function createScheduleEntry(taskType: ScheduleEntry["taskType"]): ScheduleEntry {
  return {
    id: `sch-${taskType}`,
    unitId: "unit-1",
    unitNumber: "101",
    buildingName: "Building One",
    clientName: "Client One",
    ownerUserId: "owner-1",
    ownerName: "Owner One",
    taskType,
    date: "2026-04-12",
    status: "not_started",
  };
}

function createUnitRow(overrides: Partial<UnitRow> = {}): UnitRow {
  return {
    id: "unit-1",
    building_id: "building-1",
    client_id: "client-1",
    client_name: "Client One",
    building_name: "Building One",
    unit_number: "101",
    status: "measured",
    risk_flag: "green",
    assigned_installer_id: null,
    assigned_installer_name: null,
    measurement_date: null,
    bracketing_date: null,
    installation_date: null,
    earliest_bracketing_date: null,
    room_count: 2,
    window_count: 8,
    photos_uploaded: 0,
    notes_count: 0,
    created_at: null,
    ...overrides,
  };
}

test("mapUnit carries the RPC-derived current_stage so cut units aren't read as measured", () => {
  assert.equal(mapUnit(createUnitRow({ current_stage: "cutting" })).currentStage, "cutting");
});

test("mapUnit omits currentStage when the row has none (fallback paths keep the old shape)", () => {
  assert.equal("currentStage" in mapUnit(createUnitRow()), false);
});

test("normalizeScheduleEntries uses the live unit status instead of stale schedule entry status", () => {
  const unit = createUnit();
  const normalized = normalizeScheduleEntries(
    [unit],
    [
      createScheduleEntry("measurement"),
      createScheduleEntry("bracketing"),
      createScheduleEntry("installation"),
    ]
  );

  assert.equal(normalized.length, 3);
  assert.deepEqual(
    normalized.map((entry) => entry.status),
    ["installed", "installed", "installed"]
  );
});
