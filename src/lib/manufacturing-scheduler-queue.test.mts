import assert from "node:assert/strict";
import test from "node:test";

import { buildRoleScheduleOutput } from "./manufacturing-queue-core.ts";
import type { ManufacturingWindowItem } from "./manufacturing-queue-core.ts";
import type { ManufacturingCalendarOverride, ManufacturingSettings } from "./types.ts";

const TODAY = "2026-05-26";

const BASE_SETTINGS: ManufacturingSettings = {
  id: "default",
  cutterDailyCapacity: 30,
  assemblerDailyCapacity: 30,
  qcDailyCapacity: 30,
  applyOntarioHolidays: false,
};

const NO_OVERRIDES = new Map<string, ManufacturingCalendarOverride>();

let windowSeq = 0;
function makeWindow(overrides: Partial<ManufacturingWindowItem> = {}): ManufacturingWindowItem {
  const id = `win-${++windowSeq}`;
  return {
    windowId: id,
    unitId: "unit-1",
    buildingId: "bldg-1",
    clientId: "client-1",
    unitNumber: "316",
    buildingName: "Building",
    clientName: "Client",
    installationDate: null,
    completeByDate: null,
    targetReadyDate: null,
    roomName: "Living Room",
    label: `Window ${windowSeq}`,
    blindType: "screen",
    width: 40,
    height: 80,
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
    cutListPrintedAt: null,
    allMeasuredAt: null,
    productionEnteredAt: null,
    scheduledCutDate: TODAY,
    scheduledAssemblyDate: null,
    scheduledQcDate: null,
    isScheduleLocked: false,
    overCapacityOverride: false,
    windowInstallation: "inside",
    wandChain: null,
    fabricAdjustmentSide: "none",
    fabricAdjustmentInches: null,
    chainSide: null,
    ...overrides,
  };
}

test("all windows for a unit appear in output when spread across multiple cut dates", () => {
  const cutDates = [
    "2026-05-26",
    "2026-05-27",
    "2026-05-28",
    "2026-05-29",
    "2026-05-30",
  ];
  const items = cutDates.map((date) => makeWindow({ scheduledCutDate: date }));

  const result = buildRoleScheduleOutput("cutter", items, items, TODAY, BASE_SETTINGS, NO_OVERRIDES);

  const allWindowIds = result.buckets.flatMap((bucket) =>
    bucket.units.flatMap((unit) =>
      unit.blindTypeGroups.flatMap((group) => group.windows.map((w) => w.windowId)),
    ),
  );

  assert.equal(allWindowIds.length, 5, "all 5 windows must appear across buckets");
  assert.equal(result.allItems.length, 5, "allItems must contain all 5 windows");
});

test("windows for a unit all appear in allItems regardless of production status filter", () => {
  const pending = makeWindow({ productionStatus: "pending", scheduledCutDate: TODAY });
  const cut = makeWindow({ productionStatus: "cut", scheduledCutDate: TODAY });
  const assembled = makeWindow({ productionStatus: "assembled", scheduledCutDate: TODAY });

  const allItems = [pending, cut, assembled];
  const cutterItems = allItems.filter((w) => w.productionStatus === "pending");

  const result = buildRoleScheduleOutput("cutter", cutterItems, allItems, TODAY, BASE_SETTINGS, NO_OVERRIDES);

  assert.equal(result.allItems.length, 3, "allItems includes all windows regardless of status");
  const visibleWindowIds = result.buckets.flatMap((bucket) =>
    bucket.units.flatMap((unit) =>
      unit.blindTypeGroups.flatMap((group) => group.windows.map((w) => w.windowId)),
    ),
  );
  assert.equal(visibleWindowIds.length, 1, "cutter queue shows only pending windows");
  assert.equal(visibleWindowIds[0], pending.windowId);
});

test("unit with 5 windows on 5 dates produces correct scheduledCount per bucket", () => {
  const cutDates = [
    "2026-05-26",
    "2026-05-27",
    "2026-05-28",
    "2026-05-29",
    "2026-05-30",
  ];
  const items = cutDates.map((date) => makeWindow({ scheduledCutDate: date }));

  const result = buildRoleScheduleOutput("cutter", items, items, TODAY, BASE_SETTINGS, NO_OVERRIDES);

  const dateBuckets = result.buckets.filter((b) => b.date !== null);
  const totalScheduled = dateBuckets.reduce((sum, b) => sum + b.scheduledCount, 0);

  assert.equal(totalScheduled, 5);
  assert.equal(result.todayCount, 1);
  assert.equal(result.tomorrowCount, 1);
  assert.equal(result.upcomingCount, 3);
});
