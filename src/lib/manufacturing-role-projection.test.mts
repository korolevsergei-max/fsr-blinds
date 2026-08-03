import assert from "node:assert/strict";
import test from "node:test";
import { selectFactoryScheduleView } from "./manufacturing-role-projection.ts";
import { buildManufacturingDashboardState } from "./schedule-view-model.ts";
import type { ManufacturingWindowItem } from "./manufacturing-scheduler.ts";

const CURRENT_WORK_DATE = "2026-04-29";
const TODAY = new Date(`${CURRENT_WORK_DATE}T12:00:00Z`);

function makeWindow(overrides: Partial<ManufacturingWindowItem> = {}): ManufacturingWindowItem {
  return {
    windowId: `win-${Math.random().toString(36).slice(2)}`,
    unitId: "unit-1",
    buildingId: "bldg-1",
    clientId: "client-1",
    unitNumber: "101",
    buildingName: "Building",
    clientName: "Client",
    installationDate: null,
    completeByDate: null,
    targetReadyDate: null,
    roomName: "Living Room",
    label: "Window 1",
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
    scheduledCutDate: null,
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

/**
 * Fixture covering every unit shape the cutter screens can encounter, so the
 * parity assertions below exercise each branch of the projection predicate.
 */
function fixture(): ManufacturingWindowItem[] {
  return [
    // A: all pending — must survive whole.
    makeWindow({ windowId: "w-a1", unitId: "unit-a", unitNumber: "201", installationDate: "2026-05-01" }),
    makeWindow({ windowId: "w-a2", unitId: "unit-a", unitNumber: "201", installationDate: "2026-05-01" }),

    // B: partly cut + in production — must survive WHOLE, including the cut
    // window, or unitsWithStartedCutting stops firing and the queue regresses.
    makeWindow({
      windowId: "w-b1", unitId: "unit-b", unitNumber: "202",
      productionStatus: "cut", cutAt: "2026-04-28T10:00:00Z",
      productionEnteredAt: "2026-04-28T09:00:00Z",
    }),
    makeWindow({
      windowId: "w-b2", unitId: "unit-b", unitNumber: "202",
      productionEnteredAt: "2026-04-28T09:00:00Z",
    }),

    // C: fully cut — nothing for the cutter to do; dropped.
    makeWindow({ windowId: "w-c1", unitId: "unit-c", unitNumber: "203", productionStatus: "cut" }),

    // D: fully qc-approved (all-time history) — dropped.
    makeWindow({ windowId: "w-d1", unitId: "unit-d", unitNumber: "204", productionStatus: "qc_approved" }),

    // E: open escalation targeting the cutter, still pending — kept.
    makeWindow({
      windowId: "w-e1", unitId: "unit-e", unitNumber: "205",
      issueStatus: "open", wasReworkInCycle: true,
      escalation: {
        id: "esc-1", windowId: "w-e1", unitId: "unit-e",
        targetRole: "cutter", status: "open", reason: "wrong_size",
        notes: "", openedAt: "2026-04-28T08:00:00Z", openedByUserId: null,
        resolvedAt: null, resolvedByUserId: null,
      } as ManufacturingWindowItem["escalation"],
    }),

    // F: no dates at all — the "unscheduled" dashboard branch.
    makeWindow({ windowId: "w-f1", unitId: "unit-f", unitNumber: "206" }),

    // G: overdue.
    makeWindow({ windowId: "w-g1", unitId: "unit-g", unitNumber: "207", installationDate: "2026-04-20" }),
  ];
}

const dashboardArgs = {
  role: "cutter" as const,
  today: TODAY,
  clientFilter: [] as string[],
  buildingFilter: [] as string[],
  installDateFilter: "all" as const,
};

test("projection keeps every unit with cuttable work, whole", () => {
  const all = fixture();
  const view = selectFactoryScheduleView("cutter", {
    allItems: all,
    currentWorkDate: CURRENT_WORK_DATE,
  });

  const kept = new Set(view.allItems.map((i) => i.unitId));
  assert.deepEqual([...kept].sort(), ["unit-a", "unit-b", "unit-e", "unit-f", "unit-g"]);

  // unit-b survives WHOLE — the already-cut window is retained.
  const b = view.allItems.filter((i) => i.unitId === "unit-b").map((i) => i.windowId).sort();
  assert.deepEqual(b, ["w-b1", "w-b2"]);

  // Units with no pending window are gone.
  assert.equal(view.allItems.some((i) => i.unitId === "unit-c"), false);
  assert.equal(view.allItems.some((i) => i.unitId === "unit-d"), false);
});

test("dashboard state is byte-identical on full vs projected input", () => {
  const all = fixture();
  const view = selectFactoryScheduleView("cutter", {
    allItems: all,
    currentWorkDate: CURRENT_WORK_DATE,
  });

  const fromFull = buildManufacturingDashboardState({
    schedule: { allItems: all, currentWorkDate: CURRENT_WORK_DATE },
    ...dashboardArgs,
  });
  const fromProjected = buildManufacturingDashboardState({
    schedule: view,
    ...dashboardArgs,
  });

  assert.deepStrictEqual(fromProjected, fromFull);
});

test("unitsWithStartedCutting is preserved by the projection", () => {
  // Mirrors cutter-queue.tsx:240-246 — the invariant the row filter must not break.
  const startedCutting = (items: ManufacturingWindowItem[]) => {
    const ids = new Set<string>();
    for (const item of items) if (item.productionStatus !== "pending") ids.add(item.unitId);
    return ids;
  };

  const all = fixture();
  const view = selectFactoryScheduleView("cutter", {
    allItems: all,
    currentWorkDate: CURRENT_WORK_DATE,
  });

  const fromFull = startedCutting(all);
  const fromProjected = startedCutting(view.allItems);

  // unit-b must still be flagged as started so the queue keeps hiding it.
  assert.equal(fromProjected.has("unit-b"), true);

  // Units the projection dropped were never renderable, so losing them from the
  // set changes nothing: no dropped unit survives into the projected item list.
  for (const unitId of fromFull) {
    if (!fromProjected.has(unitId)) {
      assert.equal(view.allItems.some((i) => i.unitId === unitId), false);
    }
  }
});

test("assembler and qc project on their own actionable status", () => {
  const items = [
    makeWindow({ windowId: "w-1", unitId: "u-1", productionStatus: "pending" }),
    makeWindow({ windowId: "w-2", unitId: "u-2", productionStatus: "cut" }),
    makeWindow({ windowId: "w-3", unitId: "u-3", productionStatus: "assembled" }),
  ];
  const schedule = { allItems: items, currentWorkDate: CURRENT_WORK_DATE };

  assert.deepEqual(
    selectFactoryScheduleView("cutter", schedule).allItems.map((i) => i.unitId),
    ["u-1"],
  );
  assert.deepEqual(
    selectFactoryScheduleView("assembler", schedule).allItems.map((i) => i.unitId),
    ["u-2"],
  );
  assert.deepEqual(
    selectFactoryScheduleView("qc", schedule).allItems.map((i) => i.unitId),
    ["u-3"],
  );
});

test("empty schedule projects to empty without throwing", () => {
  const view = selectFactoryScheduleView("cutter", {
    allItems: [],
    currentWorkDate: CURRENT_WORK_DATE,
  });
  assert.deepEqual(view, { currentWorkDate: CURRENT_WORK_DATE, allItems: [] });
});
