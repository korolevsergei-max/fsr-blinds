import assert from "node:assert/strict";
import test from "node:test";
import type { Room, Window } from "./types.ts";
import type { UnitStageMediaItem } from "./server-data.ts";
import {
  buildUnitMediaOverview,
  countDisplayableUnitPhotos,
} from "./unit-media.ts";

function makeRoom(overrides: Partial<Room> = {}): Room {
  return {
    id: "room-1",
    unitId: "unit-1",
    name: "Bedroom 1",
    windowCount: 1,
    completedWindows: 0,
    ...overrides,
  };
}

function makeWindow(overrides: Partial<Window> = {}): Window {
  return {
    id: "window-1",
    roomId: "room-1",
    label: "Window 1",
    blindType: "screen",
    chainSide: "left",
    riskFlag: "green",
    width: 40,
    height: 70,
    depth: 4,
    blindWidth: null,
    blindHeight: null,
    blindDepth: null,
    notes: "",
    photoUrl: null,
    measured: false,
    bracketed: false,
    installed: false,
    ...overrides,
  };
}

function makeItem(overrides: Partial<UnitStageMediaItem> = {}): UnitStageMediaItem {
  return {
    id: "media-1",
    publicUrl: "https://example.com/photo.jpg",
    label: "Window 1",
    unitId: "unit-1",
    roomId: "room-1",
    roomName: "Bedroom 1",
    windowId: "window-1",
    windowLabel: "Window 1",
    uploadKind: "window_measure",
    stage: "scheduled_bracketing",
    createdAt: "2026-04-13T10:00:00.000Z",
    ...overrides,
  };
}

test("buildUnitMediaOverview uses legacy measurement photos when no media row exists", () => {
  const room = makeRoom();
  const windowItem = makeWindow({
    measured: true,
    photoUrl: "https://example.com/legacy-measurement.jpg",
  });

  const overview = buildUnitMediaOverview({
    items: [],
    rooms: [room],
    windows: [windowItem],
  });

  assert.equal(overview.rooms[0].windows[0].measurementPhotos.length, 1);
  assert.equal(overview.rooms[0].windows[0].measurementPhotos[0].source, "legacy");
  assert.equal(overview.summary.totalDisplayablePhotos, 1);
});

test("buildUnitMediaOverview keeps multiple post-bracketing photos per window", () => {
  const room = makeRoom();
  const windowItem = makeWindow({ measured: true, bracketed: true });
  const items = [
    makeItem({
      id: "post-1",
      stage: "bracketed_measured",
      label: "Window 1 - earlier",
      createdAt: "2026-04-13T09:00:00.000Z",
    }),
    makeItem({
      id: "post-2",
      stage: "bracketed_measured",
      label: "Window 1 - latest",
      createdAt: "2026-04-13T11:00:00.000Z",
    }),
  ];

  const overview = buildUnitMediaOverview({
    items,
    rooms: [room],
    windows: [windowItem],
  });

  assert.deepEqual(
    overview.rooms[0].windows[0].postBracketingPhotos.map((photo) => photo.id),
    ["post-2", "post-1"]
  );
  assert.equal(overview.summary.postBracketingEvidenceWindows, 1);
});

test("buildUnitMediaOverview keeps multiple installed photos per window", () => {
  const room = makeRoom();
  const windowItem = makeWindow({ measured: true, bracketed: true, installed: true });
  const items = [
    makeItem({
      id: "installed-1",
      stage: "installed_pending_approval",
      label: "Window 1 - install 1",
      createdAt: "2026-04-13T08:00:00.000Z",
    }),
    makeItem({
      id: "installed-2",
      stage: "installed_pending_approval",
      label: "Window 1 - install 2",
      createdAt: "2026-04-13T12:00:00.000Z",
    }),
  ];

  const overview = buildUnitMediaOverview({
    items,
    rooms: [room],
    windows: [windowItem],
  });

  assert.deepEqual(
    overview.rooms[0].windows[0].installedPhotos.map((photo) => photo.id),
    ["installed-2", "installed-1"]
  );
  assert.equal(overview.summary.installedEvidenceWindows, 1);
});

test("buildUnitMediaOverview includes room-finished photos alongside window evidence", () => {
  const room = makeRoom();
  const windowItem = makeWindow({ measured: true });
  const items = [
    makeItem({
      id: "measure-1",
      stage: "scheduled_bracketing",
      label: "Window 1 measurement",
    }),
    makeItem({
      id: "room-finished-1",
      windowId: null,
      windowLabel: null,
      uploadKind: "room_finished_photo",
      stage: "installed_pending_approval",
      label: "Finished room",
    }),
  ];

  const overview = buildUnitMediaOverview({
    items,
    rooms: [room],
    windows: [windowItem],
  });

  assert.equal(overview.rooms[0].roomFinishedPhotos.length, 1);
  assert.equal(overview.rooms[0].windows[0].measurementPhotos.length, 1);
  assert.equal(
    countDisplayableUnitPhotos(items, { rooms: [room], windows: [windowItem] }),
    2
  );
});

test("buildUnitMediaOverview preserves windows with no evidence yet", () => {
  const room = makeRoom();
  const windowItem = makeWindow();

  const overview = buildUnitMediaOverview({
    items: [],
    rooms: [room],
    windows: [windowItem],
  });

  assert.equal(overview.rooms.length, 1);
  assert.equal(overview.rooms[0].windows.length, 1);
  assert.equal(overview.rooms[0].windows[0].measurementPhotos.length, 0);
  assert.equal(overview.rooms[0].windows[0].postBracketingPhotos.length, 0);
  assert.equal(overview.rooms[0].windows[0].installedPhotos.length, 0);
  assert.equal(overview.summary.totalDisplayablePhotos, 0);
});
