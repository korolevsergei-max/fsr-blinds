import assert from "node:assert/strict";
import test from "node:test";

import { createDatasetStore, type DatasetSnapshot } from "./dataset-store.ts";
import type { AppDataset } from "./app-dataset.ts";
import type { AppUser } from "./auth.ts";

function emptyDataset(): AppDataset {
  return {
    clients: [],
    buildings: [],
    units: [],
    rooms: [],
    windows: [],
    installers: [],
    schedule: [],
    cutters: [],
    schedulers: [],
    manufacturingEscalations: [],
    postInstallIssues: [],
  };
}

const USER: AppUser = {
  id: "user-1",
  email: "owner@example.com",
  role: "owner",
  displayName: "Owner",
};

function makeSnapshot(overrides: Partial<DatasetSnapshot> = {}): DatasetSnapshot {
  return {
    data: emptyDataset(),
    user: USER,
    linkedEntityId: null,
    isHydratingInitialData: false,
    lastUpdated: 0,
    ...overrides,
  };
}

test("patch touching only one slice preserves references of unchanged slices", () => {
  const store = createDatasetStore(makeSnapshot());
  const before = store.getSnapshot();

  // Patch only `windows`; every other slice keeps its reference.
  store.patchData((prev) => ({ ...prev, windows: [] }));
  const after = store.getSnapshot();

  // The changed slice is a new reference...
  assert.notStrictEqual(after.data.windows, before.data.windows);
  // ...while untouched slices keep the SAME reference — this is what powers the
  // per-slice `useSyncExternalStoreWithSelector` bailout in dataset-context.tsx.
  assert.strictEqual(after.data.clients, before.data.clients);
  assert.strictEqual(after.data.units, before.data.units);
  assert.strictEqual(after.data.schedule, before.data.schedule);
  assert.strictEqual(after.data.cutters, before.data.cutters);
  // A new top-level snapshot is allocated, and lastUpdated advances.
  assert.notStrictEqual(after, before);
  assert.ok(after.lastUpdated > before.lastUpdated);
});

test("patch returning the same data reference is a no-op (no emit)", () => {
  const store = createDatasetStore(makeSnapshot());
  let notifications = 0;
  store.subscribe(() => {
    notifications += 1;
  });
  const before = store.getSnapshot();

  store.patchData((prev) => prev); // Object.is(next, prev) short-circuit

  assert.strictEqual(notifications, 0);
  assert.strictEqual(store.getSnapshot(), before);
});

test("patch notifies subscribers and clears the hydrating flag", () => {
  const store = createDatasetStore(makeSnapshot({ isHydratingInitialData: true }));
  let notifications = 0;
  const unsubscribe = store.subscribe(() => {
    notifications += 1;
  });

  store.patchData((prev) => ({ ...prev, units: [] }));

  assert.strictEqual(notifications, 1);
  assert.strictEqual(store.getSnapshot().isHydratingInitialData, false);

  unsubscribe();
  store.patchData((prev) => ({ ...prev, units: [] }));
  assert.strictEqual(notifications, 1); // no longer subscribed
});

test("setData replaces the dataset and clears the hydrating flag", () => {
  const store = createDatasetStore(makeSnapshot({ isHydratingInitialData: true }));
  const next = emptyDataset();

  store.setData(next);

  assert.strictEqual(store.getSnapshot().data, next);
  assert.strictEqual(store.getSnapshot().isHydratingInitialData, false);
});

test("syncMeta updates identity only when it changes and preserves the data reference", () => {
  const store = createDatasetStore(makeSnapshot());
  const before = store.getSnapshot();
  let notifications = 0;
  store.subscribe(() => {
    notifications += 1;
  });

  // No-op when user + linkedEntityId are unchanged.
  store.syncMeta(USER, null);
  assert.strictEqual(notifications, 0);
  assert.strictEqual(store.getSnapshot(), before);

  // Real change emits, swaps the snapshot, but keeps the data slice reference.
  store.syncMeta(USER, "scheduler-9");
  const after = store.getSnapshot();
  assert.strictEqual(notifications, 1);
  assert.strictEqual(after.linkedEntityId, "scheduler-9");
  assert.strictEqual(after.data, before.data);
});
