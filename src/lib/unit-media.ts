import type { UnitStageMediaItem } from "./server-data";

export type WindowStageDisplaySet = {
  windowId: string;
  roomName: string;
  windowName: string;
  before: UnitStageMediaItem | null;
  bracketed: UnitStageMediaItem | null;
  installed: UnitStageMediaItem | null;
};

function isPostBracketing(item: UnitStageMediaItem): boolean {
  return /post-bracketing/i.test(item.label ?? "");
}

function getWindowDisplayName(item: UnitStageMediaItem): string {
  return item.windowLabel ?? item.label ?? "Window";
}

export function buildWindowStageDisplaySets(
  items: UnitStageMediaItem[]
): WindowStageDisplaySet[] {
  const byWindow = new Map<string, WindowStageDisplaySet>();

  for (const item of items) {
    if (!item.windowId) continue;

    const current = byWindow.get(item.windowId) ?? {
      windowId: item.windowId,
      roomName: item.roomName ?? "Unassigned Room",
      windowName: getWindowDisplayName(item),
      before: null,
      bracketed: null,
      installed: null,
    };

    if (item.stage === "scheduled_bracketing") {
      if (!current.before) current.before = item;
    } else if (item.stage === "bracketed_measured") {
      if (isPostBracketing(item)) {
        if (!current.bracketed) current.bracketed = item;
      } else if (!current.before) {
        current.before = item;
      }
    } else if (item.stage === "installed_pending_approval") {
      if (!current.installed) current.installed = item;
    }

    byWindow.set(item.windowId, current);
  }

  return Array.from(byWindow.values()).sort((a, b) => {
    const roomCompare = a.roomName.localeCompare(b.roomName);
    return roomCompare !== 0 ? roomCompare : a.windowName.localeCompare(b.windowName);
  });
}

export function countDisplayableUnitPhotos(items: UnitStageMediaItem[]): number {
  return buildWindowStageDisplaySets(items).reduce((sum, entry) => {
    return sum + Number(Boolean(entry.before)) + Number(Boolean(entry.bracketed)) + Number(Boolean(entry.installed));
  }, 0);
}
