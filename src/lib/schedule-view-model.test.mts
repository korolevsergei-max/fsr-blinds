import assert from "node:assert/strict";
import test from "node:test";
import { buildManufacturingDashboardState } from "./schedule-view-model.ts";
import type { ManufacturingRoleSchedule, ManufacturingWindowItem } from "./manufacturing-scheduler.ts";

const CURRENT_WORK_DATE = "2026-04-29";

function makeWindow(overrides: Partial<ManufacturingWindowItem> = {}): ManufacturingWindowItem {
  return {
    windowId: overrides.windowId ?? `win-${Math.random().toString(36).slice(2)}`,
    unitId: overrides.unitId ?? "unit-1",
    buildingId: overrides.buildingId ?? "bldg-1",
    clientId: overrides.clientId ?? "client-1",
    unitNumber: overrides.unitNumber ?? "101",
    buildingName: overrides.buildingName ?? "Building",
    clientName: overrides.clientName ?? "Client",
    installationDate: overrides.installationDate ?? null,
    completeByDate: overrides.completeByDate ?? null,
    targetReadyDate: overrides.targetReadyDate ?? null,
    roomName: overrides.roomName ?? "Living Room",
    label: overrides.label ?? "Window 1",
    blindType: overrides.blindType ?? "screen",
    width: overrides.width ?? 40,
    height: overrides.height ?? 80,
    depth: overrides.depth ?? null,
    notes: overrides.notes ?? "",
    productionStatus: overrides.productionStatus ?? "pending",
    issueStatus: overrides.issueStatus ?? "none",
    issueReason: overrides.issueReason ?? "",
    issueNotes: overrides.issueNotes ?? "",
    escalation: overrides.escalation ?? null,
    latestEscalation: overrides.latestEscalation ?? null,
    escalationHistory: overrides.escalationHistory ?? [],
    wasReworkInCycle: overrides.wasReworkInCycle ?? false,
    cutAt: overrides.cutAt ?? null,
    assembledAt: overrides.assembledAt ?? null,
    qcApprovedAt: overrides.qcApprovedAt ?? null,
    manufacturingLabelPrintedAt: overrides.manufacturingLabelPrintedAt ?? null,
    packagingLabelPrintedAt: overrides.packagingLabelPrintedAt ?? null,
    scheduledCutDate: overrides.scheduledCutDate ?? null,
    scheduledAssemblyDate: overrides.scheduledAssemblyDate ?? null,
    scheduledQcDate: overrides.scheduledQcDate ?? null,
    isScheduleLocked: overrides.isScheduleLocked ?? false,
    overCapacityOverride: overrides.overCapacityOverride ?? false,
    windowInstallation: overrides.windowInstallation ?? "inside",
    wandChain: overrides.wandChain ?? null,
    fabricAdjustmentSide: overrides.fabricAdjustmentSide ?? "none",
    fabricAdjustmentInches: overrides.fabricAdjustmentInches ?? null,
    chainSide: overrides.chainSide ?? null,
  };
}

function makeSchedule(items: ManufacturingWindowItem[]): ManufacturingRoleSchedule {
  return {
    settings: {
      id: "default",
      cutterDailyCapacity: 30,
      assemblerDailyCapacity: 30,
      qcDailyCapacity: 30,
      applyOntarioHolidays: false,
    },
    currentWorkDate: CURRENT_WORK_DATE,
    todayCount: 0,
    tomorrowCount: 0,
    upcomingCount: 0,
    issueCount: 0,
    overdueCount: 0,
    unscheduledCount: 0,
    allItems: items,
    buckets: [],
  };
}

test("complete-by-only pending cutter work appears in at-risk dashboard lane", () => {
  const state = buildManufacturingDashboardState({
    schedule: makeSchedule([
      makeWindow({
        productionStatus: "pending",
        installationDate: null,
        completeByDate: "2026-04-30",
        scheduledCutDate: "2026-05-07",
      }),
    ]),
    role: "cutter",
    today: new Date(`${CURRENT_WORK_DATE}T00:00:00`),
    clientFilter: [],
    buildingFilter: [],
    installDateFilter: "all",
  });

  assert.equal(state.counts.at_risk, 1);
  assert.equal(state.unitsByCategory.at_risk[0]?.unitNumber, "101");
});

test("complete-by-only cut work appears in assembler dashboard lane", () => {
  const state = buildManufacturingDashboardState({
    schedule: makeSchedule([
      makeWindow({
        productionStatus: "cut",
        installationDate: null,
        completeByDate: "2026-04-30",
        scheduledAssemblyDate: "2026-04-30",
      }),
    ]),
    role: "assembler",
    today: new Date(`${CURRENT_WORK_DATE}T00:00:00`),
    clientFilter: [],
    buildingFilter: [],
    installDateFilter: "all",
  });

  assert.equal(state.counts.at_risk, 1);
});

test("earliest future scheduled role work is visible as today", () => {
  const state = buildManufacturingDashboardState({
    schedule: makeSchedule([
      makeWindow({
        productionStatus: "pending",
        scheduledCutDate: "2026-05-06",
      }),
    ]),
    role: "cutter",
    today: new Date(`${CURRENT_WORK_DATE}T00:00:00`),
    clientFilter: [],
    buildingFilter: [],
    installDateFilter: "all",
  });

  assert.equal(state.counts.today, 1);
});

test("role-visible work with no dates lands in unscheduled dashboard lane", () => {
  const state = buildManufacturingDashboardState({
    schedule: makeSchedule([
      makeWindow({
        productionStatus: "pending",
        installationDate: null,
        completeByDate: null,
        scheduledCutDate: null,
      }),
    ]),
    role: "cutter",
    today: new Date(`${CURRENT_WORK_DATE}T00:00:00`),
    clientFilter: [],
    buildingFilter: [],
    installDateFilter: "all",
  });

  assert.equal(state.counts.unscheduled, 1);
});
