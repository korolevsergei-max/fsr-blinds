/**
 * Pure helpers for escalation target resolution.
 * Kept separate so they can be tested without UI rendering.
 */

/**
 * Returns the deep-link href for an escalation item based on the window's
 * current stage. Navigation priority:
 *   installed  → /installed page
 *   bracketed  → /bracketing page
 *   otherwise  → measurement/edit page (windows/new?edit=...)
 */
export function resolveEscalationHref(
  item: { windowId: string; roomId: string },
  windows: ReadonlyArray<{ id: string; installed: boolean; bracketed: boolean }>,
  unitId: string,
  routeBasePath: string
): string {
  const win = windows.find((w) => w.id === item.windowId);
  if (win?.installed) {
    return `${routeBasePath}/${unitId}/rooms/${item.roomId}/windows/${item.windowId}/installed`;
  }
  if (win?.bracketed) {
    return `${routeBasePath}/${unitId}/rooms/${item.roomId}/windows/${item.windowId}/bracketing`;
  }
  return `${routeBasePath}/${unitId}/rooms/${item.roomId}/windows/new?edit=${item.windowId}`;
}

/**
 * Pure helper for actor attribution used in field-work mutations.
 * Maps a caller role to the activity-log actor role string.
 *   "owner"     → "owner"
 *   "scheduler" → "scheduler"
 *   anything else → "installer"
 */
export function resolveActorRole(callerRole: string): "owner" | "scheduler" | "installer" {
  if (callerRole === "owner") return "owner";
  if (callerRole === "scheduler") return "scheduler";
  return "installer";
}
