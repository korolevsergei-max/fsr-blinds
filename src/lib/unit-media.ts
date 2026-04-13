import type { UnitStageMediaItem } from "./server-data";
import type { Room, Window } from "./types";

export type UnitEvidencePhotoStage =
  | "measurement"
  | "post_bracketing"
  | "installed"
  | "room_finished";

export type UnitEvidencePhoto = {
  id: string;
  publicUrl: string;
  title: string;
  caption: string;
  createdAt: string | null;
  source: "media" | "legacy";
  stage: UnitEvidencePhotoStage;
  roomId: string | null;
  roomName: string | null;
  windowId: string | null;
  windowName: string | null;
};

export type UnitEvidenceWindow = {
  windowId: string;
  roomId: string;
  roomName: string;
  windowName: string;
  blindType: Window["blindType"];
  measured: boolean;
  bracketed: boolean;
  installed: boolean;
  measurementPhotos: UnitEvidencePhoto[];
  postBracketingPhotos: UnitEvidencePhoto[];
  installedPhotos: UnitEvidencePhoto[];
};

export type UnitEvidenceRoom = {
  roomId: string;
  roomName: string;
  roomFinishedPhotos: UnitEvidencePhoto[];
  windows: UnitEvidenceWindow[];
  counts: {
    totalWindows: number;
    measuredWindows: number;
    postBracketingEvidenceWindows: number;
    installedEvidenceWindows: number;
  };
};

export type UnitMediaOverview = {
  rooms: UnitEvidenceRoom[];
  summary: {
    totalWindows: number;
    measuredWindows: number;
    measurementEvidenceWindows: number;
    postBracketingEvidenceWindows: number;
    installedEvidenceWindows: number;
    roomFinishedPhotos: number;
    totalDisplayablePhotos: number;
  };
};

function getWindowDisplayName(windowItem: Window | null, item?: UnitStageMediaItem): string {
  return windowItem?.label ?? item?.windowLabel ?? item?.label ?? "Window";
}

function getRoomDisplayName(room: Room | null, item?: UnitStageMediaItem): string {
  return room?.name ?? item?.roomName ?? "Unassigned room";
}

function sortNewestFirst(a: { createdAt: string | null }, b: { createdAt: string | null }) {
  return new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime();
}

function getPhotoCaption(
  stage: UnitEvidencePhotoStage,
  source: UnitEvidencePhoto["source"]
): string {
  if (stage === "room_finished") return "Room-finished evidence";
  if (stage === "measurement") {
    return source === "legacy" ? "Legacy measurement photo" : "Measurement evidence";
  }
  if (stage === "post_bracketing") return "Post-bracketing evidence";
  return "Installation evidence";
}

function mapStage(stage: UnitStageMediaItem["stage"]): UnitEvidencePhotoStage {
  if (stage === "scheduled_bracketing") return "measurement";
  if (stage === "bracketed_measured") return "post_bracketing";
  return "installed";
}

function buildPhotoTitle(
  stage: UnitEvidencePhotoStage,
  roomName: string | null,
  windowName: string | null
): string {
  const subject = windowName ?? roomName ?? "Photo";
  if (stage === "measurement") return `${subject} measurement photo`;
  if (stage === "post_bracketing") return `${subject} post-bracketing photo`;
  if (stage === "installed") return `${subject} installed photo`;
  return `${subject} room-finished photo`;
}

type BuildUnitMediaOverviewArgs = {
  items: UnitStageMediaItem[];
  rooms?: Room[];
  windows?: Window[];
};

export function buildUnitMediaOverview({
  items,
  rooms = [],
  windows = [],
}: BuildUnitMediaOverviewArgs): UnitMediaOverview {
  const roomOrder = new Map<string, number>(rooms.map((room, index) => [room.id, index]));
  const windowOrder = new Map<string, number>(windows.map((windowItem, index) => [windowItem.id, index]));
  const roomMap = new Map<string, UnitEvidenceRoom>();
  const windowMap = new Map<string, UnitEvidenceWindow>();
  const windowsByRoom = new Map<string, UnitEvidenceWindow[]>();
  const roomMeta = new Map<string, Room>(rooms.map((room) => [room.id, room]));
  const windowMeta = new Map<string, Window>(windows.map((windowItem) => [windowItem.id, windowItem]));

  function ensureRoom(roomId: string | null, fallback?: UnitStageMediaItem): UnitEvidenceRoom | null {
    if (!roomId) return null;
    const existing = roomMap.get(roomId);
    if (existing) return existing;

    const room = roomMeta.get(roomId) ?? null;
    const next: UnitEvidenceRoom = {
      roomId,
      roomName: getRoomDisplayName(room, fallback),
      roomFinishedPhotos: [],
      windows: [],
      counts: {
        totalWindows: 0,
        measuredWindows: 0,
        postBracketingEvidenceWindows: 0,
        installedEvidenceWindows: 0,
      },
    };
    roomMap.set(roomId, next);
    return next;
  }

  function ensureWindow(windowId: string, fallback?: UnitStageMediaItem): UnitEvidenceWindow {
    const existing = windowMap.get(windowId);
    if (existing) return existing;

    const windowItem = windowMeta.get(windowId) ?? null;
    const roomId = windowItem?.roomId ?? fallback?.roomId ?? "unassigned-room";
    const room = ensureRoom(roomId, fallback);
    const roomName = room?.roomName ?? getRoomDisplayName(null, fallback);

    const next: UnitEvidenceWindow = {
      windowId,
      roomId,
      roomName,
      windowName: getWindowDisplayName(windowItem, fallback),
      blindType: windowItem?.blindType ?? "screen",
      measured: windowItem?.measured ?? false,
      bracketed: windowItem?.bracketed ?? false,
      installed: windowItem?.installed ?? false,
      measurementPhotos: [],
      postBracketingPhotos: [],
      installedPhotos: [],
    };
    windowMap.set(windowId, next);

    const roomWindows = windowsByRoom.get(roomId) ?? [];
    roomWindows.push(next);
    windowsByRoom.set(roomId, roomWindows);
    return next;
  }

  for (const room of rooms) {
    ensureRoom(room.id);
  }

  for (const windowItem of windows) {
    ensureWindow(windowItem.id);
  }

  for (const item of items) {
    if (item.uploadKind === "room_finished_photo") {
      const room = ensureRoom(item.roomId, item);
      if (!room) continue;
      room.roomFinishedPhotos.push({
        id: item.id,
        publicUrl: item.publicUrl,
        title: buildPhotoTitle("room_finished", room.roomName, null),
        caption: getPhotoCaption("room_finished", "media"),
        createdAt: item.createdAt,
        source: "media",
        stage: "room_finished",
        roomId: room.roomId,
        roomName: room.roomName,
        windowId: null,
        windowName: null,
      });
      continue;
    }

    if (!item.windowId) continue;
    const windowGroup = ensureWindow(item.windowId, item);
    const mappedStage = mapStage(item.stage);
    const roomName = windowGroup.roomName;
    const windowName = windowGroup.windowName;
    const photo: UnitEvidencePhoto = {
      id: item.id,
      publicUrl: item.publicUrl,
      title: item.label?.trim() || buildPhotoTitle(mappedStage, roomName, windowName),
      caption: getPhotoCaption(mappedStage, "media"),
      createdAt: item.createdAt,
      source: "media",
      stage: mappedStage,
      roomId: windowGroup.roomId,
      roomName,
      windowId: windowGroup.windowId,
      windowName,
    };

    if (mappedStage === "measurement") {
      windowGroup.measurementPhotos.push(photo);
    } else if (mappedStage === "post_bracketing") {
      windowGroup.postBracketingPhotos.push(photo);
    } else {
      windowGroup.installedPhotos.push(photo);
    }
  }

  for (const windowItem of windows) {
    const group = ensureWindow(windowItem.id);
    if (group.measurementPhotos.length > 0 || !windowItem.photoUrl) continue;
    group.measurementPhotos.push({
      id: `legacy-${windowItem.id}`,
      publicUrl: windowItem.photoUrl,
      title: buildPhotoTitle("measurement", group.roomName, group.windowName),
      caption: getPhotoCaption("measurement", "legacy"),
      createdAt: null,
      source: "legacy",
      stage: "measurement",
      roomId: group.roomId,
      roomName: group.roomName,
      windowId: group.windowId,
      windowName: group.windowName,
    });
  }

  const orderedRooms = Array.from(roomMap.values())
    .map((room) => {
      const roomWindows = (windowsByRoom.get(room.roomId) ?? []).sort((a, b) => {
        return (windowOrder.get(a.windowId) ?? Number.MAX_SAFE_INTEGER) - (windowOrder.get(b.windowId) ?? Number.MAX_SAFE_INTEGER);
      });

      for (const windowGroup of roomWindows) {
        windowGroup.measurementPhotos.sort(sortNewestFirst);
        windowGroup.postBracketingPhotos.sort(sortNewestFirst);
        windowGroup.installedPhotos.sort(sortNewestFirst);
      }
      room.roomFinishedPhotos.sort(sortNewestFirst);

      const counts = {
        totalWindows: roomWindows.length,
        measuredWindows: roomWindows.filter((windowGroup) => windowGroup.measured).length,
        postBracketingEvidenceWindows: roomWindows.filter(
          (windowGroup) => windowGroup.postBracketingPhotos.length > 0
        ).length,
        installedEvidenceWindows: roomWindows.filter(
          (windowGroup) => windowGroup.installedPhotos.length > 0
        ).length,
      };

      return {
        ...room,
        windows: roomWindows,
        counts,
      };
    })
    .sort((a, b) => {
      return (roomOrder.get(a.roomId) ?? Number.MAX_SAFE_INTEGER) - (roomOrder.get(b.roomId) ?? Number.MAX_SAFE_INTEGER);
    });

  const totalWindows = orderedRooms.reduce((sum, room) => sum + room.counts.totalWindows, 0);
  const summary = {
    totalWindows,
    measuredWindows: orderedRooms.reduce((sum, room) => sum + room.counts.measuredWindows, 0),
    measurementEvidenceWindows: orderedRooms.reduce(
      (sum, room) =>
        sum +
        room.windows.filter((windowGroup) => windowGroup.measurementPhotos.length > 0).length,
      0
    ),
    postBracketingEvidenceWindows: orderedRooms.reduce(
      (sum, room) => sum + room.counts.postBracketingEvidenceWindows,
      0
    ),
    installedEvidenceWindows: orderedRooms.reduce(
      (sum, room) => sum + room.counts.installedEvidenceWindows,
      0
    ),
    roomFinishedPhotos: orderedRooms.reduce(
      (sum, room) => sum + room.roomFinishedPhotos.length,
      0
    ),
    totalDisplayablePhotos: orderedRooms.reduce(
      (sum, room) =>
        sum +
        room.roomFinishedPhotos.length +
        room.windows.reduce(
          (windowSum, windowGroup) =>
            windowSum +
            windowGroup.measurementPhotos.length +
            windowGroup.postBracketingPhotos.length +
            windowGroup.installedPhotos.length,
          0
        ),
      0
    ),
  };

  return {
    rooms: orderedRooms,
    summary,
  };
}

export function countDisplayableUnitPhotos(
  items: UnitStageMediaItem[],
  options?: {
    rooms?: Room[];
    windows?: Window[];
  }
): number {
  return buildUnitMediaOverview({
    items,
    rooms: options?.rooms,
    windows: options?.windows,
  }).summary.totalDisplayablePhotos;
}
