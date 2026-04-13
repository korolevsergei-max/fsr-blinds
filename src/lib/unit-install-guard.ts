import type { UnitStatus } from "@/lib/types";

/** Installation window photos are allowed only after measurement, bracketing, and manufacturing are complete. */
export function canUploadInstallationPhotos(status: UnitStatus | string): boolean {
  return status === "manufactured" || status === "installed";
}
