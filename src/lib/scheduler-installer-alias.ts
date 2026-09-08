import type { Installer } from "./types.ts";

/**
 * Two different things put a scheduler into an installer-shaped list, and they must never
 * be confused (see docs/SCHEDULER_AS_INSTALLER.md):
 *
 *  - An **alias row** is a real `installers` row (`inst-sa-<schedulerId>`) mirroring a
 *    scheduler, maintained by a DB trigger. It is a genuine FK target, so assigning it
 *    sets `units.assigned_installer_id` for real. It is never a login.
 *  - A **coordinator pick** is the synthetic `sch-<schedulerId>` / `SC: <name>` row that
 *    `combineInstallersWithSchedulers()` injects. Assigning it records the unit's
 *    *coordinating scheduler* and clears the installer. Still a wanted feature — it backs
 *    the "Assign scheduler" screen — but it does not belong in an installer picker.
 */

/** True when this row is a scheduler's field-work identity rather than an installer login. */
export function isSchedulerAlias(installer: Pick<Installer, "schedulerAliasId">): boolean {
  return Boolean(installer.schedulerAliasId);
}

/** True for the synthetic coordinator pseudo-row, which is not a real `installers` row. */
export function isCoordinatorPick(installerId: string): boolean {
  return installerId.startsWith("sch-");
}

/** The rows an "assign an installer" picker should offer: real installers plus alias rows. */
export function selectableInstallers<T extends Pick<Installer, "id" | "schedulerAliasId">>(
  installers: T[]
): T[] {
  return installers.filter((i) => Boolean(i.id) && !isCoordinatorPick(i.id));
}

/** Caption for one row in an installer picker or directory card. */
export function installerPickerCaption(
  installer: Pick<Installer, "schedulerAliasId">
): string {
  return installer.schedulerAliasId ? "Scheduler · also installs" : "Installer";
}
