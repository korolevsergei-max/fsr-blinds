import type { UnitStatus } from "@/lib/types";

/** Installation window photos are allowed only after both measurement and bracketing are complete for the unit. */
export function canUploadInstallationPhotos(status: UnitStatus | string): boolean {
  return status === "measured_and_bracketed" || status === "installed";
}
