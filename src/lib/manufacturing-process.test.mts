import assert from "node:assert/strict";
import test from "node:test";

import {
  aggregateManufacturingProcessRows,
  buildManufacturingProcessRows,
  filterManufacturingProcessRows,
  getManufacturingProcessFilterOptions,
  scopeManufacturingProcessUnits,
  sortManufacturingProcessRows,
  type ManufacturingProcessUnitInput,
} from "./manufacturing-process-core.ts";

function createUnit(
  overrides: Partial<ManufacturingProcessUnitInput> = {}
): ManufacturingProcessUnitInput {
  return {
    id: "unit-1",
    clientId: "client-1",
    clientName: "Client One",
    buildingId: "building-1",
    buildingName: "Building One",
    unitNumber: "101",
    completeByDate: "2026-05-01",
    totalBlinds: 3,
    assignedInstallerId: "installer-1",
    ...overrides,
  };
}

test("buildManufacturingProcessRows treats units with no production rows as zero completed", () => {
  const [row] = buildManufacturingProcessRows([createUnit()], [], []);

  assert.equal(row.totalBlinds, 3);
  assert.equal(row.cutCount, 0);
  assert.equal(row.assembledCount, 0);
  assert.equal(row.qcCount, 0);
  assert.equal(row.installedCount, 0);
  assert.equal(row.isInstalled, false);
});

test("buildManufacturingProcessRows handles partial cut and assembly progress", () => {
  const [row] = buildManufacturingProcessRows(
    [createUnit()],
    [
      { unitId: "unit-1", status: "cut" },
      { unitId: "unit-1", status: "assembled" },
    ],
    []
  );

  assert.equal(row.cutCount, 2);
  assert.equal(row.assembledCount, 1);
  assert.equal(row.qcCount, 0);
  assert.equal(row.installedCount, 0);
});

test("buildManufacturingProcessRows marks fully QC-approved units as completed through QC", () => {
  const [row] = buildManufacturingProcessRows(
    [createUnit({ totalBlinds: 2 })],
    [
      { unitId: "unit-1", status: "qc_approved" },
      { unitId: "unit-1", status: "qc_approved" },
    ],
    []
  );

  assert.equal(row.cutCount, 2);
  assert.equal(row.assembledCount, 2);
  assert.equal(row.qcCount, 2);
  assert.equal(row.installedCount, 0);
  assert.equal(row.isInstalled, false);
});

test("buildManufacturingProcessRows marks fully installed units complete", () => {
  const [row] = buildManufacturingProcessRows(
    [createUnit({ totalBlinds: 2 })],
    [
      { unitId: "unit-1", status: "qc_approved" },
      { unitId: "unit-1", status: "qc_approved" },
    ],
    ["unit-1", "unit-1"]
  );

  assert.equal(row.cutCount, 2);
  assert.equal(row.assembledCount, 2);
  assert.equal(row.qcCount, 2);
  assert.equal(row.installedCount, 2);
  assert.equal(row.isInstalled, true);
});

test("buildManufacturingProcessRows applies the legacy installed fallback when QC rows are missing", () => {
  const [row] = buildManufacturingProcessRows(
    [createUnit({ totalBlinds: 2 })],
    [],
    ["unit-1", "unit-1"]
  );

  assert.equal(row.qcCount, 2);
  assert.equal(row.installedCount, 2);
  assert.equal(row.isInstalled, true);
});

test("scopeManufacturingProcessUnits respects owner, scheduler, and installer visibility", () => {
  const units = [
    createUnit({ id: "unit-1", assignedInstallerId: "installer-1" }),
    createUnit({ id: "unit-2", assignedInstallerId: "installer-2" }),
    createUnit({ id: "unit-3", assignedInstallerId: null }),
  ];

  assert.deepEqual(
    scopeManufacturingProcessUnits(units, { role: "owner" }).map((unit) => unit.id),
    ["unit-1", "unit-2", "unit-3"]
  );
  assert.deepEqual(
    scopeManufacturingProcessUnits(units, {
      role: "scheduler",
      scopedUnitIds: ["unit-2", "unit-3"],
    }).map((unit) => unit.id),
    ["unit-2", "unit-3"]
  );
  assert.deepEqual(
    scopeManufacturingProcessUnits(units, {
      role: "installer",
      installerId: "installer-1",
    }).map((unit) => unit.id),
    ["unit-1"]
  );
});

test("manufacturing process filter helpers narrow buildings, floors, and install state", () => {
  const rows = buildManufacturingProcessRows(
    [
      createUnit({
        id: "unit-1",
        clientId: "client-1",
        clientName: "Client One",
        buildingId: "building-1",
        buildingName: "Alpha",
        unitNumber: "101",
        totalBlinds: 2,
      }),
      createUnit({
        id: "unit-2",
        clientId: "client-1",
        clientName: "Client One",
        buildingId: "building-2",
        buildingName: "Beta",
        unitNumber: "201",
        completeByDate: "2026-05-02",
        totalBlinds: 2,
      }),
      createUnit({
        id: "unit-3",
        clientId: "client-2",
        clientName: "Client Two",
        buildingId: "building-3",
        buildingName: "Gamma",
        unitNumber: "301",
        completeByDate: null,
        totalBlinds: 1,
      }),
    ],
    [{ unitId: "unit-2", status: "qc_approved" }, { unitId: "unit-2", status: "qc_approved" }],
    ["unit-2", "unit-2"]
  );

  const clientScoped = getManufacturingProcessFilterOptions(rows, "client-1", "all");
  assert.deepEqual(clientScoped.buildings.map((option) => option.label), ["Alpha", "Beta"]);

  const buildingScoped = getManufacturingProcessFilterOptions(rows, "client-1", "building-2");
  assert.deepEqual(buildingScoped.floors, ["2"]);

  const installedOnly = filterManufacturingProcessRows(rows, {
    clientId: "all",
    buildingId: "all",
    floor: "all",
    installStatus: "installed",
    installReadyOnly: false,
    completeByDate: "",
  });
  assert.deepEqual(installedOnly.map((row) => row.unitId), ["unit-2"]);

  const notInstalledOnFloorOne = filterManufacturingProcessRows(rows, {
    clientId: "client-1",
    buildingId: "building-1",
    floor: "1",
    installStatus: "not_installed",
    installReadyOnly: false,
    completeByDate: "",
  });
  assert.deepEqual(notInstalledOnFloorOne.map((row) => row.unitId), ["unit-1"]);

  const completeByFiltered = filterManufacturingProcessRows(rows, {
    clientId: "all",
    buildingId: "all",
    floor: "all",
    installStatus: "all",
    installReadyOnly: false,
    completeByDate: "2026-05-02",
  });
  assert.deepEqual(completeByFiltered.map((row) => row.unitId), ["unit-2"]);
});

test("manufacturing process install ready filter only keeps units with more QC than installed", () => {
  const rows = buildManufacturingProcessRows(
    [
      createUnit({
        id: "unit-1",
        buildingId: "building-1",
        buildingName: "Alpha",
        unitNumber: "101",
        totalBlinds: 3,
      }),
      createUnit({
        id: "unit-2",
        buildingId: "building-1",
        buildingName: "Alpha",
        unitNumber: "102",
        totalBlinds: 2,
      }),
      createUnit({
        id: "unit-3",
        buildingId: "building-1",
        buildingName: "Alpha",
        unitNumber: "103",
        totalBlinds: 2,
      }),
      createUnit({
        id: "unit-4",
        buildingId: "building-2",
        buildingName: "Beta",
        unitNumber: "201",
        totalBlinds: 2,
        completeByDate: "2026-05-03",
      }),
    ],
    [
      { unitId: "unit-1", status: "qc_approved" },
      { unitId: "unit-1", status: "qc_approved" },
      { unitId: "unit-1", status: "qc_approved" },
      { unitId: "unit-2", status: "qc_approved" },
      { unitId: "unit-2", status: "qc_approved" },
      { unitId: "unit-4", status: "qc_approved" },
      { unitId: "unit-4", status: "qc_approved" },
    ],
    ["unit-2", "unit-2", "unit-4"]
  );

  const installReadyOnly = filterManufacturingProcessRows(rows, {
    clientId: "all",
    buildingId: "all",
    floor: "all",
    installStatus: "all",
    installReadyOnly: true,
    completeByDate: "",
  });
  assert.deepEqual(installReadyOnly.map((row) => row.unitId), ["unit-1", "unit-4"]);

  const installReadyInBuildingTwo = filterManufacturingProcessRows(rows, {
    clientId: "all",
    buildingId: "building-2",
    floor: "2",
    installStatus: "not_installed",
    installReadyOnly: true,
    completeByDate: "2026-05-03",
  });
  assert.deepEqual(installReadyInBuildingTwo.map((row) => row.unitId), ["unit-4"]);

  const groupedInstallReady = aggregateManufacturingProcessRows(installReadyOnly);
  assert.deepEqual(groupedInstallReady.map((row) => row.groupKey), [
    "client-1::building-1::1",
    "client-1::building-2::2",
  ]);
  assert.equal(groupedInstallReady[0]?.totalBlinds, 3);
  assert.equal(groupedInstallReady[0]?.qcCount, 3);
  assert.equal(groupedInstallReady[0]?.installedCount, 0);
  assert.equal(groupedInstallReady[1]?.totalBlinds, 2);
  assert.equal(groupedInstallReady[1]?.qcCount, 2);
  assert.equal(groupedInstallReady[1]?.installedCount, 1);
});

test("aggregateManufacturingProcessRows groups by client building and floor with earliest due date", () => {
  const rows = buildManufacturingProcessRows(
    [
      createUnit({
        id: "unit-1",
        clientId: "client-1",
        buildingId: "building-1",
        buildingName: "Alpha",
        unitNumber: "401",
        completeByDate: "2026-05-10",
        totalBlinds: 4,
      }),
      createUnit({
        id: "unit-2",
        clientId: "client-1",
        buildingId: "building-1",
        buildingName: "Alpha",
        unitNumber: "402",
        completeByDate: "2026-05-02",
        totalBlinds: 6,
      }),
      createUnit({
        id: "unit-3",
        clientId: "client-2",
        clientName: "Client Two",
        buildingId: "building-1",
        buildingName: "Alpha",
        unitNumber: "403",
        completeByDate: "2026-05-01",
        totalBlinds: 2,
      }),
    ],
    [
      { unitId: "unit-1", status: "assembled" },
      { unitId: "unit-2", status: "qc_approved" },
      { unitId: "unit-2", status: "qc_approved" },
    ],
    ["unit-2"]
  );

  const grouped = aggregateManufacturingProcessRows(rows);

  assert.equal(grouped.length, 2);
  assert.equal(grouped[0]?.clientId, "client-1");
  assert.equal(grouped[0]?.buildingId, "building-1");
  assert.equal(grouped[0]?.floor, "4");
  assert.equal(grouped[0]?.completeByDate, "2026-05-02");
  assert.equal(grouped[0]?.totalBlinds, 10);
  assert.equal(grouped[0]?.cutCount, 3);
  assert.equal(grouped[0]?.assembledCount, 3);
  assert.equal(grouped[0]?.qcCount, 2);
  assert.equal(grouped[0]?.installedCount, 1);
  assert.equal(grouped[0]?.unitCount, 2);
});

test("aggregateManufacturingProcessRows can group by building and floor without client splits", () => {
  const rows = buildManufacturingProcessRows(
    [
      createUnit({
        id: "unit-1",
        clientId: "client-1",
        clientName: "Client One",
        buildingId: "building-1",
        buildingName: "Alpha",
        unitNumber: "401",
        completeByDate: "2026-05-10",
        totalBlinds: 4,
      }),
      createUnit({
        id: "unit-2",
        clientId: "client-2",
        clientName: "Client Two",
        buildingId: "building-1",
        buildingName: "Alpha",
        unitNumber: "402",
        completeByDate: "2026-05-02",
        totalBlinds: 6,
      }),
    ],
    [{ unitId: "unit-2", status: "qc_approved" }],
    []
  );

  const grouped = aggregateManufacturingProcessRows(rows, "building_floor");

  assert.equal(grouped.length, 1);
  assert.equal(grouped[0]?.buildingId, "building-1");
  assert.equal(grouped[0]?.floor, "4");
  assert.equal(grouped[0]?.completeByDate, "2026-05-02");
  assert.equal(grouped[0]?.totalBlinds, 10);
  assert.equal(grouped[0]?.cutCount, 1);
  assert.equal(grouped[0]?.assembledCount, 1);
  assert.equal(grouped[0]?.qcCount, 1);
  assert.equal(grouped[0]?.installedCount, 0);
  assert.equal(grouped[0]?.unitCount, 2);
});

test("sortManufacturingProcessRows sorts unit progress by percentage before raw count", () => {
  const rows = buildManufacturingProcessRows(
    [
      createUnit({ id: "unit-1", unitNumber: "101", totalBlinds: 10 }),
      createUnit({ id: "unit-2", unitNumber: "102", totalBlinds: 2 }),
      createUnit({ id: "unit-3", unitNumber: "103", totalBlinds: 4 }),
    ],
    [
      { unitId: "unit-1", status: "cut" },
      { unitId: "unit-1", status: "cut" },
      { unitId: "unit-1", status: "cut" },
      { unitId: "unit-1", status: "cut" },
      { unitId: "unit-1", status: "cut" },
      { unitId: "unit-2", status: "cut" },
      { unitId: "unit-3", status: "cut" },
      { unitId: "unit-3", status: "cut" },
      { unitId: "unit-3", status: "cut" },
    ],
    []
  );

  const sorted = sortManufacturingProcessRows(rows, [{ field: "cutProgress", direction: "desc" }]);
  assert.deepEqual(
    sorted.map((row) => row.unitNumber),
    ["103", "101", "102"]
  );
});

test("sortManufacturingProcessRows sorts grouped floor rows deterministically without unit sort", () => {
  const grouped = aggregateManufacturingProcessRows(
    buildManufacturingProcessRows(
      [
        createUnit({
          id: "unit-1",
          clientId: "client-1",
          buildingId: "building-2",
          buildingName: "Beta",
          unitNumber: "201",
          totalBlinds: 2,
        }),
        createUnit({
          id: "unit-2",
          clientId: "client-1",
          buildingId: "building-1",
          buildingName: "Alpha",
          unitNumber: "201",
          totalBlinds: 2,
        }),
      ],
      [],
      []
    )
  );

  const sorted = sortManufacturingProcessRows(grouped, [{ field: "floor", direction: "asc" }]);
  assert.deepEqual(
    sorted.map((row) => `${row.clientId}:${row.buildingName}:${row.floor}`),
    ["client-1:Alpha:2", "client-1:Beta:2"]
  );
});
